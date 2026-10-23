// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import type { Feedback } from "../src/ui/feedback";
import type { NewTask, TaskItem, TaskSnapshot, TodayPort } from "../src/ui/ports";
import { editTasksView } from "../src/ui/editTasks";
import { mountShell } from "../src/ui/shell";
import { createSharedTimer, type SharedTimer, type TodayEnv } from "../src/ui/today";

const MIN = 60000;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

let clock: number;
let tasks: TaskItem[];
let added: NewTask[];
let updated: [string, NewTask][];
let deleted: string[];
let restored: TaskSnapshot[];
let addError: Error | null;
let deleteError: Error | null;
let deleteCalls: number;
let timers: { fn: () => void; ms: number; cancelled: boolean }[];
let everyCalls: number;
let tickFn: (() => void) | null;
let chimes: number;
let wake: string[];
let acquires: number;
let disposers: (() => void)[] = [];

const task = (id: string, name: string, minutes: number, days: TaskItem["days"] = "daily"): TaskItem => ({ id, name, minutes, days, lastCompletedOn: null });

function makePort(): TodayPort {
  return {
    listTasks: async () => tasks.map((t) => ({ ...t })),
    addTask: async (t) => {
      if (addError) throw addError;
      added.push(t);
      tasks.push({ id: "n" + added.length, lastCompletedOn: null, ...t });
    },
    updateTask: async (id, patch) => {
      if (addError) throw addError;
      updated.push([id, patch]);
      Object.assign(tasks.find((x) => x.id === id)!, patch);
    },
    deleteTask: async (id) => {
      if (deleteError) throw deleteError;
      deleteCalls++;
      const i = tasks.findIndex((x) => x.id === id);
      const [t] = tasks.splice(i, 1);
      deleted.push(id);
      return { ...t!, createdAt: "2026-10-01T09:00:00+00:00" };
    },
    restoreTask: async (snap) => {
      restored.push(snap);
      const { createdAt: _c, ...item } = snap;
      tasks.push(item);
    },
    setCompleted: async () => {},
    getTimerPrefs: async () => ({ sound: true, vibrate: true, overtime: true }),
    getTempo: async () => 100,
    setTempo: async () => {},
    repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
    listTodaySongs: async () => ({ songsPerDay: 0, songs: [] }),
    rateTodaySong: async (id) => ({ id, title: "", dueDate: "2026-10-21", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" }),
    restoreTodaySong: async () => {},
  };
}

const feedback: Feedback = {
  prime() {},
  chime: () => {
    chimes++;
  },
  acquireWakeLock: () => {
    acquires++;
    wake.push("acquire");
  },
  releaseWakeLock: () => {
    wake.push("release");
  },
  dispose() {},
};
const makeEnv = (port: TodayPort, timer: SharedTimer): TodayEnv => ({
  port,
  now: () => clock,
  feedback,
  every: (fn) => {
    everyCalls++;
    tickFn = fn;
    return () => {
      tickFn = null;
    };
  },
  after: (fn, ms) => {
    const rec = { fn, ms, cancelled: false };
    timers.push(rec);
    return () => {
      rec.cancelled = true;
    };
  },
  onVisible: () => () => {},
  timer,
});

beforeEach(() => {
  // Wednesday 2026-10-21, local noon.
  clock = new Date(2026, 9, 21, 12).getTime();
  tasks = [task("a", "Scales", 10), task("b", "Arpeggios", 5, [4]), task("c", "Sight reading", 15, [1]), task("f", "Fri jam", 20, [5])];
  added = [];
  updated = [];
  deleted = [];
  restored = [];
  addError = null;
  deleteError = null;
  deleteCalls = 0;
  timers = [];
  everyCalls = 0;
  tickFn = null;
  chimes = 0;
  wake = [];
  acquires = 0;
  location.hash = "";
  document.body.replaceChildren();
});
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  document.body.replaceChildren();
  location.hash = "";
});

// ---- the page on its own -------------------------------------------------

