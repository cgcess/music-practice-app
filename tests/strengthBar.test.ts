// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStrengthBar } from "../src/ui/strengthBar";

const c = (well: number, okay: number, poorly: number, fresh: number) => ({ well, okay, poorly, fresh });
afterEach(() => vi.unstubAllGlobals());

describe("strengthBar", () => {
  it("starts hidden", () => {
    expect(createStrengthBar().el.hidden).toBe(true);
  });
  it("renders one image element, segments in order, label and counts", () => {
    const b = createStrengthBar();
    b.update(c(12, 8, 3, 5), false);
    expect(b.el.hidden).toBe(false);
    const imgs = b.el.querySelectorAll('[role="img"]');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute("aria-label")).toBe("Repertoire: 12 well, 8 ok, 3 poorly, 5 new");
    const segs = [...b.el.querySelectorAll(".seg")];
    expect(segs.map((s) => s.className.replace("seg ", ""))).toEqual(["well", "okay", "poorly", "fresh"]);
    expect(segs.map((s) => (s as HTMLElement).style.flexGrow)).toEqual(["12", "8", "3", "5"]);
    expect(segs.every((s) => s.getAttribute("aria-hidden") === "true" && !s.hasAttribute("tabindex"))).toBe(true);
    expect(b.el.querySelector(".strength-counts")!.textContent).toBe("12 well · 8 ok · 3 poorly · 5 new");
  });
  it("omits zero groups from label and counts", () => {
    const b = createStrengthBar();
    b.update(c(2, 0, 0, 1), false);
    expect(b.el.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("Repertoire: 2 well, 1 new");
    expect(b.el.querySelector(".strength-counts")!.textContent).toBe("2 well · 1 new");
  });
  it("hides at total 0 and shows again", () => {
    const b = createStrengthBar();
    b.update(c(1, 0, 0, 0), false);
    b.update(c(0, 0, 0, 0), true);
    expect(b.el.hidden).toBe(true);
    b.update(c(0, 0, 1, 0), true);
    expect(b.el.hidden).toBe(false);
  });
  it("animates only when asked and motion is allowed", () => {
    const b = createStrengthBar();
    b.update(c(1, 1, 1, 1), false);
    expect(b.el.classList.contains("animate")).toBe(false);
    b.update(c(2, 1, 1, 1), true);
    expect(b.el.classList.contains("animate")).toBe(true);
    b.update(c(2, 2, 1, 1), false);
    expect(b.el.classList.contains("animate")).toBe(false);
  });
  it("never animates under reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));
    const b = createStrengthBar();
    b.update(c(1, 1, 1, 1), true);
    expect(b.el.classList.contains("animate")).toBe(false);
  });
  it("refresh drops an older response that resolves last", async () => {
    const b = createStrengthBar();
    let r1!: (v: ReturnType<typeof c>) => void;
    const first = b.refresh(() => new Promise((r) => (r1 = r)), true);
    await b.refresh(async () => c(0, 3, 0, 0), true);
    r1(c(9, 0, 0, 0));
    await first;
    expect(b.el.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("Repertoire: 3 ok");
  });
  it("refresh failure keeps the current state", async () => {
    const b = createStrengthBar();
    await b.refresh(async () => { throw new Error("x"); }, false);
    expect(b.el.hidden).toBe(true);
    b.update(c(1, 0, 0, 0), false);
    await b.refresh(async () => { throw new Error("x"); }, false);
    expect(b.el.hidden).toBe(false);
  });
});
