// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { attachSwipeReveal } from "../src/ui/swipeReveal";

const ev = (type: string, x: number, y: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y });
  return e;
};
const drag = (el: HTMLElement, dx: number, dy = 0) => {
  el.dispatchEvent(ev("pointerdown", 100, 100));
  el.dispatchEvent(ev("pointermove", 100 + dx / 2, 100 + dy / 2));
  el.dispatchEvent(ev("pointerup", 100 + dx, 100 + dy));
};
const setup = () => {
  const el = document.createElement("div");
  const log: string[] = [];
  attachSwipeReveal(el, { onOpen: () => log.push("open"), onClose: () => log.push("close"), onMove: (dx) => log.push(`move${Math.round(dx)}`), onEnd: () => log.push("end") });
  return { el, log };
};

describe("swipeReveal", () => {
  it("opens on a leftward drag and closes on a rightward drag, stays put on release", () => {
    const { el, log } = setup();
    drag(el, -120, 5);
    expect(log.filter((x) => !x.startsWith("move"))).toEqual(["end", "open"]);
    drag(el, 120, 5);
    expect(log.filter((x) => !x.startsWith("move"))).toEqual(["end", "open", "end", "close"]);
  });
  it("reports signed movement", () => {
    const { el, log } = setup();
    drag(el, -80);
    expect(log).toContain("move-40");
  });
  it("ignores short, vertical and diagonal drags", () => {
    const { el, log } = setup();
    drag(el, -20, 0);
    drag(el, -70, 70);
    drag(el, -10, 150);
    expect(log.filter((x) => x === "open" || x === "close")).toEqual([]);
  });
  it("pointercancel ends without opening; detach stops events", () => {
    const el = document.createElement("div");
    const log: string[] = [];
    const off = attachSwipeReveal(el, { onOpen: () => log.push("open"), onClose: () => log.push("close"), onEnd: () => log.push("end") });
    el.dispatchEvent(ev("pointerdown", 100, 100));
    el.dispatchEvent(ev("pointercancel", 0, 0));
    expect(log).toEqual(["end"]);
    off();
    drag(el, -120);
    expect(log).toEqual(["end"]);
  });
});
