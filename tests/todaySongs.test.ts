// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import type { SongRating, SongSnapshot, TodayPort, TodaySong } from "../src/ui/ports";
import { todayView, type TodayEnv } from "../src/ui/today";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const snapOf = (id: string): SongSnapshot => ({ id, title: id, dueDate: "2026-10-20", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "2026-10-01T09:00:00+00:00" });

let songs: TodaySong[];
let spd: number;
let rated: [string, SongRating][];
let restored: SongSnapshot[];
let rateError: Error | null;
let afterMs: number[];
let toastFn: (() => void) | null;
let views: { dispose: () => void }[] = [];
let tasks: { id: string; name: string; minutes: number; days: "daily"; lastCompletedOn: string | null }[];

const port = (): TodayPort => ({
  listTasks: async () => tasks.map((t) => ({ ...t })),
  addTask: async () => {},
  updateTask: async () => {},
  deleteTask: async (id) => ({ id, name: "", minutes: 1, days: "daily", lastCompletedOn: null, createdAt: "" }),
  restoreTask: async () => {},
  setCompleted: async (id, d) => {
    tasks.find((t) => t.id === id)!.lastCompletedOn = d;
  },
  getTimerPrefs: async () => ({ sound: false, vibrate: false, overtime: true }),
  getTempo: async () => 100,
  setTempo: async () => {},
  listTodaySongs: async () => ({ songsPerDay: spd, songs: songs.map((s) => ({ ...s })) }),
  rateTodaySong: async (id, r) => {
    if (rateError) throw rateError;
    rated.push([id, r]);
    const s = songs.find((x) => x.id === id)!;
    s.ratedToday = true;
    return snapOf(id);
  },
  restoreTodaySong: async (snap) => {
    restored.push(snap);
    songs.find((x) => x.id === snap.id)!.ratedToday = false;
  },
});

async function mount() {
  const env: TodayEnv = {
    port: port(),
    now: () => new Date(2026, 9, 23, 12, 0, 0).getTime(),
    feedback: { prime() {}, chime() {}, acquireWakeLock() {}, releaseWakeLock() {}, dispose() {} },
    every: () => () => {},
    after: (fn, ms) => {
      afterMs.push(ms);
      toastFn = fn;
      return () => {
        toastFn = null;
      };
    },
    onVisible: () => () => {},
    metronome: { every: () => () => {}, onVisible: () => () => {} },
  };
  const v = todayView(env);
  views.push(v);
  document.body.replaceChildren(v.el);
  await flush();
  return v;
}

const ev = (type: string, x: number, y: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y });
  return e;
};
const swipe = (el: Element, dx: number, dy = 0) => {
  el.dispatchEvent(ev("pointerdown", 0, 0));
  el.dispatchEvent(ev("pointerup", dx, dy));
};
const li = (id: string) => document.querySelector(`li.song[data-song="${id}"]`) as HTMLElement;
const body = (id: string) => li(id).querySelector(".row-body") as HTMLElement;
const rateBtn = (id: string, r: string) => li(id).querySelector(`button.rate-${r}`) as HTMLButtonElement;
const section = () => document.querySelector("section.songs") as HTMLElement;

beforeEach(() => {
  songs = [
    { id: "a", title: "Autumn", ratedToday: false },
    { id: "b", title: "Blue", ratedToday: false },
  ];
  spd = 2;
  rated = [];
  restored = [];
  rateError = null;
  afterMs = [];
  toastFn = null;
  tasks = [{ id: "t1", name: "Scales", minutes: 5, days: "daily", lastCompletedOn: null }];
});
afterEach(() => {
  for (const v of views) v.dispose();
  views = [];
  document.body.replaceChildren();
});

