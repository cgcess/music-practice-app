// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config";
import { attachSwipe, isSwipeRight } from "../src/ui/swipe";

const ev = (type: string, x: number, y: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y });
  return e;
};
const drag = (el: HTMLElement, dx: number, dy: number) => {
  el.dispatchEvent(ev("pointerdown", 100, 100));
  el.dispatchEvent(ev("pointerup", 100 + dx, 100 + dy));
};

describe("swipe", () => {
  it("fires on a horizontal rightward drag", () => {
    const el = document.createElement("div");
    let n = 0;
    attachSwipe(el, () => n++);
    drag(el, 120, 10);
    expect(n).toBe(1);
  });
  it("ignores vertical, short, leftward and cancelled drags", () => {
    const el = document.createElement("div");
    let n = 0;
    attachSwipe(el, () => n++);
    drag(el, 20, 150);
    drag(el, 70, 70);
    drag(el, 10, 0);
    drag(el, -150, 0);
    el.dispatchEvent(ev("pointerdown", 0, 0));
    el.dispatchEvent(ev("pointercancel", 0, 0));
    el.dispatchEvent(ev("pointerup", 200, 0));
    expect(n).toBe(0);
  });
  it("detaches", () => {
    const el = document.createElement("div");
    let n = 0;
    attachSwipe(el, () => n++)();
    drag(el, 200, 0);
    expect(n).toBe(0);
  });
  it("isSwipeRight thresholds", () => {
    expect(isSwipeRight(60, 0, 60, 2)).toBe(true);
    expect(isSwipeRight(59, 0, 60, 2)).toBe(false);
    expect(isSwipeRight(100, 50, 60, 2)).toBe(false);
  });

  describe("move/end callbacks and haptic", () => {
    const nav = navigator as unknown as { vibrate?: unknown };
    const hadOwn = Object.prototype.hasOwnProperty.call(navigator, "vibrate");
    const orig = nav.vibrate;
    afterEach(() => {
      if (hadOwn) nav.vibrate = orig;
      else delete nav.vibrate;
    });
    const setup = () => {
      const el = document.createElement("div");
      const moves: number[] = [];
      const ends: boolean[] = [];
      let n = 0;
      attachSwipe(el, () => n++, { onMove: (dx) => moves.push(dx), onEnd: (c) => ends.push(c) });
      return { el, moves, ends, count: () => n };
    };
    it("reports dx during a horizontal drag and commits on release", () => {
      const { el, moves, ends, count } = setup();
      el.dispatchEvent(ev("pointerdown", 100, 100));
      el.dispatchEvent(ev("pointermove", 130, 102));
      el.dispatchEvent(ev("pointermove", 190, 103));
      el.dispatchEvent(ev("pointerup", 190, 103));
      expect(moves).toEqual([30, 90]);
      expect(ends).toEqual([true]);
      expect(count()).toBe(1);
    });
    it("under-threshold release gives committed=false", () => {
      const { el, ends, count } = setup();
      drag(el, 30, 0);
      expect(ends).toEqual([false]);
      expect(count()).toBe(0);
    });
    it("a vertical drag reports no horizontal movement and does not commit", () => {
      const { el, moves, ends, count } = setup();
      el.dispatchEvent(ev("pointerdown", 100, 100));
      el.dispatchEvent(ev("pointermove", 105, 200));
      el.dispatchEvent(ev("pointerup", 105, 200));
      expect(moves).toEqual([0]);
      expect(ends).toEqual([false]);
      expect(count()).toBe(0);
    });
    it("down+up with no move still commits", () => {
      const { el, moves, ends, count } = setup();
      drag(el, 120, 0);
      expect(moves).toEqual([]);
      expect(ends).toEqual([true]);
      expect(count()).toBe(1);
    });
    it("pointercancel after a partial drag ends uncommitted and a later pointerup does not commit", () => {
      const { el, ends, count } = setup();
      el.dispatchEvent(ev("pointerdown", 100, 100));
      el.dispatchEvent(ev("pointermove", 130, 100));
      el.dispatchEvent(ev("pointercancel", 130, 100));
      el.dispatchEvent(ev("pointerup", 300, 100));
      expect(ends).toEqual([false]);
      expect(count()).toBe(0);
    });
    it("vibrates once with config.today.vibrateMs on commit only", () => {
      const vib = vi.fn();
      nav.vibrate = vib;
      const { el } = setup();
      drag(el, 20, 0);
      el.dispatchEvent(ev("pointerdown", 0, 0));
      el.dispatchEvent(ev("pointermove", 50, 0));
      el.dispatchEvent(ev("pointercancel", 50, 0));
      expect(vib).not.toHaveBeenCalled();
      drag(el, 120, 0);
      expect(vib).toHaveBeenCalledTimes(1);
      expect(vib).toHaveBeenCalledWith(config.today.vibrateMs);
    });
    it("does not throw when navigator.vibrate is undefined", () => {
      nav.vibrate = undefined;
      const { el, count } = setup();
      expect(() => drag(el, 120, 0)).not.toThrow();
      expect(count()).toBe(1);
    });
  });
});
