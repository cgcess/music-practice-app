// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { formatSummary } from "../src/today/summary";
import { config } from "../src/config";
import type { SongRating, SongSnapshot, StrengthCounts, TodayPort, TodaySong } from "../src/ui/ports";
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
let songGate: Promise<void> | null = null;
let songFail = false;
const zero = (): StrengthCounts => ({ well: 0, okay: 0, poorly: 0, fresh: 0 });
let strengthImpl: () => Promise<StrengthCounts> = async () => zero();
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
  repertoireStrength: () => strengthImpl(),
  setTempo: async () => {},
  listTodaySongs: async () => {
    if (songGate) await songGate;
    if (songFail) throw new Error("songs unavailable");
    return { songsPerDay: spd, songs: songs.map((s) => ({ ...s })) };
  },
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
  songGate = null;
  songFail = false;
  strengthImpl = async () => ({ well: 1, okay: 1, poorly: 0, fresh: 0 });
  afterMs = [];
  toastFn = null;
  tasks = [{ id: "t1", name: "Scales", minutes: 5, days: "daily", lastCompletedOn: null }];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

const todayEl = () => document.querySelector(".today") as HTMLElement;
const hasCls = (c: string) => todayEl().classList.contains(c);
const summaryText = () => document.querySelector(".summary")!.textContent;
const taskAct = (id = "t1") => document.querySelector(`li.task[data-id="${id}"] button.act`) as HTMLButtonElement;
const finishTask = async (id = "t1") => {
  taskAct(id).click();
  taskAct(id).click();
  await flush();
};
const rate = async (id: string, r = "ok") => {
  body(id).click();
  rateBtn(id, r).click();
  await flush();
};
const reduceMotion = () => vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));

describe("today header progress (t017)", () => {
  it("rest: nothing due keeps the pale state with no bloom", async () => {
    tasks = [];
    songs = [];
    spd = 0;
    await mount();
    expect(hasCls("state-rest")).toBe(true);
    expect(hasCls("state-daydone")).toBe(false);
    expect(todayEl().style.getPropertyValue("--p")).toBe("0");
    expect(summaryText()).toBe("Nothing due today");
  });
  it("partial then Day done, with --p following done/due over tasks and songs", async () => {
    await mount();
    expect(hasCls("state-partial")).toBe(true);
    expect(todayEl().style.getPropertyValue("--p")).toBe("0");
    await finishTask();
    expect(Number(todayEl().style.getPropertyValue("--p"))).toBeCloseTo(1 / 3);
    await rate("a");
    expect(Number(todayEl().style.getPropertyValue("--p"))).toBeCloseTo(2 / 3);
    expect(hasCls("state-daydone")).toBe(false);
    await rate("b");
    expect(hasCls("state-daydone")).toBe(true);
    expect(hasCls("state-partial")).toBe(false);
    expect(todayEl().style.getPropertyValue("--p")).toBe("1");
    expect(summaryText()).toBe("Day done");
  });
  it("non-Day-done summary equals formatSummary, number in its own span", async () => {
    await mount();
    expect(summaryText()).toBe(formatSummary({ done: 0, due: 1, minutesLeft: 5 }));
    expect(document.querySelector(".summary .n")!.textContent).toBe("0");
  });
  it("an empty songs section (none selected) still lets finished tasks complete the day", async () => {
    songs = [];
    tasks[0]!.lastCompletedOn = "2026-10-23";
    await mount();
    expect(hasCls("state-daydone")).toBe(true);
  });
  it("songsPerDay 0 with an unfinished task is partial", async () => {
    spd = 0;
    songs = [];
    await mount();
    expect(hasCls("state-partial")).toBe(true);
  });
  it("undoing the last rating or the last task leaves Day done", async () => {
    tasks[0]!.lastCompletedOn = "2026-10-23";
    songs[0]!.ratedToday = true;
    await mount();
    await rate("b");
    expect(hasCls("state-daydone")).toBe(true);
    (document.querySelector(".toast button.undo") as HTMLButtonElement).click();
    await flush();
    expect(hasCls("state-daydone")).toBe(false);
    expect(hasCls("state-partial")).toBe(true);
    expect(summaryText()).not.toBe("Day done");
    await rate("b");
    expect(hasCls("state-daydone")).toBe(true);
  });
  it("undoing the last task finish leaves Day done", async () => {
    songs.forEach((x) => (x.ratedToday = true));
    await mount();
    await finishTask();
    expect(hasCls("state-daydone")).toBe(true);
    (document.querySelector(".toast button.undo") as HTMLButtonElement).click();
    await flush();
    expect(hasCls("state-daydone")).toBe(false);
  });
  it("a fresh view over completed data is not Day done until the songs load, with no pulse", async () => {
    tasks[0]!.lastCompletedOn = "2026-10-23";
    songs.forEach((x) => (x.ratedToday = true));
    let release!: () => void;
    songGate = new Promise<void>((r) => (release = r));
    await mount();
    expect(hasCls("state-daydone")).toBe(false);
    expect(summaryText()).not.toBe("Day done");
    release();
    await flush();
    expect(hasCls("state-daydone")).toBe(true);
    expect(summaryText()).toBe("Day done");
    expect(hasCls("pulse-a") || hasCls("pulse-b")).toBe(false);
    expect(document.querySelector(".pop, .settle, .tick")).toBeNull();
  });
  it("a failed song load still resolves the cap", async () => {
    tasks[0]!.lastCompletedOn = "2026-10-23";
    songFail = true;
    await mount();
    expect(hasCls("state-daydone")).toBe(true);
  });
  it("first loaded paint is not animated; the first handler releases it", async () => {
    await mount();
    expect(hasCls("no-anim")).toBe(true);
    await finishTask();
    expect(hasCls("no-anim")).toBe(false);
  });
  it("no-anim is removed before pulse is added (task finish and rating)", async () => {
    await mount();
    const log: string[] = [];
    const cl = todayEl().classList;
    const add = cl.add.bind(cl);
    const remove = cl.remove.bind(cl);
    cl.add = (...t: string[]) => (t.forEach((x) => log.push("+" + x)), add(...t));
    cl.remove = (...t: string[]) => (t.forEach((x) => log.push("-" + x)), remove(...t));
    await finishTask();
    expect(log.indexOf("-no-anim")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("-no-anim")).toBeLessThan(log.findIndex((x) => x.startsWith("+pulse-")));
    todayEl().classList.add("no-anim");
    log.length = 0;
    await rate("a");
    expect(log.indexOf("-no-anim")).toBeLessThan(log.findIndex((x) => x.startsWith("+pulse-")));
  });
});

