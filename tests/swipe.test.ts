// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
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
});
