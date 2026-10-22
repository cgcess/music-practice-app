// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config";
import type { Snapshot } from "../src/today/timer";
import { openFocus, type FocusHandle } from "../src/ui/focus";
import type { Feedback } from "../src/ui/feedback";
import type { TaskItem, TimerPrefs, TodayPort } from "../src/ui/ports";
import { todayView, type TodayEnv } from "../src/ui/today";

const MIN = 60000;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const ev = (type: string, x: number, y: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y });
  return e;
};
const key = (k: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
const dlg = () => document.querySelector<HTMLElement>(".focus");
const timeText = () => document.querySelector(".focus-time")?.textContent;
const bar = () => document.querySelector(".ring-bar") as SVGElement;
const offset = () => Number(bar().getAttribute("stroke-dashoffset"));
const snap = (p: Partial<Snapshot>): Snapshot => ({ phase: "running", taskId: "a", remainingMs: 0, overtimeMs: 0, ...p });
const autoOpenDefault = config.today.autoOpenFocus;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  config.today.autoOpenFocus = autoOpenDefault;
});

describe("openFocus", () => {
  const open = (extra: Partial<Parameters<typeof openFocus>[0]> = {}) => {
    const calls: string[] = [];
    const h = openFocus({
      task: { id: "a", name: "Scales", minutes: 10 },
      snap: snap({ remainingMs: 10 * MIN }),
      onFinish: () => calls.push("finish"),
      onClose: () => calls.push("close"),
      ...extra,
    });
    return { h, calls };
  };

  it("renders dialog semantics, name, and the first frame", () => {
    open();
    const d = dlg()!;
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-label")).toBe("Scales");
    expect(d.textContent).toContain("Scales");
    expect(timeText()).toBe("10:00");
    expect(offset()).toBe(1);
    expect(d.style.getPropertyValue("--focus-ms")).toBe(`${config.today.focusMs}ms`);
  });
  it("updates remaining time and ring for running", () => {
    const { h } = open();
    h.update(snap({ remainingMs: 5 * MIN }));
    expect(timeText()).toBe("5:00");
    expect(offset()).toBeCloseTo(0.5);
  });
  it("overtime: full warning ring and +m:ss", () => {
    const { h } = open();
    h.update(snap({ phase: "overtime", overtimeMs: 65000 }));
    expect(timeText()).toBe("+1:05");
    expect(offset()).toBe(0);
    expect(bar().style.getPropertyValue("stroke")).toBe("var(--warning)");
  });
  it("time's up: full neutral ring and text", () => {
    const { h } = open();
    h.update(snap({ phase: "timesup" }));
    expect(timeText()).toBe("Time's up");
    expect(offset()).toBe(0);
    expect(bar().style.getPropertyValue("stroke")).toBe("var(--label-2)");
  });
  it("Finish calls onFinish without onClose and removes the dialog", () => {
    const { calls } = open();
    (document.querySelector(".focus-finish") as HTMLElement).click();
    expect(calls).toEqual(["finish"]);
    expect(dlg()).toBeNull();
  });
  it("Escape and the close control close and call onClose; removal after the animation", () => {
    const a = open();
    key("Escape");
    expect(a.calls).toEqual(["close"]);
    vi.advanceTimersByTime(config.today.focusMs);
    expect(dlg()).toBeNull();
    const b = open();
    (document.querySelector(".focus-close") as HTMLElement).click();
    expect(b.calls).toEqual(["close"]);
  });
  it("close is idempotent and immediate removes at once", () => {
    const { h, calls } = open();
    h.close(true);
    h.close();
    expect(calls).toEqual(["close"]);
    expect(dlg()).toBeNull();
  });
  it("traps Tab inside the dialog", () => {
    open();
    const finish = document.querySelector(".focus-finish") as HTMLElement;
    const close = document.querySelector(".focus-close") as HTMLElement;
    finish.focus();
    key("Tab");
    expect(document.activeElement).toBe(close);
    key("Tab", true);
    expect(document.activeElement).toBe(finish);
  });
  it("drag down closes; below threshold springs back", () => {
    const { calls } = open();
    const d = dlg()!;
    d.dispatchEvent(ev("pointerdown", 0, 0));
    d.dispatchEvent(ev("pointermove", 0, 50));
    expect(d.style.transform).toBe("translateY(50px)");
    d.dispatchEvent(ev("pointerup", 0, 50));
    expect(d.style.transform).toBe("");
    expect(calls).toEqual([]);
    d.dispatchEvent(ev("pointerdown", 0, 0));
    d.dispatchEvent(ev("pointermove", 0, 200));
    d.dispatchEvent(ev("pointercancel", 0, 200));
    expect(calls).toEqual([]);
    d.dispatchEvent(ev("pointerdown", 0, 0));
    d.dispatchEvent(ev("pointerup", 0, config.today.focusCloseMinPx));
    expect(calls).toEqual(["close"]);
  });
  it("source avoids forbidden selectors and innerHTML", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/ui/focus.ts", "utf8");
    expect(src).not.toMatch(/innerHTML|\.\.\/data|"h1"|role="alert"|\.sheet|\.toast|button\.undo/);
  });
});