function mountPage(timer?: SharedTimer) {
  const env = makeEnv(makePort(), timer ?? createSharedTimer(() => clock));
  const v = editTasksView({ port: env.port, timer: env.timer, feedback, after: env.after });
  disposers.push(v.dispose);
  document.body.replaceChildren(v.el);
  return { v, env };
}
const row = (id: string) => document.querySelector(`li[data-id="${id}"]`) as HTMLElement | null;
const edit = (id: string) => row(id)!.querySelector(".row-body[data-edit]") as HTMLElement;
const field = (sel: string) => document.querySelector(sel) as HTMLInputElement;
const submit = async () => {
  document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
};
const err = () => document.querySelector("[role=alert]")!.textContent;
const toastText = () => document.querySelector(".toast")!.textContent;
const del = async () => {
  (document.querySelector("button.danger") as HTMLButtonElement).click();
  await flush();
};
const undoBtn = () => document.querySelector(".toast button.undo") as HTMLButtonElement | null;
const addBtn = () => document.querySelector("button.add-btn") as HTMLButtonElement;
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("edit page", () => {
  it("lists every task regardless of days, with days and minutes, sorted by name", async () => {
    mountPage();
    await flush();
    expect(document.querySelector("h1")?.textContent).toBe("Edit tasks");
    expect([...document.querySelectorAll("li.task .name")].map((n) => n.textContent)).toEqual(["Arpeggios", "Fri jam", "Scales", "Sight reading"]);
    const info = (id: string) => [row(id)!.querySelector(".days")!.textContent, row(id)!.querySelector(".mins")!.textContent];
    expect(info("a")).toEqual(["Daily", "10 min"]);
    expect(info("b")).toEqual(["Thu", "5 min"]);
    expect(info("c")).toEqual(["Mon", "15 min"]);
    expect(info("f")).toEqual(["Fri", "20 min"]);
  });
  it("shows an empty state", async () => {
    tasks = [];
    mountPage();
    await flush();
    expect(document.querySelector(".empty-card")!.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("ul.task-list")!.hasAttribute("hidden")).toBe(true);
  });
  it("has a Back link to Today", () => {
    mountPage();
    expect(document.querySelector("a.back-link")!.getAttribute("href")).toBe("#/today");
  });
  it("row opens a pre-filled Edit task sheet and Save updates the list", async () => {
    mountPage();
    await flush();
    expect(edit("a").getAttribute("aria-label")).toBe("Edit Scales");
    edit("b").click();
    expect(document.querySelector(".sheet")!.getAttribute("aria-label")).toBe("Edit task");
    expect(field("#task-name").value).toBe("Arpeggios");
    expect(field("#task-minutes").value).toBe("5");
    expect(field("#task-daily").checked).toBe(false);
    expect([...document.querySelectorAll<HTMLInputElement>("input[name=day]")].map((c) => c.checked)).toEqual([false, false, false, false, true, false, false]);
    expect(document.querySelector("button[type=submit]")!.textContent).toBe("Save");
    field("#task-name").value = "Broken chords";
    field("#task-minutes").value = "7";
    await submit();
    expect(updated).toEqual([["b", { name: "Broken chords", minutes: 7, days: [4] }]]);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(row("b")!.textContent).toContain("Broken chords");
    expect(row("b")!.textContent).toContain("7 min");
    expect(added).toEqual([]);
  });
  it("click, Enter and Space open the sheet", async () => {
    mountPage();
    await flush();
    const cancel = () => (document.querySelector("button.cancel") as HTMLButtonElement).click();
    edit("a").click();
    expect(document.querySelector(".sheet")!.getAttribute("aria-label")).toBe("Edit task");
    cancel();
    key(edit("a"), "Enter");
    expect(document.querySelector(".sheet")).not.toBeNull();
    cancel();
    key(edit("a"), " ");
    expect(document.querySelector(".sheet")).not.toBeNull();
    cancel();
    expect(updated).toEqual([]);
  });
  it("shows validation errors on edit and keeps the sheet open", async () => {
    mountPage();
    await flush();
    edit("a").click();
    field("#task-name").value = " ";
    await submit();
    expect(err()).toBe("Name is required");
    field("#task-name").value = "X";
    field("#task-daily").checked = false;
    await submit();
    expect(err()).toBe("Choose Daily or at least one day");
    field("#task-daily").checked = true;
    addError = new Error("Minutes out of range");
    for (const m of ["0", "241"]) {
      field("#task-minutes").value = m;
      await submit();
      expect(err()).toBe("Minutes out of range");
    }
    expect(document.querySelector(".sheet")).not.toBeNull();
    expect(updated).toEqual([]);
  });
  it("Add creates a task and lists it; Add after an edit starts from defaults", async () => {
    mountPage();
    await flush();
    edit("b").click();
    field("#task-name").value = "Zed";
    await submit();
    addBtn().click();
    expect(document.querySelector(".sheet")!.getAttribute("aria-label")).toBe("Add task");
    expect(field("#task-name").value).toBe("");
    expect(field("#task-minutes").value).toBe("10");
    expect(field("#task-daily").checked).toBe(true);
    expect(document.querySelectorAll("input[name=day]:checked").length).toBe(0);
    expect(document.querySelector("button[type=submit]")!.textContent).toBe("Add");
    expect(document.querySelector("button.danger")).toBeNull();
    field("#task-name").value = "Long tones";
    field("#task-minutes").value = "12";
    await submit();
    expect(added).toEqual([{ name: "Long tones", minutes: 12, days: "daily" }]);
    expect(document.body.textContent).toContain("Long tones");
    expect(document.body.textContent).toContain("12 min");
  });
  it("delete removes the task and Undo restores the identical record", async () => {
    mountPage();
    await flush();
    edit("a").click();
    await del();
    expect(deleted).toEqual(["a"]);
    expect(row("a")).toBeNull();
    expect(document.querySelector(".sheet")).toBeNull();
    expect(toastText()).toBe("Deleted Scales · Undo");
    expect(document.activeElement).toBe(addBtn());
    undoBtn()!.click();
    await flush();
    expect(restored).toEqual([{ id: "a", name: "Scales", minutes: 10, days: "daily", lastCompletedOn: null, createdAt: "2026-10-01T09:00:00+00:00" }]);
    expect(row("a")).not.toBeNull();
    expect(toastText()).toBe("");
  });
  it("delete toast expires after the undo window without restoring", async () => {
    mountPage();
    await flush();
    edit("a").click();
    await del();
    expect(timers[timers.length - 1]!.ms).toBe(config.today.undoMs);
    timers[timers.length - 1]!.fn();
    expect(toastText()).toBe("");
    expect(undoBtn()).toBeNull();
    expect(restored).toEqual([]);
  });
  it("focus returns to the row after Escape/Save and to + after Delete", async () => {
    mountPage();
    await flush();
    edit("a").focus();
    edit("a").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(edit("a"));
    edit("a").click();
    await submit();
    expect(document.activeElement).toBe(edit("a"));
    edit("a").click();
    await del();
    expect(document.activeElement).toBe(addBtn());
  });
  it("double-clicking Delete deletes once and disables the button", async () => {
    mountPage();
    await flush();
    edit("a").click();
    const b = document.querySelector("button.danger") as HTMLButtonElement;
    b.click();
    b.click();
    expect(b.disabled).toBe(true);
    await flush();
    expect(deleteCalls).toBe(1);
  });
  it("failed delete re-enables the button, allows retry and shows the error", async () => {
    deleteError = new Error("disk full");
    mountPage();
    await flush();
    edit("a").click();
    const b = document.querySelector("button.danger") as HTMLButtonElement;
    await del();
    expect(b.disabled).toBe(false);
    expect(err()).toBe("disk full");
    expect(document.querySelector(".sheet")).not.toBeNull();
    deleteError = null;
    await del();
    expect(deleteCalls).toBe(1);
    expect(deleted).toEqual(["a"]);
  });
  it("deleting the running task stops the shared timer and releases the wake lock; Undo does not restart it", async () => {
    const timer = createSharedTimer(() => clock);
    timer.controller.start("a", 10 * MIN);
    mountPage(timer);
    await flush();
    edit("a").click();
    await del();
    expect(timer.controller.snapshot().phase).toBe("idle");
    expect(wake).toEqual(["release"]);
    undoBtn()!.click();
    await flush();
    expect(row("a")).not.toBeNull();
    clock += 11 * MIN;
    expect(timer.controller.snapshot().phase).toBe("idle");
  });
  it("deleting another task leaves the running timer alone", async () => {
    const timer = createSharedTimer(() => clock);
    timer.controller.start("a", 10 * MIN);
    mountPage(timer);
    await flush();
    edit("b").click();
    await del();
    expect(timer.controller.snapshot().phase).toBe("running");
    expect(wake).toEqual([]);
  });
  it("dispose closes the sheet and cancels the toast timer", async () => {
    const { v } = mountPage();
    await flush();
    edit("a").click();
    await del();
    const t = timers[timers.length - 1]!;
    edit("b").click();
    expect(document.querySelector(".sheet")).not.toBeNull();
    v.dispose();
    expect(document.querySelector(".sheet")).toBeNull();
    expect(t.cancelled).toBe(true);
  });
});