describe("per-item touch hooks (t017)", () => {
  it("finishing a task pops the Done row status, ticks the number and pulses; a later render drops pop", async () => {
    await mount();
    await finishTask();
    const status = document.querySelector("li.task.done .status")!;
    expect(status.classList.contains("pop")).toBe(true);
    expect(document.querySelector(".summary .n")!.classList.contains("tick")).toBe(true);
    expect(hasCls("pulse-a") || hasCls("pulse-b")).toBe(true);
    (document.querySelector(".edit-toggle") as HTMLButtonElement).click(); // any render
    expect(document.querySelector("li.task.done .status")!.classList.contains("pop")).toBe(false);
  });
  it("finishing by swipe pops too", async () => {
    await mount();
    const rowEl = document.querySelector('li.task[data-id="t1"]')!;
    swipe(rowEl, 120, 5);
    swipe(document.querySelector('li.task[data-id="t1"]')!, 120, 5);
    await flush();
    expect(document.querySelector("li.task.done .status")!.classList.contains("pop")).toBe(true);
  });
  it("rating pops the status, settles the row and pulses", async () => {
    await mount();
    await rate("a");
    expect(li("a").classList.contains("settle")).toBe(true);
    expect(document.querySelector('li[data-song="a"] .status')!.classList.contains("pop")).toBe(true);
    expect(hasCls("pulse-a")).toBe(true);
    expect(li("b").classList.contains("settle")).toBe(false);
    expect(todayEl().dataset.pulse).toBe("1");
  });
  it("pulse restarts by alternating class names, and survives a later render", async () => {
    await mount();
    await rate("a");
    expect(hasCls("pulse-a")).toBe(true);
    (document.querySelector(".edit-toggle") as HTMLButtonElement).click(); // render between pulse and its next change
    expect(hasCls("pulse-a")).toBe(true);
    (document.querySelector(".edit-toggle") as HTMLButtonElement).click();
    await rate("b");
    expect(hasCls("pulse-b")).toBe(true);
    expect(hasCls("pulse-a")).toBe(false);
    expect(todayEl().dataset.pulse).toBe("2");
  });
  it("a second render has no pop or settle", async () => {
    await mount();
    await rate("a");
    (document.querySelector(".edit-toggle") as HTMLButtonElement).click();
    expect(document.querySelector(".pop, .settle")).toBeNull();
  });
  it("adds none of the touch hooks under reduced motion", async () => {
    reduceMotion();
    await mount();
    await finishTask();
    await rate("a");
    expect(document.querySelector(".pop, .settle, .tick, .entering")).toBeNull();
    expect(hasCls("pulse-a") || hasCls("pulse-b")).toBe(false);
    expect(hasCls("no-anim")).toBe(false);
  });
});

