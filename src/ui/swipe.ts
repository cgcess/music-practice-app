import { config } from "../config";

export interface SwipeOpts {
  minPx?: number;
  ratio?: number;
}

/** A rightward, mostly horizontal drag past the threshold. */
export function isSwipeRight(dx: number, dy: number, minPx: number, ratio: number): boolean {
  return dx >= minPx && Math.abs(dx) > ratio * Math.abs(dy);
}

/** Pointer-based swipe-right detection. Returns a detach function. */
export function attachSwipe(el: HTMLElement, onSwipe: () => void, opts: SwipeOpts = {}): () => void {
  const minPx = opts.minPx ?? config.today.swipeMinPx;
  const ratio = opts.ratio ?? config.today.swipeRatio;
  let start: { x: number; y: number } | null = null;
  const down = (e: Event) => {
    const p = e as PointerEvent;
    start = { x: p.clientX, y: p.clientY };
  };
  const up = (e: Event) => {
    const p = e as PointerEvent;
    const s = start;
    start = null;
    if (s && isSwipeRight(p.clientX - s.x, p.clientY - s.y, minPx, ratio)) onSwipe();
  };
  const cancel = () => {
    start = null;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
  };
}
