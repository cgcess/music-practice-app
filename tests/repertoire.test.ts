// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import type { BulkAddResult, RepertoirePort, SongItem, SongSnapshot, StrengthCounts } from "../src/ui/ports";
import { repertoireView, type RepertoireEnv } from "../src/ui/repertoire";
import { buildRoutes, defaultDeps } from "../src/ui/views";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

let songs: SongItem[];
let strengthNow: StrengthCounts;
let perDay: number;
let calls: string[];
let afterMs: number[];
let toastFn: (() => void) | null = null;
let restored: SongSnapshot[];
let bulkRes: BulkAddResult;
let saved: number[];
let view: { dispose: () => void } | null = null;

const snap: SongSnapshot = { id: "b", title: "Blue Bossa", dueDate: "2026-10-25", ease: 2.2, intervalDays: 9, lastReviewed: "2026-10-16", createdAt: "2026-10-01T09:00:00-04:00" };

const port = (): RepertoirePort => ({
  listSongs: async () => songs.map((s) => ({ ...s })),
  getSongsPerDay: async () => perDay,
  repertoireStrength: async () => ({ ...strengthNow }),
  setSongsPerDay: async (n) => {
    saved.push(n);
    perDay = n;
  },
  addSong: async (t) => void calls.push(`add:${t}`),
  addSongs: async (ts) => {
    calls.push(`bulk:${JSON.stringify(ts)}`);
    return bulkRes;
  },
  renameSong: async (id, t) => void calls.push(`rename:${id}:${t}`),
  deleteSong: async () => snap,
  restoreSong: async (s) => void restored.push(s),
});
const env: RepertoireEnv = { today: () => "2026-10-23", after: (fn, ms) => ((toastFn = fn), afterMs.push(ms), () => {}) };

const mount = async () => {
  const v = repertoireView(port(), env);
  view = v;
  document.body.replaceChildren(v.el);
  await flush();
  return v.el;
};
const click = async (el: Element | null) => {
  (el as HTMLElement).click();
  await flush();
};
const submit = async (form: Element | null) => {
  form!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  await flush();
};
const rows = () => [...document.querySelectorAll(".song")].map((r) => [r.querySelector(".name")!.textContent, r.querySelector(".due")!.textContent]);

beforeEach(() => {
  songs = [
    { id: "a", title: "Autumn Leaves", dueDate: "2026-10-20" },
    { id: "b", title: "Blue Bossa", dueDate: "2026-10-24" },
    { id: "c", title: "Misty", dueDate: "2026-10-27" },
  ];
  perDay = 3;
  strengthNow = { well: 1, okay: 1, poorly: 1, fresh: 0 };
  calls = [];
  afterMs = [];
  restored = [];
  saved = [];
  bulkRes = { added: 2, skipped: 1 };
  document.body.replaceChildren();
});
afterEach(() => {
  view?.dispose();
  view = null;
  document.body.replaceChildren();
});