describe("today songs section", () => {
  it("shows exactly the port's selection, separate from the task list, with no timer or minutes", async () => {
    await mount();
    expect(section().hidden).toBe(false);
    expect(section().querySelector("h2")!.textContent).toBe("Songs");
    expect([...document.querySelectorAll("li.song")].map((x) => x.querySelector(".name")!.textContent)).toEqual(["Autumn", "Blue"]);
    expect(section().querySelector(".mins, .time, button.act")).toBeNull();
    expect(document.querySelectorAll("li.task")).toHaveLength(1);
  });
  it("songsPerDay 0 hides the section", async () => {
    spd = 0;
    songs = [];
    tasks[0]!.lastCompletedOn = "2026-10-23";
    const v = await mount();
    expect(section().hidden).toBe(true);
    const kids = Array.from(v.el.children);
    const at = (sel: string) => kids.indexOf(v.el.querySelector(sel)!);
    expect(at(".group.todo")).toBeGreaterThanOrEqual(0);
    expect(at(".group.todo")).toBeLessThan(at(".group.done-group"));
  });
  it("Songs section sits between To-do and Done, toast last", async () => {
    tasks[0]!.lastCompletedOn = "2026-10-23";
    const v = await mount();
    const kids = Array.from(v.el.children);
    const at = (sel: string) => kids.indexOf(v.el.querySelector(sel)!);
    expect(v.el.querySelector(".group.done-group")!.hasAttribute("hidden")).toBe(false);
    expect(at(".group.todo")).toBeGreaterThanOrEqual(0);
    expect(at(".group.todo")).toBeLessThan(at(".group.songs"));
    expect(at(".group.songs")).toBeLessThan(at(".group.done-group"));
    expect(at(".group.done-group")).toBeLessThan(at(".toast"));
    expect(at(".toast")).toBe(kids.length - 1);
  });
  it("an empty selection reads as nothing to play", async () => {
    songs = [];
    await mount();
    expect(section().hidden).toBe(false);
    expect(section().textContent).toContain("Nothing to play today");
  });
  it("rated songs render greyed; after a reload they read Rated", async () => {
    songs[0]!.ratedToday = true;
    await mount();
    expect(li("a").classList.contains("rated")).toBe(true);
    expect(li("a").querySelector(".status")!.textContent).toBe("Rated");
    expect(li("a").querySelector("button.rate")).toBeNull();
    expect(body("a").getAttribute("aria-disabled")).toBe("true");
  });
});

describe("reveal and close", () => {
  it("left swipe reveals three labelled buttons; right swipe closes", async () => {
    await mount();
    expect(li("a").classList.contains("open")).toBe(false);
    swipe(li("a"), -120);
    expect(li("a").classList.contains("open")).toBe(true);
    expect(body("a").getAttribute("aria-expanded")).toBe("true");
    expect(["rough", "ok", "solid"].map((r) => rateBtn("a", r).getAttribute("aria-label"))).toEqual(["Rate Autumn rough", "Rate Autumn ok", "Rate Autumn solid"]);
    swipe(li("a"), 120);
    expect(li("a").classList.contains("open")).toBe(false);
  });
  it("tap, Enter and Space toggle the row", async () => {
    await mount();
    body("a").click();
    expect(li("a").classList.contains("open")).toBe(true);
    body("a").click();
    expect(li("a").classList.contains("open")).toBe(false);
    for (const key of ["Enter", " "]) {
      body("a").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(li("a").classList.contains("open")).toBe(true);
      body("a").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(li("a").classList.contains("open")).toBe(false);
    }
    expect(body("a").getAttribute("role")).toBe("button");
    expect(body("a").getAttribute("tabindex")).toBe("0");
  });
  it("opening another row closes the first", async () => {
    await mount();
    swipe(li("a"), -120);
    body("b").click();
    expect(li("a").classList.contains("open")).toBe(false);
    expect(li("b").classList.contains("open")).toBe(true);
    swipe(li("a"), -120);
    expect(li("b").classList.contains("open")).toBe(false);
    expect(document.querySelectorAll("li.song.open")).toHaveLength(1);
  });
  it("tapping elsewhere closes the open row", async () => {
    await mount();
    swipe(li("a"), -120);
    document.querySelector("h1")!.dispatchEvent(ev("pointerdown", 0, 0));
    expect(li("a").classList.contains("open")).toBe(false);
  });
  it("a rated row cannot be opened", async () => {
    songs[0]!.ratedToday = true;
    await mount();
    swipe(li("a"), -120);
    body("a").click();
    expect(li("a").classList.contains("open")).toBe(false);
  });
});

