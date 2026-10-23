import { describe, expect, it } from "vitest";
import { createScheduler } from "../src/ui/metronomeScheduler";

function rig(bpm = 120, lookaheadMs = 100, tickMs = 25) {
  let now = 10;
  let bp = bpm;
  const times: number[] = [];
  let tick: (() => void) | null = null;
  const s = createScheduler({
    audioNow: () => now,
    schedule: (t) => times.push(t),
    every: (fn) => {
      tick = fn;
      return () => {
        tick = null;
      };
    },
    bpm: () => bp,
    lookaheadMs,
    tickMs,
  });
  return {
    s,
    times,
    setBpm: (b: number) => (bp = b),
    advance: (ms: number) => {
      now += ms / 1000;
      tick?.();
    },
    hasTick: () => tick !== null,
  };
}

describe("metronome scheduler", () => {
  it("schedules the first beat at start and spaces beats 60/bpm", () => {
    const r = rig(120);
    r.s.start();
    expect(r.times).toEqual([10]);
    for (let i = 0; i < 120; i++) r.advance(25);
    expect(r.times.length).toBeGreaterThan(5);
    r.times.forEach((t, i) => expect(t).toBeCloseTo(10 + i * 0.5, 9));
  });
  it("never queues beyond the lookahead and never duplicates a beat", () => {
    const r = rig(600, 100, 25); // 0.1s per beat
    r.s.start();
    for (let i = 0; i < 20; i++) {
      r.advance(25);
      expect(Math.max(...r.times)).toBeLessThan(10 + (i + 1) * 0.025 + 0.1 + 1e-9);
    }
    expect(new Set(r.times).size).toBe(r.times.length);
  });
  it("catches up after a late tick without duplicates", () => {
    const r = rig(120);
    r.s.start();
    r.advance(1000);
    expect(r.times).toEqual([10, 10.5, 11]);
    expect(new Set(r.times).size).toBe(r.times.length);
  });
  it("applies a tempo change from the next beat", () => {
    const r = rig(60);
    r.s.start(); // beat at 10, next at 11
    r.advance(25);
    r.setBpm(120);
    for (let i = 0; i < 100; i++) r.advance(25);
    expect(r.times[0]).toBe(10);
    expect(r.times[1]).toBeCloseTo(11, 9);
    expect(r.times[2]! - r.times[1]!).toBeCloseTo(0.5, 9);
    expect(r.times[3]! - r.times[2]!).toBeCloseTo(0.5, 9);
  });
  it("stop halts scheduling and start twice is a no-op", () => {
    const r = rig(120);
    r.s.start();
    r.s.start();
    expect(r.s.running()).toBe(true);
    r.s.stop();
    expect(r.hasTick()).toBe(false);
    expect(r.s.running()).toBe(false);
    const n = r.times.length;
    r.advance(1000);
    expect(r.times.length).toBe(n);
  });
});