describe("repertoire view", () => {
  it("lists rows in the port order with due text (overdue shows today)", async () => {
    await mount();
    expect(rows()).toEqual([
      ["Autumn Leaves", "today"],
      ["Blue Bossa", "tomorrow"],
      ["Misty", "in 4 days"],
    ]);
    expect(document.body.textContent).not.toMatch(/overdue/i);
  });
  it("shows the empty card when there are no songs", async () => {
    songs = [];
    const el = await mount();
    expect(el.querySelector(".empty-card")!.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector("ul")!.hasAttribute("hidden")).toBe(true);
  });
  it("adds a single song and refreshes", async () => {
    await mount();
    await click(document.querySelector('button[aria-label="Add song"]'));
    (document.querySelector(".sheet input") as HTMLInputElement).value = "Satin Doll";
    songs.push({ id: "d", title: "Satin Doll", dueDate: "2026-10-28" });
    await submit(document.querySelector(".sheet form"));
    expect(calls).toEqual(["add:Satin Doll"]);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(rows()).toHaveLength(4);
  });
  it("blank single add shows an error and stays open", async () => {
    await mount();
    await click(document.querySelector('button[aria-label="Add song"]'));
    await submit(document.querySelector(".sheet form"));
    expect(calls).toEqual([]);
    expect(document.querySelector(".sheet .error")!.textContent).toBe("Title is required");
  });
  it("bulk add sends the lines and reports added and skipped", async () => {
    await mount();
    await click(document.querySelector(".bulk-btn"));
    (document.querySelector(".sheet textarea") as HTMLTextAreaElement).value = "One\n\nTwo\nOne";
    await submit(document.querySelector(".sheet form"));
    expect(calls).toEqual([`bulk:${JSON.stringify(["One", "", "Two", "One"])}`]);
    expect(document.querySelector(".toast")!.textContent).toBe("Added 2, skipped 1");
    expect(document.querySelector(".sheet")).toBeNull();
  });
  it("toast gets .show (slide-in), loses it when hidden; header has the static wash", async () => {
    await mount();
    expect(document.querySelector(".large-header")!.classList.contains("wash")).toBe(true);
    await click(document.querySelector(".bulk-btn"));
    (document.querySelector(".sheet textarea") as HTMLTextAreaElement).value = "One";
    await submit(document.querySelector(".sheet form"));
    const toast = document.querySelector(".toast")!;
    expect(toast.classList.contains("show")).toBe(true);
    toastFn!();
    expect(toast.classList.contains("show")).toBe(false);
  });
  it("renames via the edit sheet", async () => {
    await mount();
    await click(document.querySelector('[data-id="b"] button'));
    const input = document.querySelector(".sheet input") as HTMLInputElement;
    expect(input.value).toBe("Blue Bossa");
    input.value = "Blue Bossa 2";
    await submit(document.querySelector(".sheet form"));
    expect(calls).toEqual(["rename:b:Blue Bossa 2"]);
  });
  it("delete shows Undo that restores the snapshot", async () => {
    await mount();
    await click(document.querySelector('[data-id="b"] button'));
    await click(document.querySelector(".sheet button.danger"));
    const toast = document.querySelector(".toast")!;
    expect(toast.textContent).toContain("Deleted Blue Bossa");
    expect(afterMs).toContain(config.today.undoMs);
    await click(toast.querySelector("button.undo"));
    expect(restored).toEqual([snap]);
    expect(toast.textContent).toBe("");
  });
  it("stepper saves, and + / - are disabled at the bounds", async () => {
    perDay = 0;
    await mount();
    const minus = document.querySelector('button[aria-label="Fewer songs per day"]') as HTMLButtonElement;
    const plus = document.querySelector('button[aria-label="More songs per day"]') as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
    await click(plus);
    expect(saved).toEqual([1]);
    expect(document.querySelector(".stepper-value")!.textContent).toBe("1");
    expect(minus.disabled).toBe(false);
    view!.dispose();
    perDay = config.maxSongsPerDay;
    await mount();
    const plus2 = document.querySelector('button[aria-label="More songs per day"]') as HTMLButtonElement;
    expect(plus2.disabled).toBe(true);
    await click(plus2);
    expect(saved).toEqual([1]);
  });
  it("is the /repertoire route and falls back to an empty port by default", () => {
    const r = buildRoutes(defaultDeps).find((x) => x.path === "/repertoire")!;
    const v = r.view({});
    expect(v.el.querySelector("h1")!.textContent).toBe("Repertoire");
    v.dispose?.();
  });
});

describe("repertoire strength bar", () => {
  const label = () => document.querySelector('.repertoire [role="img"]')?.getAttribute("aria-label");
  const bar = () => document.querySelector(".repertoire .strength") as HTMLElement;
  it("shows after the title row and before the stepper, correct straight after load, no animation", async () => {
    await mount();
    expect(bar().hidden).toBe(false);
    expect(label()).toBe("Repertoire: 1 well, 1 ok, 1 poorly");
    expect(bar().classList.contains("animate")).toBe(false);
    const kids = [...document.querySelector("header")!.children];
    expect(kids.map((k) => k.className.split(" ")[0])).toEqual(["title-row", "strength", "stepper"]);
  });
  it("is hidden with no songs", async () => {
    songs = [];
    strengthNow = { well: 0, okay: 0, poorly: 0, fresh: 0 };
    await mount();
    expect(bar().hidden).toBe(true);
  });
  it("updates after add", async () => {
    await mount();
    await click(document.querySelector('button[aria-label="Add song"]'));
    (document.querySelector(".sheet input") as HTMLInputElement).value = "Satin Doll";
    strengthNow = { well: 1, okay: 1, poorly: 1, fresh: 1 };
    await submit(document.querySelector(".sheet form"));
    expect(label()).toBe("Repertoire: 1 well, 1 ok, 1 poorly, 1 new");
    expect(bar().classList.contains("animate")).toBe(true);
  });
  it("updates after bulk add", async () => {
    await mount();
    await click(document.querySelector(".bulk-btn"));
    (document.querySelector(".sheet textarea") as HTMLTextAreaElement).value = "One\nTwo";
    strengthNow = { well: 1, okay: 1, poorly: 1, fresh: 2 };
    await submit(document.querySelector(".sheet form"));
    expect(label()).toBe("Repertoire: 1 well, 1 ok, 1 poorly, 2 new");
  });
  it("updates after edit", async () => {
    await mount();
    await click(document.querySelector('[data-id="b"] button'));
    (document.querySelector(".sheet input") as HTMLInputElement).value = "Blue Bossa 2";
    strengthNow = { well: 2, okay: 0, poorly: 1, fresh: 0 };
    await submit(document.querySelector(".sheet form"));
    expect(label()).toBe("Repertoire: 2 well, 1 poorly");
  });
  it("updates after delete and after restore (Undo)", async () => {
    await mount();
    await click(document.querySelector('[data-id="b"] button'));
    strengthNow = { well: 1, okay: 0, poorly: 1, fresh: 0 };
    await click(document.querySelector(".sheet button.danger"));
    expect(label()).toBe("Repertoire: 1 well, 1 poorly");
    strengthNow = { well: 1, okay: 1, poorly: 1, fresh: 0 };
    await click(document.querySelector(".toast button.undo"));
    expect(label()).toBe("Repertoire: 1 well, 1 ok, 1 poorly");
  });
});