describe("rating and undo", () => {
  it("rating calls the port, closes and greys the row with its label, shows the toast", async () => {
    await mount();
    swipe(li("a"), -120);
    rateBtn("a", "solid").click();
    await flush();
    expect(rated).toEqual([["a", "solid"]]);
    expect(li("a").classList.contains("rated")).toBe(true);
    expect(li("a").classList.contains("open")).toBe(false);
    expect(li("a").querySelector(".status")!.textContent).toBe("solid");
    expect(document.querySelector(".toast")!.textContent).toContain("Rated Autumn solid");
    expect(afterMs).toContain(config.today.undoMs);
  });
  it("Undo restores the previous record and the row is open for rating again", async () => {
    await mount();
    body("a").click();
    rateBtn("a", "rough").click();
    await flush();
    (document.querySelector(".toast button.undo") as HTMLButtonElement).click();
    await flush();
    expect(restored).toEqual([snapOf("a")]);
    expect(li("a").classList.contains("rated")).toBe(false);
    expect(document.querySelector(".toast")!.textContent).toBe("");
  });
  it("a view rebuild shows the rated row as Rated", async () => {
    await mount();
    body("a").click();
    rateBtn("a", "ok").click();
    await flush();
    views.pop()!.dispose();
    await mount();
    expect(li("a").classList.contains("rated")).toBe(true);
    expect(li("a").querySelector(".status")!.textContent).toBe("Rated");
  });
  it("rating every shown song shows All done for today", async () => {
    await mount();
    const done = () => section().querySelector(".songs-done") as HTMLElement;
    expect(done().hidden).toBe(true);
    for (const id of ["a", "b"]) {
      body(id).click();
      rateBtn(id, "ok").click();
      await flush();
    }
    expect(done().hidden).toBe(false);
    expect(done().textContent).toBe("All done for today");
  });
  it("a rating toast replaces a pending task toast", async () => {
    await mount();
    (document.querySelector("button.act") as HTMLButtonElement).click();
    swipe(document.querySelector("li.task")!, 120);
    await flush();
    expect(document.querySelector(".toast")!.textContent).toContain("Done");
    body("a").click();
    rateBtn("a", "ok").click();
    await flush();
    expect(document.querySelector(".toast")!.textContent).toContain("Rated Autumn");
    expect(document.querySelectorAll(".toast button.undo")).toHaveLength(1);
  });
  it("a rejected rating shows the error and keeps the row unrated", async () => {
    await mount();
    rateError = new Error("Already rated today");
    body("a").click();
    rateBtn("a", "ok").click();
    await flush();
    expect(document.querySelector(".toast")!.textContent).toContain("Already rated today");
    expect(li("a").classList.contains("rated")).toBe(false);
  });
});

describe("edit mode", () => {
  it("blocks swipe and open, closes an open row, and restores after Done", async () => {
    await mount();
    swipe(li("a"), -120);
    const toggle = document.querySelector("button.edit-toggle") as HTMLButtonElement;
    toggle.click();
    expect(li("a").classList.contains("open")).toBe(false);
    swipe(li("a"), -120);
    body("a").click();
    expect(li("a").classList.contains("open")).toBe(false);
    expect(li("a").querySelector("button.rate")).toBeNull();
    expect(body("a").getAttribute("role")).toBeNull();
    toggle.click();
    swipe(li("a"), -120);
    expect(li("a").classList.contains("open")).toBe(true);
  });
});

describe("styles", () => {
  it("rate buttons have a 44px minimum size and accessible names", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/ui/today.css", "utf8");
    const rule = /\.song button\.rate \{[^}]*\}/.exec(css)![0];
    expect(rule).toContain("min-width: 44px");
    expect(rule).toContain("min-height: 44px");
    await mount();
    for (const r of ["rough", "ok", "solid"]) expect(rateBtn("a", r).getAttribute("aria-label")).toMatch(/^Rate Autumn /);
  });
});
