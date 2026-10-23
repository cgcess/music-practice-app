// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import type { MetronomeEnv } from "../src/ui/metronome";
import type { Feedback } from "../src/ui/feedback";
import type { NewTask, TaskItem, TaskSnapshot, TimerPrefs, TodayPort } from "../src/ui/ports";
import { todayView, type TodayEnv } from "../src/ui/today";

const MIN = 60000;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let clock: number;
let tasks: TaskItem[];
let prefs: TimerPrefs;
let calls: [string, string | null][];
let added: NewTask[];
let updated: [string, NewTask][];
let deleted: string[];
let restored: TaskSnapshot[];
let addError: Error | null;
let deleteError: Error | null;
let afterMs: number[];
let deleteCalls: number;
let tickFn: (() => void) | null;
let tickCancelled: number;
let toastFn: (() => void) | null;
let chimes: number;
let wake: string[];
let disposedFb: number;
let tempo = 100;
let metroEnv: MetronomeEnv | undefined;
let tempoSaves: number[] = [];
let views: { dispose: () => void }[] = [];

const task = (id: string, name: string, minutes: number, days: TaskItem["days"] = "daily", last: string | null = null): TaskItem => ({
  id,
  name,
  minutes,
  days,
  lastCompletedOn: last,
});

// Song seam stubs; tests/todaySongs.test.ts exercises these through its own port.
const songState = async (): Promise<{ songsPerDay: number; songs: { id: string; title: string; ratedToday: boolean }[] }> => ({ songsPerDay: 0, songs: [] });
const rateStub = async (id: string, _r: string) => ({ id, title: "", dueDate: "2026-10-23", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" });
const restoreStub = (_s: unknown) => {};

function mk() {
  const port: TodayPort = {
    listTasks: async () => tasks.map((t) => ({ ...t })),
    addTask: async (t) => {
      if (addError) throw addError;
      added.push(t);
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
    setCompleted: async (id, d) => {
      calls.push([id, d]);
      const t = tasks.find((x) => x.id === id)!;
      t.lastCompletedOn = d;
    },
    getTimerPrefs: async () => prefs,
    getTempo: async () => tempo,
    repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
    setTempo: async (b) => {
      tempo = b;
      tempoSaves.push(b);
    },
    listTodaySongs: async () => songState(),
    rateTodaySong: async (id, rating) => rateStub(id, rating),
    restoreTodaySong: async (snap) => {
      restoreStub(snap);
    },
  };
  const feedback: Feedback = {
    prime() {},
    chime: () => {
      chimes++;
    },
    acquireWakeLock: () => {
      wake.push("acquire");
    },
    releaseWakeLock: () => {
      wake.push("release");
    },
    dispose: () => {
      disposedFb++;
    },
  };
  const env: TodayEnv = {
    port,
    now: () => clock,
    feedback,
    every: (fn) => {
      tickFn = fn;
      return () => {
        tickCancelled++;
        tickFn = null;
      };
    },
    after: (fn, ms) => {
      afterMs.push(ms);
      toastFn = fn;
      return () => {
        toastFn = null;
      };
    },
    onVisible: () => () => {},
    metronome: metroEnv,
  };
  const v = todayView(env);
  views.push(v);
  document.body.replaceChildren(v.el);
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
const row = (id: string) => document.querySelector(`li[data-id="${id}"]`) as HTMLElement;
const btn = (id: string) => row(id).querySelector("button.act") as HTMLButtonElement;
const timeOf = (id: string) => row(id).querySelector(".time")!.textContent;

afterEach(() => {
  for (const v of views) v.dispose();
  views = [];
  document.body.replaceChildren();
});

beforeEach(() => {
  tempo = 100;
  tempoSaves = [];
  metroEnv = undefined;
  // Thursday 2026-10-22, local noon.
  clock = new Date(2026, 9, 22, 12).getTime();
  tasks = [
    task("a", "Scales", 10),
    task("b", "Arpeggios", 5, [4]),
    task("c", "Sight reading", 15, [1]),
    task("d", "Etudes", 20, "daily", "2026-10-22"),
  ];
  prefs = { sound: true, vibrate: true, overtime: true };
  calls = [];
  added = [];
  updated = [];
  deleted = [];
  restored = [];
  addError = null;
  deleteError = null;
  afterMs = [];
  deleteCalls = 0;
  tickFn = null;
  tickCancelled = 0;
  toastFn = null;
  chimes = 0;
  wake = [];
  disposedFb = 0;
});

describe("today view", () => {
  it("lists due tasks with minutes and excludes non-due", async () => {
    mk();
    await flush();
    expect(document.querySelector("h1")?.textContent).toBe("Today");
    expect(row("a").textContent).toContain("Scales");
    expect(row("a").textContent).toContain("10 min");
    expect(row("b")).not.toBeNull();
    expect(row("c")).toBeNull();
    expect(row("d").classList.contains("done")).toBe(true);
    expect(row("d").querySelector("button.act")).toBeNull();
  });

  it("button starts then finishes, shows countdown and writes completion", async () => {
    mk();
    await flush();
    btn("a").click();
    expect(row("a").classList.contains("running")).toBe(true);
    expect(timeOf("a")).toBe("10:00");
    expect(wake).toEqual(["acquire"]);
    clock += 3 * MIN;
    tickFn!();
    expect(timeOf("a")).toBe("7:00");
    btn("a").click();
    await flush();
    expect(calls).toEqual([["a", "2026-10-22"]]);
    expect(row("a").classList.contains("done")).toBe(true);
    expect(wake).toEqual(["acquire", "release"]);
    expect(tickFn).toBeNull();
  });

  it("chimes at the target and counts overtime; overtime off shows time up", async () => {
    mk();
    await flush();
    btn("b").click();
    clock += 5 * MIN;
    tickFn!();
    expect(chimes).toBe(1);
    clock += 65_000;
    tickFn!();
    expect(chimes).toBe(1);
    expect(timeOf("b")).toBe("+1:05");
  });

  it("shows time up when overtime is off", async () => {
    prefs.overtime = false;
    mk();
    await flush();
    btn("b").click();
    clock += 6 * MIN;
    tickFn!();
    expect(timeOf("b")).toContain("time up");
  });

  it("horizontal swipe starts and finishes; vertical drag does nothing", async () => {
    mk();
    await flush();
    swipe(row("a"), 20, 200);
    expect(row("a").classList.contains("running")).toBe(false);
    swipe(row("a"), 120, 5);
    expect(row("a").classList.contains("running")).toBe(true);
    swipe(row("a"), 20, 200);
    expect(row("a").classList.contains("running")).toBe(true);
    swipe(row("a"), 120, 5);
    await flush();
    expect(calls).toEqual([["a", "2026-10-22"]]);
  });

  it("starting another task stops the first without completing it", async () => {
    mk();
    await flush();
    btn("a").click();
    btn("b").click();
    expect(row("a").classList.contains("running")).toBe(false);
    expect(row("b").classList.contains("running")).toBe(true);
    expect(calls).toEqual([]);
  });

  it("Done - Undo restores the previous lastCompletedOn", async () => {
    tasks[0]!.lastCompletedOn = "2026-10-20";
    mk();
    await flush();
    btn("a").click();
    btn("a").click();
    await flush();
    const toast = document.querySelector(".toast")!;
    expect(toast.textContent).toBe("Done · Undo");
    (toast.querySelector("button.undo") as HTMLButtonElement).click();
    await flush();
    expect(calls).toEqual([
      ["a", "2026-10-22"],
      ["a", "2026-10-20"],
    ]);
    expect(row("a").classList.contains("done")).toBe(false);
    expect(document.querySelector(".toast")!.textContent).toBe("");
  });

  it("toast disappears after the undo window", async () => {
    mk();
    await flush();
    btn("a").click();
    btn("a").click();
    await flush();
    expect(config.today.undoMs).toBeGreaterThan(0);
    toastFn!();
    expect(document.querySelector(".toast")!.textContent).toBe("");
  });

  describe("row state classes", () => {
    const has = (id: string, c: string) => row(id).classList.contains(c);
    const overlay = () => document.querySelector(".focus, .focus-time");
    it("start: running only, no overlay; tapping the row opens nothing", async () => {
      mk();
      await flush();
      btn("a").click();
      expect(has("a", "running")).toBe(true);
      expect(has("a", "overtime")).toBe(false);
      expect(overlay()).toBeNull();
      (row("a").querySelector(".row-body") as HTMLElement).click();
      expect(overlay()).toBeNull();
      expect(has("a", "running")).toBe(true);
    });
    it("overtime on: running overtime with +m:ss past target", async () => {
      mk();
      await flush();
      btn("b").click();
      clock += 4 * MIN;
      tickFn!();
      expect(has("b", "overtime")).toBe(false);
      clock += 2 * MIN;
      tickFn!();
      expect(has("b", "running")).toBe(true);
      expect(has("b", "overtime")).toBe(true);
      expect(timeOf("b")).toBe("+1:00");
    });
    it("overtime off: time up uses the overtime class", async () => {
      prefs.overtime = false;
      mk();
      await flush();
      btn("b").click();
      clock += 6 * MIN;
      tickFn!();
      expect(has("b", "overtime")).toBe(true);
      expect(timeOf("b")).toContain("time up");
    });
    it("finish clears both classes", async () => {
      mk();
      await flush();
      btn("b").click();
      clock += 6 * MIN;
      tickFn!();
      btn("b").click();
      await flush();
      expect(has("b", "done")).toBe(true);
      expect(has("b", "running")).toBe(false);
      expect(has("b", "overtime")).toBe(false);
    });
    it("starting another task clears both classes on the first", async () => {
      mk();
      await flush();
      btn("a").click();
      clock += 11 * MIN;
      tickFn!();
      expect(has("a", "overtime")).toBe(true);
      btn("b").click();
      expect(has("a", "running")).toBe(false);
      expect(has("a", "overtime")).toBe(false);
      expect(has("b", "running")).toBe(true);
      expect(has("b", "overtime")).toBe(false);
    });
  });

  it("dispose clears the interval, releases the wake lock and feedback", async () => {
    const v = mk();
    await flush();
    btn("a").click();
    v.dispose();
    expect(tickCancelled).toBe(1);
    expect(wake).toContain("release");
    expect(disposedFb).toBe(1);
  });
});

describe("add form", () => {
  const openSheet = () => (document.querySelector("button.add-btn") as HTMLButtonElement).click();
  const fill = (name: string, mins: string) => {
    (document.querySelector("#task-name") as HTMLInputElement).value = name;
    (document.querySelector("#task-minutes") as HTMLInputElement).value = mins;
  };
  const submit = async () => {
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
  };
  const err = () => document.querySelector("[role=alert]")!.textContent;

  it("submits a daily task", async () => {
    mk();
    await flush();
    openSheet();
    fill("Long tones", "12");
    await submit();
    expect(added).toEqual([{ name: "Long tones", minutes: 12, days: "daily" }]);
    expect(document.querySelector(".sheet")).toBeNull();
  });
  it("submits chosen weekdays when Daily is unchecked", async () => {
    mk();
    await flush();
    openSheet();
    (document.querySelector("#task-daily") as HTMLInputElement).checked = false;
    const boxes = document.querySelectorAll<HTMLInputElement>("input[name=day]");
    boxes[1]!.checked = true;
    boxes[3]!.checked = true;
    fill("Etude", "5");
    await submit();
    expect(added).toEqual([{ name: "Etude", minutes: 5, days: [1, 3] }]);
  });
  it("rejects an empty name", async () => {
    mk();
    await flush();
    openSheet();
    fill("  ", "5");
    await submit();
    expect(added).toEqual([]);
    expect(err()).toMatch(/name/i);
  });
  it("rejects no weekday and not Daily", async () => {
    mk();
    await flush();
    openSheet();
    (document.querySelector("#task-daily") as HTMLInputElement).checked = false;
    fill("X", "5");
    await submit();
    expect(added).toEqual([]);
    expect(err()).toMatch(/daily|day/i);
  });
  it("shows a port validation error inline", async () => {
    addError = new Error("minutes: expected integer in 1..240");
    mk();
    await flush();
    openSheet();
    fill("X", "999");
    await submit();
    expect(err()).toBe("minutes: expected integer in 1..240");
    expect(document.querySelector(".sheet")).not.toBeNull();
  });
  it("opens from + and closes on Cancel, Escape and backdrop without adding", async () => {
    mk();
    await flush();
    expect(document.querySelector(".sheet")).toBeNull();
    openSheet();
    expect(document.querySelector(".sheet")).not.toBeNull();
    (document.querySelector("button.cancel") as HTMLButtonElement).click();
    expect(document.querySelector(".sheet")).toBeNull();
    openSheet();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".sheet")).toBeNull();
    openSheet();
    document.querySelector(".sheet-backdrop")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".sheet")).toBeNull();
    expect(added).toEqual([]);
  });
});

