import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { TimerController, formatOvertime, formatRemaining } from "../src/today/timer";

let t = 0;
let chimes: string[] = [];
let overtime = true;
const mk = () =>
  new TimerController({
    now: () => t,
    graceMs: config.today.chimeGraceMs,
    overtime: () => overtime,
    onChime: (id) => chimes.push(id),
  });
const MIN = 60000;

beforeEach(() => {
  t = 1_000_000;
  chimes = [];
  overtime = true;
});

describe("TimerController", () => {
  it("starts idle then runs with remaining time", () => {
    const c = mk();
    expect(c.snapshot().phase).toBe("idle");
    c.start("a", 5 * MIN);
    t += MIN;
    const s = c.snapshot();
    expect(s.phase).toBe("running");
    expect(s.remainingMs).toBe(4 * MIN);
    expect(chimes).toEqual([]);
  });
  it("chimes once at the target, then counts overtime", () => {
    const c = mk();
    c.start("a", MIN);
    t += MIN;
    c.tick();
    c.tick();
    t += 1000;
    c.tick();
    expect(chimes).toEqual(["a"]);
    const s = c.snapshot();
    expect(s.phase).toBe("overtime");
    expect(s.overtimeMs).toBe(1000);
  });
  it("chimes at target+grace boundary but not a late tick", () => {
    const c = mk();
    c.start("a", MIN);
    t += MIN + 1000;
    c.tick();
    expect(chimes).toEqual(["a"]);
    const d = mk();
    chimes = [];
    d.start("b", MIN);
    t += MIN + 10 * MIN;
    d.tick();
    expect(chimes).toEqual([]);
    t += 1000;
    d.tick();
    expect(chimes).toEqual([]);
    expect(d.snapshot().phase).toBe("overtime");
  });
  it("overtime off stops at time up", () => {
    overtime = false;
    const c = mk();
    c.start("a", MIN);
    t += 5 * MIN;
    const s = c.snapshot();
    expect(s.phase).toBe("timesup");
    expect(s.overtimeMs).toBe(0);
  });
  it("a second start replaces the first without completing it", () => {
    const c = mk();
    c.start("a", MIN);
    c.start("b", MIN);
    expect(c.snapshot().taskId).toBe("b");
    expect(c.done()).toBe("b");
  });
  it("chimes again for a new start", () => {
    const c = mk();
    c.start("a", MIN);
    t += MIN;
    c.tick();
    c.start("a", MIN);
    t += MIN;
    c.tick();
    expect(chimes).toEqual(["a", "a"]);
  });
  it("done ends the timer and reports done", () => {
    const c = mk();
    expect(c.done()).toBeNull();
    c.start("a", MIN);
    expect(c.done()).toBe("a");
    const s = c.snapshot();
    expect(s.phase).toBe("done");
    expect(s.taskId).toBe("a");
    c.tick();
    expect(chimes).toEqual([]);
  });
  it("stop returns to idle", () => {
    const c = mk();
    c.start("a", MIN);
    c.stop();
    expect(c.snapshot().phase).toBe("idle");
  });
});

describe("formatting", () => {
  it("rounds countdown up and overtime down", () => {
    expect(formatRemaining(MIN)).toBe("1:00");
    expect(formatRemaining(59_001)).toBe("1:00");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatOvertime(0)).toBe("+0:00");
    expect(formatOvertime(61_999)).toBe("+1:01");
  });
});
