import { h } from "./h";
import type { StrengthCounts } from "./ports";

const GROUPS: { key: keyof StrengthCounts; cls: string; word: string }[] = [
  { key: "well", cls: "well", word: "well" },
  { key: "okay", cls: "okay", word: "ok" },
  { key: "poorly", cls: "poorly", word: "poorly" },
  { key: "fresh", cls: "fresh", word: "new" },
];

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface StrengthBar {
  el: HTMLElement;
  /** Sets the counts. Hidden when the total is 0. Widths animate only when `animate` is true and motion is allowed. */
  update(counts: StrengthCounts, animate: boolean): void;
  /** Fetches and updates; a response is dropped when a newer refresh has started. A failure keeps the current state. */
  refresh(fetch: () => Promise<StrengthCounts>, animate: boolean): Promise<void>;
}

/** Thin stacked bar of the repertoire (well, okay, poorly, new) with a counts line. Display only. */
export function createStrengthBar(): StrengthBar {
  const segs = GROUPS.map((g) => h("span", { class: `seg ${g.cls}`, "aria-hidden": "true" }));
  const bar = h("div", { class: "strength-bar", role: "img" }, ...segs);
  const counts = h("p", { class: "strength-counts", "aria-hidden": "true" });
  const el = h("div", { class: "strength", hidden: true }, bar, counts);
  let latest = 0;

  const update = (c: StrengthCounts, animate: boolean) => {
    const total = c.well + c.okay + c.poorly + c.fresh;
    el.classList.toggle("animate", animate && !reduceMotion());
    GROUPS.forEach((g, i) => segs[i]!.style.setProperty("flex-grow", String(c[g.key])));
    const parts = GROUPS.filter((g) => c[g.key] > 0).map((g) => ({ n: c[g.key], word: g.word }));
    bar.setAttribute("aria-label", `Repertoire: ${parts.map((p) => `${p.n} ${p.word}`).join(", ")}`);
    counts.textContent = parts.map((p) => `${p.n} ${p.word}`).join(" · ");
    el.hidden = total === 0;
  };

  const refresh = async (fetch: () => Promise<StrengthCounts>, animate: boolean) => {
    const id = ++latest;
    let c: StrengthCounts;
    try {
      c = await fetch();
    } catch {
      return;
    }
    if (id === latest) update(c, animate);
  };

  return { el, update, refresh };
}