// ---- Today wiring ----
let clock: number;
let tasks: TaskItem[];
let prefs: TimerPrefs;
let calls: [string, string | null][];
let tickFn: (() => void) | null;
let toastFn: (() => void) | null;
let wake: string[];
let views: { dispose: () => void }[] = [];

function mk() {
  const port: TodayPort = {
    listTasks: async () => tasks.map((t) => ({ ...t })),
    addTask: async () => {},
    setCompleted: async (id, d) => {
      calls.push([id, d]);
      tasks.find((x) => x.id === id)!.lastCompletedOn = d;
    },
    getTimerPrefs: async () => prefs,
  };
  const feedback: Feedback = {
    prime() {},
    chime() {},
    acquireWakeLock: () => void wake.push("acquire"),
    releaseWakeLock: () => void wake.push("release"),
    dispose() {},
  };
  const env: TodayEnv = {
    port,
    now: () => clock,
    feedback,
    every: (fn) => {
      tickFn = fn;
      return () => {
        tickFn = null;
      };
    },
    after: (fn) => {
      toastFn = fn;
      return () => {
        toastFn = null;
      };
    },
    onVisible: () => () => {},
  };
  const v = todayView(env);
  views.push(v);
  document.body.replaceChildren(v.el);
  return v;
}
const row = (id: string) => document.querySelector(`li[data-id="${id}"]`) as HTMLElement;
const btn = (id: string) => row(id).querySelector("button.act") as HTMLButtonElement;
const body = (id: string) => row(id).querySelector(".row-body") as HTMLElement;
const tick = (ms: number) => {
  clock += ms;
  tickFn!();
};

