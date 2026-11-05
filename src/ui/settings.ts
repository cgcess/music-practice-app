import { h } from "./h";
import type { BackupPort } from "./ports";
import { openSheet, type Sheet } from "./sheet";

interface ShareData {
  files: File[];
}
export interface SettingsEnv {
  /** Called after a successful import, before navigating to Today (stop timers etc). */
  onImported?: () => void;
  /** Share seam; defaults to navigator. */
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  /** Fallback save when sharing is unavailable; defaults to a Blob URL link click. */
  download?: (file: File) => void;
  /** Where visibilitychange is observed; defaults to document. */
  doc?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
}

function browserDownload(file: File): void {
  const url = URL.createObjectURL(file);
  const a = h("a", { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const readText = (f: File): Promise<string> =>
  typeof f.text === "function"
    ? f.text()
    : new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(f);
      });

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const msgOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** `#/settings`: save all data to a file, or replace all data from one. */
export function settingsView(port: BackupPort, env: SettingsEnv = {}): { el: HTMLElement; dispose: () => void } {
  const doc = env.doc ?? document;
  let disposed = false;
  let file: File | null = null;
  let gen = 0;
  let sheet: Sheet | null = null;

  const status = h("p", { class: "settings-status", role: "status" });
  const setStatus = (m: string, isError = false) => {
    status.textContent = m;
    status.classList.toggle("error", isError);
  };

  const saveBtn = h("button", { type: "button", class: "settings-btn", disabled: true, onClick: () => save() }, "Save backup");
  const input = h("input", {
    type: "file",
    accept: ".json,application/json",
    onChange: () => void picked(),
  });
  const loadLabel = h("label", { class: "settings-btn file-btn" }, "Load backup", input);

  // Build the File ahead of the tap: share() must run inside the tap's transient activation, so no await before it.
  const build = async () => {
    const mine = ++gen;
    try {
      const r = await port.prepareExport();
      if (disposed || mine !== gen) return;
      file = new File([r.text], r.fileName, { type: "application/json" });
    } catch (e) {
      if (disposed || mine !== gen) return;
      file = null;
      setStatus(msgOf(e, "Could not prepare the backup"), true);
    }
    saveBtn.disabled = false;
  };

  const save = () => {
    if (!file) {
      // Last build failed: tapping retries the build (outside any share); the user taps again to share.
      setStatus("");
      void build();
      return;
    }
    const f = file;
    const data = { files: [f] };
    if (env.canShare && env.share && env.canShare(data)) {
      env.share(data).then(
        () => setStatus("Backup saved"),
        (e: unknown) => {
          if ((e as { name?: string } | null)?.name === "AbortError") return;
          setStatus(msgOf(e, "Could not save the backup"), true);
        },
      );
      return;
    }
    try {
      (env.download ?? browserDownload)(f);
      setStatus("Backup downloaded");
    } catch (e) {
      setStatus(msgOf(e, "Could not save the backup"), true);
    }
  };

  const onVisible = () => {
    if (doc.visibilityState === "visible") void build();
  };
  doc.addEventListener("visibilitychange", onVisible);

  const confirm = (fileName: string, text: string, cur: { tasks: number; songs: number }, inc: { tasks: number; songs: number; hasSettings: boolean }) => {
    const msg =
      `This replaces ${plural(cur.tasks, "task")} and ${plural(cur.songs, "song")} on this device with ` +
      `${plural(inc.tasks, "task")} and ${plural(inc.songs, "song")} from ${fileName}. ` +
      (inc.hasSettings ? "Settings are replaced too." : "Settings are reset to defaults.");
    const replaceBtn = h("button", { type: "button", class: "danger" }, "Replace");
    const err = h("p", { class: "error", role: "alert" });
    replaceBtn.addEventListener("click", () => {
      replaceBtn.disabled = true;
      void (async () => {
        try {
          await port.importBackup(text);
        } catch (e) {
          err.textContent = msgOf(e, "Could not load the backup");
          replaceBtn.disabled = false;
          return;
        }
        sheet?.close();
        env.onImported?.();
        location.hash = "#/today";
      })();
    });
    sheet = openSheet(
      h(
        "div",
        null,
        h("p", null, msg),
        err,
        h("div", { class: "sheet-actions" }, h("button", { type: "button", class: "cancel", onClick: () => sheet?.close() }, "Cancel"), replaceBtn),
      ),
      { title: "Replace all data?", onClose: () => (sheet = null) },
    );
  };

  async function picked() {
    const f = input.files?.[0];
    input.value = ""; // so picking the same file again fires change
    if (!f) return;
    setStatus("");
    try {
      const text = await readText(f);
      const inc = await port.inspect(text);
      const cur = await port.current();
      if (disposed) return;
      confirm(f.name, text, cur, inc);
    } catch (e) {
      if (!disposed) setStatus(msgOf(e, "Could not read the file"), true);
    }
  }

  void build();

  const el = h(
    "section",
    { class: "view settings" },
    h("header", { class: "large-header" }, h("h1", { class: "large-title" }, "Settings")),
    h(
      "div",
      { class: "inset-list settings-list" },
      h("div", { class: "settings-row" }, h("p", null, "Save all tasks, songs and settings to a file."), saveBtn),
      h("div", { class: "settings-row" }, h("p", null, "Replace everything on this device with a saved file."), loadLabel),
    ),
    status,
  );

  return {
    el,
    dispose() {
      disposed = true;
      doc.removeEventListener("visibilitychange", onVisible);
      sheet?.close();
    },
  };
}

export function browserSettingsEnv(): Pick<SettingsEnv, "canShare" | "share"> {
  const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
  return {
    canShare: typeof n.canShare === "function" ? (d) => n.canShare!(d) : undefined,
    share: typeof n.share === "function" ? (d) => n.share!(d) : undefined,
  };
}
