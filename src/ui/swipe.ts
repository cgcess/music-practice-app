import { config } from "../config";

export interface SwipeOpts {
  minPx?: number;
  ratio?: number;
  /** Horizontal drag distance (>= 0) while the drag is mostly horizontal. Additive: never a precondition for commit. */
  onMove?: (dx: number) => void;
  /** Called once per gesture on release or cancel; `committed` is true only for a swipe that fires. */
  onEnd?: (committed: boolean) => void;
}

/** A rightward, mostly horizontal drag past the threshold. */
export function isSwipeRight(dx: number, dy: number, minPx: number, ratio: number): boolean {
  return dx >= minPx && Math.abs(dx) > ratio * Math.abs(dy);
}

/** Horizontal movement before the pointer is captured so the row follows the finger. */
const CAPTURE_PX = 10;

/** Pointer-based swipe-right detection. Returns a detach function. */
export function attachSwipe(el: HTMLElement, onSwipe: () => void, opts: SwipeOpts = {}): () => void {
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
    // Capture only once the drag is clearly horizontal, so taps on inner buttons still click.
    if (!s.captured && horizontal && Math.abs(dx) > CAPTURE_PX && s.id !== null && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(s.id);
        s.captured = true;
      } catch {
        /* not an active pointer */
      }
    }
    opts.onMove?.(horizontal ? Math.max(0, dx) : 0);
  };
  const up = (e: Event) => {
    const p = e as PointerEvent;
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    const committed = isSwipeRight(p.clientX - s.x, p.clientY - s.y, minPx, ratio);
    opts.onEnd?.(committed);
    if (committed) {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(config.today.vibrateMs);
        } catch {
          /* haptics are best-effort */
        }
      }
      onSwipe();
    }
  };
  const cancel = () => {
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    opts.onEnd?.(false);
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

export interface DragDownOpts {
  minPx?: number;
  /** Downward drag distance (>= 0) while the drag is mostly vertical. */
  onMove?: (dy: number) => void;
  /** Called once per gesture on release or cancel; `committed` is true only when the drag closes. */
  onEnd?: (committed: boolean) => void;
  /** Called after `onEnd(true)` when the drag passed the threshold. */
  onClose?: () => void;
}

/** A downward, mostly vertical drag past the threshold. */
export function isDragDown(dx: number, dy: number, minPx: number): boolean {
  return dy >= minPx && Math.abs(dy) > Math.abs(dx);
}

/** Pointer-based swipe-down detection. Captures only once the drag is clearly vertical. Returns a detach function. */
export function attachDragDown(el: HTMLElement, opts: DragDownOpts = {}): () => void {
  const minPx = opts.minPx ?? config.today.focusCloseMinPx;
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
    const vertical = Math.abs(dy) > Math.abs(dx);
    if (!s.captured && vertical && Math.abs(dy) > CAPTURE_PX && s.id !== null && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(s.id);
        s.captured = true;
      } catch {
        /* not an active pointer */
      }
    }
    opts.onMove?.(vertical ? Math.max(0, dy) : 0);
  };
  const up = (e: Event) => {
    const p = e as PointerEvent;
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    const committed = isDragDown(p.clientX - s.x, p.clientY - s.y, minPx);
    opts.onEnd?.(committed);
    if (committed) opts.onClose?.();
  };
  const cancel = () => {
    const s = start;
    start = null;
    if (!s) return;
    release(s);
    opts.onEnd?.(false);
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