describe("today layout", () => {
  const ids = (sel: string) => [...document.querySelectorAll<HTMLElement>(`${sel} li`)].map((l) => l.dataset.id);
  it("header shows title, date and summary counts and minutes", async () => {
    mk();
    await flush();
    expect(document.querySelector("h1")?.textContent).toBe("Today");
    expect(document.querySelector(".date")?.textContent).toMatch(/22/);
    // due today: a(10), b(5), d(20, done) -> 1 of 3, 15 min left
    expect(document.querySelector(".summary")?.textContent).toBe("1 of 3 · 15 min left");
  });
  it("finishing moves a row from To do to Done and Undo moves it back", async () => {
    mk();
    await flush();
    expect(ids(".todo")).toEqual(["a", "b"]);
    expect(ids(".done-group")).toEqual(["d"]);
    btn("a").click();
    btn("a").click();
    await flush();
    expect(ids(".todo")).toEqual(["b"]);
    expect(ids(".done-group")).toEqual(["a", "d"]);
    expect(row("a").querySelector("button.act")).toBeNull();
    expect(document.querySelector(".summary")?.textContent).toBe("2 of 3 · 5 min left");
    (document.querySelector("button.undo") as HTMLButtonElement).click();
    await flush();
    expect(ids(".todo")).toEqual(["a", "b"]);
    expect(ids(".done-group")).toEqual(["d"]);
  });
  it("Done is collapsible", async () => {
    mk();
    await flush();
    const toggle = document.querySelector("button.group-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(document.querySelector(".done-group ul")!.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("button.group-toggle")!.getAttribute("aria-expanded")).toBe("false");
  });
  it("shows empty states", async () => {
    tasks = [task("c", "Sight reading", 15, [1])];
    mk();
    await flush();
    expect(document.querySelector(".empty-card:not([hidden])")?.textContent).toMatch(/No tasks due/);
    tasks = [task("d", "Etudes", 20, "daily", "2026-10-22")];
    mk();
    await flush();
    expect(document.querySelector(".todo .empty-card")?.textContent).toBe("All done for today");
    // t017: every due task finished and no songs section is Day done.
    expect(document.querySelector(".summary")?.textContent).toBe("Day done");
  });
  it("a swipe follows the finger, and a cancelled partial drag leaves no drag transform", async () => {
    mk();
    await flush();
    const r = row("a");
    const body = r.querySelector(".row-body") as HTMLElement;
    r.dispatchEvent(ev("pointerdown", 0, 0));
    r.dispatchEvent(ev("pointermove", 30, 2));
    expect(body.style.transform).toBe("translateX(30px)");
    r.dispatchEvent(ev("pointercancel", 30, 2));
    expect(body.style.transform).toBe("");
    expect(r.classList.contains("running")).toBe(false);
  });
});

describe("Edit button", () => {
  it("navigates to #/edit instead of toggling rows; rows keep their act buttons", async () => {
    mk();
    await flush();
    const toggle = document.querySelector("button.edit-toggle") as HTMLButtonElement;
    expect(toggle.textContent).toBe("Edit");
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);
    location.hash = "";
    toggle.click();
    expect(location.hash).toBe("#/edit");
    expect(toggle.textContent).toBe("Edit");
    expect(btn("a")).not.toBeNull();
    expect(document.querySelector(".row-body[data-edit]")).toBeNull();
    expect(document.querySelector(".sheet")).toBeNull();
    location.hash = "";
  });
  it("a plain click on a row does nothing", async () => {
    mk();
    await flush();
    (row("a").querySelector(".row-body") as HTMLElement).click();
    expect(row("a").classList.contains("running")).toBe(false);
    expect(document.querySelector(".sheet")).toBeNull();
  });
});

