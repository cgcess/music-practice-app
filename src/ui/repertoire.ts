import { config } from "../config";
import { todayLocal } from "../dates";
import { dueText } from "../sr/dueText";
import { h } from "./h";
import { icon } from "./icons";
import type { RepertoirePort, SongItem, SongSnapshot } from "./ports";
import { openSheet, type Sheet } from "./sheet";
import { createStrengthBar } from "./strengthBar";

export interface RepertoireEnv {
  /** Local date "YYYY-MM-DD". */
  today: () => string;
  /** One-shot callback; returns cancel. */
  after: (fn: () => void, ms: number) => () => void;
}

export const defaultRepertoireEnv: RepertoireEnv = {
  today: () => todayLocal(),
  after: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function repertoireView(
  port: RepertoirePort,
  env: RepertoireEnv = defaultRepertoireEnv,
): { el: HTMLElement; dispose: () => void } {
  let songs: SongItem[] = [];
  let perDay = config.songsPerDay;
  let sheet: Sheet | null = null;
  let cancelToast: (() => void) | null = null;
  let disposed = false;
  let deleting = false;

  const list = h("ul", { class: "song-list inset-list" });
  const empty = h("div", { class: "empty-card" }, "No songs yet. Tap + to add one, or use Bulk add.");
  const toast = h("div", { class: "toast", role: "status" });
  const valueEl = h("span", { class: "stepper-value", "aria-live": "polite" });
  const minus = h("button", { type: "button", class: "step", "aria-label": "Fewer songs per day", onClick: () => void step(-1) }, "−");
  const plus = h("button", { type: "button", class: "step", "aria-label": "More songs per day", onClick: () => void step(1) }, "+");
  const stepper = h("div", { class: "stepper", role: "group", "aria-label": "Songs per day" }, h("span", { class: "stepper-label" }, "Per day"), minus, valueEl, plus);
  const bulkBtn = h("button", { type: "button", class: "bulk-btn", onClick: () => openBulk() }, "Bulk add");
  const addBtn = h("button", { type: "button", class: "add-btn", "aria-label": "Add song", onClick: () => openAdd() }, icon("plus"));
  const strength = createStrengthBar();
  const el = h(
    "section",
    { class: "repertoire" },
    h(
      "header",
      { class: "large-header wash" },
      h("div", { class: "title-row" }, h("h1", { class: "large-title" }, "Repertoire"), h("div", { class: "title-actions" }, bulkBtn, addBtn)),
      strength.el,
      stepper,
    ),
    empty,
    list,
    toast,
  );

  const hideToast = () => {
    cancelToast?.();
    cancelToast = null;
    toast.classList.remove("show");
    toast.replaceChildren();
  };
  const showToast = (text: string, onUndo?: () => void) => {
    cancelToast?.();
    const kids = [h("span", null, onUndo ? `${text} · ` : text)];
    if (onUndo) kids.push(h("button", { type: "button", class: "undo", onClick: onUndo }, "Undo"));
    toast.replaceChildren(...kids);
    toast.classList.add("show");
    cancelToast = env.after(hideToast, config.today.undoMs);
  };

  const renderStepper = () => {
    valueEl.textContent = String(perDay);
    minus.disabled = perDay <= 0;
    plus.disabled = perDay >= config.maxSongsPerDay;
  };
  const render = () => {
    renderStepper();
    empty.hidden = songs.length > 0;
    list.hidden = songs.length === 0;
    const today = env.today();
    list.replaceChildren(
      ...songs.map((s) =>
        h(
          "li",
          { class: "song", "data-id": s.id },
          h(
            "button",
            { type: "button", class: "row-body", "aria-label": `Edit ${s.title}`, onClick: () => openEdit(s) },
            h("span", { class: "name" }, s.title),
            h("span", { class: "due" }, dueText(s.dueDate, today)),
            h("span", { class: "chev" }, icon("chevron")),
          ),
        ),
      ),
    );
  };
  const refreshStrength = (animate: boolean) => void strength.refresh(() => port.repertoireStrength(), animate);
  const reload = async () => {
    refreshStrength(true);
    songs = await port.listSongs();
    if (!disposed) render();
  };

  const step = async (d: number) => {
    const next = Math.min(config.maxSongsPerDay, Math.max(0, perDay + d));
    if (next === perDay) return;
    try {
      await port.setSongsPerDay(next);
      perDay = next;
    } catch (e) {
      showToast(msg(e, "Could not save"));
    }
    renderStepper();
  };

  const load = async () => {
    refreshStrength(false);
    try {
      perDay = await port.getSongsPerDay();
      songs = await port.listSongs();
    } catch (e) {
      showToast(msg(e, "Could not load songs"));
    }
    if (!disposed) render();
  };

  const field = (label: string, input: HTMLElement) => h("label", { class: "field" }, label, input);
  const actionsRow = (...btns: HTMLElement[]) =>
    h("div", { class: "sheet-actions" }, h("button", { type: "button", class: "cancel", onClick: () => sheet?.close() }, "Cancel"), ...btns);
  const open = (content: Node, title: string) => {
    sheet = openSheet(content, { title, onClose: () => (sheet = null) });
  };

  const openAdd = () => {
    if (sheet || disposed) return;
    const input = h("input", { type: "text", name: "title", id: "song-title", autocomplete: "off" });
    const err = h("p", { class: "error", role: "alert" });
    const form = h(
      "form",
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          void (async () => {
            if (!input.value.trim()) return void (err.textContent = "Title is required");
            try {
              await port.addSong(input.value);
            } catch (x) {
              return void (err.textContent = msg(x, "Could not add song"));
            }
            sheet?.close();
            await reload();
          })();
        },
      },
      field("Title", input),
      err,
      actionsRow(h("button", { type: "submit" }, "Add")),
    );
    open(form, "Add song");
  };

  const openBulk = () => {
    if (sheet || disposed) return;
    const ta = h("textarea", { name: "titles", id: "song-titles", rows: 8, autocomplete: "off" });
    const err = h("p", { class: "error", role: "alert" });
    const form = h(
      "form",
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          void (async () => {
            const titles = ta.value.split("\n");
            if (!titles.some((t) => t.trim())) return void (err.textContent = "Enter at least one title");
            let res;
            try {
              res = await port.addSongs(titles);
            } catch (x) {
              return void (err.textContent = msg(x, "Could not add songs"));
            }
            sheet?.close();
            await reload();
            showToast(
              res.error ? `Added ${res.added} before an error: ${res.error}` : `Added ${res.added}, skipped ${res.skipped}`,
            );
          })();
        },
      },
      field("One title per line", ta),
      err,
      actionsRow(h("button", { type: "submit" }, "Add all")),
    );
    open(form, "Bulk add");
  };

  const openEdit = (song: SongItem) => {
    if (sheet || disposed) return;
    deleting = false;
    const input = h("input", { type: "text", name: "title", id: "song-title", autocomplete: "off" });
    input.value = song.title;
    const err = h("p", { class: "error", role: "alert" });
    const del = h("button", { type: "button", class: "danger" }, "Delete");
    del.addEventListener("click", () => {
      void (async () => {
        if (deleting) return;
        deleting = true;
        del.disabled = true;
        let snap: SongSnapshot;
        try {
          snap = await port.deleteSong(song.id);
        } catch (x) {
          deleting = false;
          del.disabled = false;
          return void (err.textContent = msg(x, "Could not delete song"));
        }
        sheet?.close();
        showToast(`Deleted ${snap.title}`, () => void restore(snap));
        await reload();
        addBtn.focus();
      })();
    });
    const form = h(
      "form",
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          void (async () => {
            if (!input.value.trim()) return void (err.textContent = "Title is required");
            try {
              await port.renameSong(song.id, input.value);
            } catch (x) {
              return void (err.textContent = msg(x, "Could not save song"));
            }
            sheet?.close();
            await reload();
          })();
        },
      },
      field("Title", input),
      err,
      actionsRow(del, h("button", { type: "submit" }, "Save")),
    );
    open(form, "Edit song");
  };

  const restore = async (snap: SongSnapshot) => {
    hideToast();
    try {
      await port.restoreSong(snap);
    } catch (e) {
      showToast(msg(e, "Could not restore"));
      return;
    }
    await reload();
  };

  void load();

  return {
    el,
    dispose() {
      disposed = true;
      sheet?.close();
      cancelToast?.();
    },
  };
}