describe("today toast motion (t017)", () => {
  it("slides in with .show; on hide the live toast empties and a text clone leaves", async () => {
    vi.useFakeTimers();
    await mount();
    await rate("a");
    const toast = document.querySelector(".toast")!;
    expect(toast.classList.contains("show")).toBe(true);
    toastFn!();
    expect(toast.textContent).toBe("");
    expect(toast.classList.contains("show")).toBe(false);
    const ghost = document.querySelector(".toast-leaving")!;
    expect(ghost.textContent).toContain("Rated Autumn ok");
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.classList.contains("toast")).toBe(false);
    expect(ghost.querySelector("button")).toBeNull();
    vi.advanceTimersByTime(401);
    expect(document.querySelector(".toast-leaving")).toBeNull();
  });
  it("the clone is removed on animationend too", async () => {
    await mount();
    await rate("a");
    toastFn!();
    document.querySelector(".toast-leaving")!.dispatchEvent(new Event("animationend"));
    expect(document.querySelector(".toast-leaving")).toBeNull();
  });
  it("no leave clone under reduced motion", async () => {
    reduceMotion();
    await mount();
    await rate("a");
    toastFn!();
    expect(document.querySelector(".toast-leaving")).toBeNull();
  });
});

describe("source hygiene (t017)", () => {
  const ui = ["today.ts", "repertoire.ts"].map((f) => readFileSync(`src/ui/${f}`, "utf8"));
  it("today.ts touches the root classes via classList only", () => {
    expect(ui[0]).not.toMatch(/\.className\s*=/);
  });
  it("no innerHTML and no data imports in the view code", () => {
    for (const src of ui) {
      expect(src).not.toMatch(/innerHTML/);
      expect(src).not.toMatch(/from "\.\.\/data/);
    }
  });
});

const barLabel = () => document.querySelector('.today [role="img"]')?.getAttribute("aria-label");
const bar = () => document.querySelector(".today .strength") as HTMLElement;

describe("repertoire strength bar on Today", () => {
  it("sits in the header after the summary, before the metronome, with the whole-repertoire label", async () => {
    await mount();
    expect(bar().hidden).toBe(false);
    expect(barLabel()).toBe("Repertoire: 1 well, 1 ok");
    const header = document.querySelector(".today header")!;
    const kids = [...header.children];
    expect(kids.indexOf(bar())).toBe(kids.indexOf(header.querySelector(".summary")!) + 1);
    expect(kids.indexOf(bar())).toBe(kids.length - 2); // the metronome panel is the last header child
  });
  it("is shown with songsPerDay = 0", async () => {
    spd = 0;
    songs = [];
    await mount();
    expect(section().hidden).toBe(true);
    expect(bar().hidden).toBe(false);
  });
  it("is hidden with no songs, and before the first successful read", async () => {
    strengthImpl = async () => zero();
    await mount();
    expect(bar().hidden).toBe(true);
    views.pop()!.dispose();
    strengthImpl = async () => {
      throw new Error("nope");
    };
    await mount();
    expect(bar().hidden).toBe(true);
  });
  it("has no animate class on first paint", async () => {
    await mount();
    expect(bar().classList.contains("animate")).toBe(false);
  });
  it("updates after rating and after Undo, animating from the handler", async () => {
    await mount();
    strengthImpl = async () => ({ well: 2, okay: 1, poorly: 0, fresh: 0 });
    body("a").click();
    rateBtn("a", "solid").click();
    await flush();
    expect(barLabel()).toBe("Repertoire: 2 well, 1 ok");
    expect(bar().classList.contains("animate")).toBe(true);
    strengthImpl = async () => ({ well: 1, okay: 1, poorly: 1, fresh: 0 });
    (document.querySelector(".toast button.undo") as HTMLButtonElement).click();
    await flush();
    expect(barLabel()).toBe("Repertoire: 1 well, 1 ok, 1 poorly");
  });
  it("an older response that resolves last never overwrites a newer one", async () => {
    await mount();
    let late!: (c: StrengthCounts) => void;
    strengthImpl = () => new Promise((r) => (late = r));
    body("a").click();
    rateBtn("a", "solid").click();
    await flush();
    const resolveRate = late;
    strengthImpl = async () => ({ well: 0, okay: 5, poorly: 0, fresh: 0 });
    (document.querySelector(".toast button.undo") as HTMLButtonElement).click();
    await flush();
    resolveRate({ well: 9, okay: 0, poorly: 0, fresh: 0 });
    await flush();
    expect(barLabel()).toBe("Repertoire: 5 ok");
  });
});