describe("metronome on Today", () => {
  let created = 0;
  let closed = 0;
  let clicks = 0;
  let mtick: (() => void) | null = null;
  const useFakeMetronome = () => {
    created = 0;
    closed = 0;
    clicks = 0;
    mtick = null;
    metroEnv = {
      createAudioContext: () => {
        created++;
        return {
          currentTime: 0,
          destination: {},
          createOscillator: () => ({ frequency: { value: 0 }, connect: () => {}, start: () => clicks++, stop: () => {} }),
          createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
          close: () => {
            closed++;
          },
        };
      },
      every: (fn) => {
        mtick = fn;
        return () => {
          mtick = null;
        };
      },
      onVisible: () => () => {},
    };
  };
  const editToggle = () => document.querySelector("button.edit-toggle") as HTMLButtonElement;
  const play = () => document.querySelector(".metro-play") as HTMLButtonElement;
  const playing = () => play().getAttribute("aria-pressed") === "true";

  it("renders in the header under the title and the task list stays visible collapsed and expanded", async () => {
    tempo = 140;
    mk();
    await flush();
    const header = document.querySelector("header.large-header")!;
    expect(header.querySelector(".metronome")).not.toBeNull();
    expect(header.firstElementChild?.querySelector("h1")?.textContent).toBe("Today");
    expect(document.querySelector(".metro-bpm")!.textContent).toBe("140 BPM");
    const t = document.querySelector(".metro-toggle") as HTMLButtonElement;
    for (let i = 0; i < 2; i++) {
      expect(document.querySelector("ul.task-list li.task")).not.toBeNull();
      expect(row("a").hidden).toBe(false);
      t.click();
    }
    expect(document.querySelector(".metro-slider")).not.toBeNull();
  });
  it("timer start, finish and the Edit button leave the metronome alone, and the reverse", async () => {
    useFakeMetronome();
    mk();
    await flush();
    play().click();
    expect(playing()).toBe(true);
    btn("a").click();
    expect(playing()).toBe(true);
    editToggle().click();
    expect(playing()).toBe(true);
    btn("a").click(); // finish
    await flush();
    expect(playing()).toBe(true);
    expect(created).toBe(1);
    expect(closed).toBe(0);
    play().click();
    expect(playing()).toBe(false);
  });
  it("metronome play/stop does not start, stop or finish a running task", async () => {
    useFakeMetronome();
    mk();
    await flush();
    btn("a").click();
    expect(row("a").classList.contains("running")).toBe(true);
    play().click();
    play().click();
    expect(row("a").classList.contains("running")).toBe(true);
    expect(calls).toEqual([]);
    expect(timeOf("a")).not.toBe("");
  });
  it("dispose stops the metronome", async () => {
    useFakeMetronome();
    const v = mk();
    await flush();
    play().click();
    v.dispose();
    expect(closed).toBe(1);
    expect(mtick).toBeNull();
  });
  it("saves the tempo through the port", async () => {
    mk();
    await flush();
    (document.querySelector(".metro-step:last-of-type") as HTMLButtonElement).click();
    expect(tempoSaves).toEqual([101]);
  });
});
