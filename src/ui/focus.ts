import { config } from "../config";
import { formatOvertime, formatRemaining, type Snapshot } from "../today/timer";
import { h } from "./h";
import { icon } from "./icons";
import { attachDragDown } from "./swipe";
import { taskColor } from "./taskColor";

export interface FocusTask {
  id: string;
  name: string;
  minutes: number;
}
export interface FocusOpts {
  task: FocusTask;
  snap: Snapshot;
  onFinish: () => void;
  /** Called after any close except Finish and `restoreFocus: false`. */
  onClose?: () => void;
}
export interface FocusHandle {
  update(snap: Snapshot): void;
  close(immediate?: boolean, o?: { restoreFocus?: boolean }): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const NS = "http://www.w3.org/2000/svg";

const svg = (tag: string, attrs: Record<string, string>): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e as SVGElement;
};

/** Full-screen focus presenter for the running task: ring, large time, Finish. The timer is owned by the caller. */
export function openFocus(opts: FocusOpts): FocusHandle {
  const { task } = opts;
  const targetMs = task.minutes * 60000;

  const track = svg("circle", { class: "ring-track", cx: "50", cy: "50", r: "45", fill: "none", "stroke-width": "6" });
  const bar = svg("circle", {
    class: "ring-bar",
    cx: "50",
    cy: "50",
    r: "45",
    fill: "none",
    "stroke-width": "6",
    "stroke-linecap": "round",
    pathLength: "1",
    "stroke-dasharray": "1",
    "stroke-dashoffset": "1",
  });
  const ring = svg("svg", { class: "ring", viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" });
  ring.append(track, bar);
  const timeEl = h("div", { class: "focus-time" });
  const closeBtn = h("button", { type: "button", class: "focus-close", "aria-label": "Close focus view", onClick: () => close() }, icon("chevron"));
  const finishBtn = h(
    "button",
    {
      type: "button",
      class: "focus-finish",
      onClick: () => {
        close(true, { restoreFocus: false });
        opts.onFinish();
      },
    },
    "Finish",
  );
  const el = h(
    "div",
    { class: "focus", role: "dialog", "aria-modal": "true", "aria-label": task.name, tabindex: "-1" },
    closeBtn,
    h("div", { class: "focus-name" }, task.name),
    h("div", { class: "ring-wrap" }, ring, timeEl),
    finishBtn,
  );
  el.style.setProperty("--focus-ms", `${config.today.focusMs}ms`);
  el.style.setProperty("--task-color", taskColor(task.id));

  const setRing = (progress: number, color: string) => {
    bar.setAttribute("stroke-dashoffset", String(1 - Math.min(1, Math.max(0, progress))));
    bar.style.setProperty("stroke", color);
  };

  const update = (snap: Snapshot) => {
    if (snap.taskId !== task.id) return;
    if (snap.phase === "running") {
      el.dataset.phase = "running";
      timeEl.textContent = formatRemaining(snap.remainingMs);
      setRing(1 - snap.remainingMs / targetMs, taskColor(task.id));
    } else if (snap.phase === "overtime") {
      el.dataset.phase = "overtime";
      timeEl.textContent = formatOvertime(snap.overtimeMs);
      setRing(1, "var(--warning)");
    } else if (snap.phase === "timesup") {
      el.dataset.phase = "timesup";
      timeEl.textContent = "Time's up";
      setRing(1, "var(--label-2)");
    }
  };

  let closed = false;
  const close = (immediate = false, o: { restoreFocus?: boolean } = {}) => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    detachDrag();
    if (immediate) {
      el.remove();
    } else {
      el.classList.add("closing");
      el.setAttribute("aria-hidden", "true");
      setTimeout(() => el.remove(), config.today.focusMs);
    }
    if (o.restoreFocus !== false) opts.onClose?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      el.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !el.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const detachDrag = attachDragDown(el, {
    onMove: (dy) => {
      el.classList.add("dragging");
      el.style.transform = `translateY(${dy}px)`;
    },
    onEnd: (committed) => {
      el.classList.remove("dragging");
      if (!committed) el.style.removeProperty("transform");
    },
    onClose: () => close(),
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(el);
  update(opts.snap);
  el.focus();
  return { update, close };
}
