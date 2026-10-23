import { config } from "../config";

export interface SwipeRevealOpts {
  minPx?: number;
  ratio?: number;
  /** Open (reveal the actions): a leftward, mostly horizontal drag past the threshold. */
  onOpen: () => void;
  /** Close: a rightward, mostly horizontal drag past the threshold. */
  onClose: () => void;
  /** Signed horizontal drag (negative = left) while the drag is mostly horizontal, else 0. */
  onMove?: (dx: number) => void;
  /** Once per gesture, on release or cancel. */
  onEnd?: () => void;
}

/**
 * Swipe-to-reveal (iOS Mail style): unlike attachSwipe, nothing fires "on release" for the task;
 * the row stays open and the caller decides what open/closed means. Returns a detach function.
 */
export function attachSwipeReveal(el: HTMLElement, opts: SwipeRevealOpts): () => void {
  const minPx = opts.minPx ?? config.today.swipeMinPx;
  const ratio = opts.ratio ?? config.today.swipeRatio;
  let start: { x: number; y: number; id: number | null; captured: boolean } | null = null;

  const release = (s: { id: number | null; captured: boolean }) => {
    if (!s.captured || s.id === null) return;
    try {
      el.releasePointerCapture?.(s.id);
    } catch {
      /* pointer already gone */
    }
  };
  const down = (e: Event) => {
    const p = e as PointerEvent;
    start = { x: p.clientX, y: p.clientY, id: typeof p.pointerId === "number" ? p.pointerId : null, captured: false };
  };
  const move = (e: Event) => {
    const s = start;
    if (!s) return;
    const p = e as PointerEvent;
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (!s.captured && horizontal && Math.abs(dx) > config.today.capturePx && s.id !== null && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(s.id);
        s.captured = true;
      } catch {
        /* not an active pointer */
      }
    }
    opts.onMove?.(horizontal ? dx : 0);
  };
  const up = (e: Event) => {
    const p = e as PointerEvent;
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    const clear = Math.abs(dx) >= minPx && Math.abs(dx) > ratio * Math.abs(dy);
    if (s.captured) {
      // A captured drag ends in a click on the row; swallow it so it does not toggle the row again.
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
    }
    opts.onEnd?.();
    if (clear) (dx < 0 ? opts.onOpen : opts.onClose)();
  };
  const cancel = () => {
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    opts.onEnd?.();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
  };
}