describe("today focus wiring", () => {
  beforeEach(() => {
    clock = new Date(2026, 9, 22, 12).getTime();
    tasks = [
      { id: "a", name: "Scales", minutes: 10, days: "daily", lastCompletedOn: null },
      { id: "b", name: "Etudes", minutes: 5, days: "daily", lastCompletedOn: null },
    ];
    prefs = { sound: true, vibrate: true, overtime: true };
    calls = [];
    tickFn = null;
    toastFn = null;
    wake = [];
    config.today.autoOpenFocus = true;
  });
  afterEach(() => {
    for (const v of views) v.dispose();
    views = [];
  });

  const started = async () => {
    mk();
    await flush();
    btn("a").click();
  };

  it("autoOpen true opens on start, populated before the first tick", async () => {
    await started();
    expect(dlg()).not.toBeNull();
    expect(timeText()).toBe("10:00");
    expect(offset()).toBe(1);
  });
  it("autoOpen false does not open; tapping the running row does", async () => {
    config.today.autoOpenFocus = false;
    await started();
    expect(dlg()).toBeNull();
    body("a").click();
    expect(dlg()).not.toBeNull();
  });
  it("row-body tap opens the running row with autoOpen true after closing", async () => {
    await started();
    key("Escape");
    vi.advanceTimersByTime(config.today.focusMs);
    expect(dlg()).toBeNull();
    body("a").click();
    expect(dlg()).not.toBeNull();
  });
  it("tapping a non-running row opens nothing", async () => {
    config.today.autoOpenFocus = false;
    await started();
    body("b").click();
    expect(dlg()).toBeNull();
  });
  it("ring and time follow the clock; overtime shows +m:ss in warning", async () => {
    await started();
    tick(5 * MIN);
    expect(timeText()).toBe("5:00");
    expect(offset()).toBeCloseTo(0.5);
    tick(5 * MIN + 3000);
    expect(timeText()).toBe("+0:03");
    expect(offset()).toBe(0);
    expect(bar().style.getPropertyValue("stroke")).toBe("var(--warning)");
  });
  it("overtime on, at target: +0:00", async () => {
    await started();
    tick(10 * MIN);
    expect(timeText()).toBe("+0:00");
  });
  it("overtime off, at target: stays open as Time's up (neutral)", async () => {
    prefs = { ...prefs, overtime: false };
    await started();
    tick(10 * MIN);
    expect(dlg()).not.toBeNull();
    expect(timeText()).toBe("Time's up");
    expect(dlg()!.dataset.phase).toBe("timesup");
    expect(bar().style.getPropertyValue("stroke")).toBe("var(--label-2)");
    expect(row("a").classList.contains("running")).toBe(true);
  });
  it("Finish matches the row swipe: setCompleted, Undo toast, focus on Undo", async () => {
    await started();
    (document.querySelector(".focus-finish") as HTMLElement).click();
    await flush();
    expect(dlg()).toBeNull();
    expect(calls).toEqual([["a", "2026-10-22"]]);
    expect(document.querySelector(".toast")!.textContent).toContain("Done");
    expect(document.activeElement).toBe(document.querySelector("button.undo"));
    expect(wake.at(-1)).toBe("release");
    expect(row("a").parentElement!.parentElement!.classList.contains("done-group")).toBe(true);
  });
  const closers: [string, () => void][] = [
    ["Escape", () => key("Escape")],
    ["close control", () => (document.querySelector(".focus-close") as HTMLElement).click()],
    [
      "drag down",
      () => {
        dlg()!.dispatchEvent(ev("pointerdown", 0, 0));
        dlg()!.dispatchEvent(ev("pointerup", 0, 200));
      },
    ],
  ];
  for (const [name, closeIt] of closers) {
    it(`${name} closes with the timer still running`, async () => {
      await started();
      expect(dlg()).not.toBeNull();
      closeIt();
      vi.advanceTimersByTime(config.today.focusMs);
      expect(dlg()).toBeNull();
      expect(row("a").classList.contains("running")).toBe(true);
      expect(wake).toEqual(["acquire"]);
      expect(document.activeElement).toBe(btn("a"));
    });
  }
  it("below-threshold drag and pointercancel do not close", async () => {
    await started();
    const d = dlg()!;
    d.dispatchEvent(ev("pointerdown", 0, 0));
    d.dispatchEvent(ev("pointerup", 0, 50));
    d.dispatchEvent(ev("pointerdown", 0, 0));
    d.dispatchEvent(ev("pointercancel", 0, 300));
    expect(dlg()!.classList.contains("closing")).toBe(false);
  });
  it("focus returns to the running row's button after row-tap open and close", async () => {
    config.today.autoOpenFocus = false;
    await started();
    body("a").click();
    expect(document.activeElement).not.toBe(btn("a"));
    key("Escape");
    expect(document.activeElement).toBe(btn("a"));
  });
  it("a committed horizontal swipe finish does not open focus", async () => {
    config.today.autoOpenFocus = false;
    await started();
    const li = row("a");
    li.dispatchEvent(ev("pointerdown", 0, 0));
    li.dispatchEvent(ev("pointerup", 200, 0));
    await flush();
    body("a")?.click();
    expect(dlg()).toBeNull();
  });
  it("render() while open leaves activeElement inside .focus", async () => {
    await started();
    expect(dlg()!.contains(document.activeElement)).toBe(true);
    (document.querySelector(".group-toggle") as HTMLElement).click(); // triggers render()
    expect(dlg()!.contains(document.activeElement)).toBe(true);
  });
  it("dispose removes the dialog and the Escape listener", async () => {
    const v = mk();
    await flush();
    btn("a").click();
    expect(dlg()).not.toBeNull();
    v.dispose();
    expect(dlg()).toBeNull();
    key("Escape");
    expect(document.activeElement).not.toBeNull();
  });
});