// ---- through the shell: navigation and the timer -------------------------

const nav = async (hash: string) => {
  const p = new Promise<void>((r) => window.addEventListener("hashchange", () => r(), { once: true }));
  location.hash = hash;
  await p;
  await flush();
};
function mountApp() {
  const port = makePort();
  const timer = createSharedTimer(() => clock);
  const env = makeEnv(port, timer);
  const unsub = mountShell(document.body, { today: port, todayEnv: env });
  disposers.push(unsub);
  return { timer, env };
}
const actBtn = (id: string) => row(id)!.querySelector("button.act") as HTMLButtonElement;
const mainText = () => document.querySelector("main")!.textContent!;

describe("edit page in the app", () => {
  it("Edit on Today opens #/edit, which lists tasks Today hides; Back returns", async () => {
    mountApp();
    await flush();
    expect(row("c")).toBeNull(); // Mon-only on a Wednesday
    const p = new Promise<void>((r) => window.addEventListener("hashchange", () => r(), { once: true }));
    (document.querySelector("button.edit-toggle") as HTMLButtonElement).click();
    await p;
    await flush();
    expect(location.hash).toBe("#/edit");
    expect(document.querySelector("h1")?.textContent).toBe("Edit tasks");
    expect(row("c")!.querySelector(".days")!.textContent).toBe("Mon");
    expect(row("f")!.querySelector(".days")!.textContent).toBe("Fri");
    expect(row("a")!.querySelector(".days")!.textContent).toBe("Daily");
    (document.querySelector("a.back-link") as HTMLAnchorElement).click();
    await new Promise((r) => window.addEventListener("hashchange", r, { once: true }));
    await flush();
    expect(document.querySelector("h1")?.textContent).toBe("Today");
  });
  it("tab bar has exactly Today, Repertoire, Settings, also on #/edit", async () => {
    mountApp();
    const hrefs = () => [...document.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));
    expect(hrefs()).toEqual(["#/today", "#/repertoire", "#/settings"]);
    await nav("#/edit");
    expect(hrefs()).toEqual(["#/today", "#/repertoire", "#/settings"]);
  });
  it("renaming on #/edit shows on Today after Back", async () => {
    mountApp();
    await nav("#/edit");
    edit("a").click();
    field("#task-name").value = "Renamed scales";
    await submit();
    await nav("#/today");
    expect(mainText()).toContain("Renamed scales");
  });
  it("a running timer survives the round trip: same task, ticking again, away time counted", async () => {
    const { timer } = mountApp();
    await flush();
    actBtn("a").click();
    expect(everyCalls).toBe(1);
    await nav("#/edit");
    clock += 3 * MIN;
    await nav("#/today");
    const s = timer.controller.snapshot();
    expect(s.phase).toBe("running");
    expect(s.taskId).toBe("a");
    expect(s.remainingMs).toBe(7 * MIN);
    expect(everyCalls).toBe(2);
    expect(row("a")!.classList.contains("running")).toBe(true);
    expect(row("a")!.querySelector(".time")!.textContent).toBe("7:00");
    clock += MIN;
    tickFn!();
    expect(row("a")!.querySelector(".time")!.textContent).toBe("6:00");
  });
  it("editing minutes of the running task keeps it running with the original target", async () => {
    const { timer } = mountApp();
    await flush();
    actBtn("a").click();
    await nav("#/edit");
    edit("a").click();
    field("#task-minutes").value = "2";
    await submit();
    await nav("#/today");
    expect(timer.controller.snapshot().phase).toBe("running");
    clock += 5 * MIN;
    tickFn!();
    expect(row("a")!.querySelector(".time")!.textContent).toBe("5:00");
  });
  it("the wake lock is re-acquired on return and a chime after return reaches the new view", async () => {
    mountApp();
    await flush();
    actBtn("a").click();
    expect(acquires).toBe(1);
    await nav("#/edit");
    expect(wake[wake.length - 1]).toBe("release");
    await nav("#/today");
    expect(acquires).toBe(2);
    clock += 10 * MIN + 100;
    tickFn!();
    expect(chimes).toBe(1);
  });
  it("overrun within grace chimes exactly once on return", async () => {
    mountApp();
    await flush();
    actBtn("a").click();
    await nav("#/edit");
    clock += 10 * MIN + config.today.chimeGraceMs - 1;
    await nav("#/today");
    expect(chimes).toBe(1);
    tickFn!();
    expect(chimes).toBe(1);
  });
  it("overrun beyond grace does not chime on return", async () => {
    mountApp();
    await flush();
    actBtn("a").click();
    await nav("#/edit");
    clock += 10 * MIN + config.today.chimeGraceMs + 1;
    await nav("#/today");
    tickFn!();
    expect(chimes).toBe(0);
  });
  it("deleting the running task on #/edit idles the timer and releases the wake lock via the env feedback", async () => {
    const { timer } = mountApp();
    await flush();
    actBtn("a").click();
    await nav("#/edit");
    const releases = () => wake.filter((w) => w === "release").length;
    const before = releases();
    edit("a").click();
    await del();
    expect(timer.controller.snapshot().phase).toBe("idle");
    expect(releases()).toBe(before + 1);
    undoBtn()!.click();
    await flush();
    expect(row("a")).not.toBeNull();
    expect(timer.controller.snapshot().phase).toBe("idle");
    await nav("#/today");
    expect(row("a")!.classList.contains("running")).toBe(false);
  });
  it("leaving with the sheet open leaves no sheet and no live toast timer", async () => {
    mountApp();
    await nav("#/edit");
    edit("a").click();
    await del();
    const t = timers[timers.length - 1]!;
    edit("b").click();
    expect(document.querySelector(".sheet")).not.toBeNull();
    await nav("#/today");
    expect(document.querySelector(".sheet")).toBeNull();
    expect(t.cancelled).toBe(true);
  });
});
