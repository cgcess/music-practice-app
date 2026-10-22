/** Pure timer state. Elapsed time is always computed from a start timestamp and an injectable clock. */
export type Phase = "idle" | "running" | "overtime" | "timesup" | "done";

export interface TimerDeps {
  now: () => number;
  graceMs: number;
  overtime: () => boolean;
  onChime: (taskId: string) => void;
}
export interface Snapshot {
  phase: Phase;
  taskId: string | null;
  /** Milliseconds left (running), 0 otherwise. */
  remainingMs: number;
  /** Milliseconds past the target (overtime), 0 otherwise. */
  overtimeMs: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const mmss = (totalSec: number) => `${Math.floor(totalSec / 60)}:${pad(totalSec % 60)}`;

/** Countdown label, rounding up so 0:00 only shows at the target. */
export function formatRemaining(ms: number): string {
  return mmss(Math.ceil(Math.max(0, ms) / 1000));
}
export function formatOvertime(ms: number): string {
  return "+" + mmss(Math.floor(Math.max(0, ms) / 1000));
}

export class TimerController {
  private cur: { taskId: string; startMs: number; targetMs: number; chimed: boolean } | null = null;
  private finished: string | null = null;

  constructor(private readonly d: TimerDeps) {}

  /** Starts a timer, replacing any current one without completing it. */
  start(taskId: string, targetMs: number): void {
    this.finished = null;
    this.cur = { taskId, startMs: this.d.now(), targetMs, chimed: false };
  }

  /** Stops the running timer without completing. */
  stop(): void {
    this.cur = null;
    this.finished = null;
  }

  /** Marks the running timer done. Returns the task id, or null if nothing was running. */
  done(): string | null {
    if (!this.cur) return null;
    this.finished = this.cur.taskId;
    const id = this.cur.taskId;
    this.cur = null;
    return id;
  }

  /** Chime once per start; late ticks (beyond the grace window) mark it chimed without chiming. */
  tick(): void {
    const c = this.cur;
    if (!c || c.chimed) return;
    const over = this.d.now() - c.startMs - c.targetMs;
    if (over < 0) return;
    c.chimed = true;
    if (over <= this.d.graceMs) this.d.onChime(c.taskId);
  }

  snapshot(): Snapshot {
    const c = this.cur;
    if (!c) {
      return { phase: this.finished ? "done" : "idle", taskId: this.finished, remainingMs: 0, overtimeMs: 0 };
    }
    const elapsed = this.d.now() - c.startMs;
    if (elapsed < c.targetMs) {
      return { phase: "running", taskId: c.taskId, remainingMs: c.targetMs - elapsed, overtimeMs: 0 };
    }
    const phase: Phase = this.d.overtime() ? "overtime" : "timesup";
    return { phase, taskId: c.taskId, remainingMs: 0, overtimeMs: phase === "overtime" ? elapsed - c.targetMs : 0 };
  }
}
