export interface SchedulerDeps {
  /** Current time on the audio clock, in seconds. */
  audioNow: () => number;
  /** Queue a click at an audio-clock time (seconds). */
  schedule: (time: number) => void;
  /** Repeating callback; returns cancel. */
  every: (fn: () => void, ms: number) => () => void;
  /** Tempo, read for every beat so changes apply while playing. */
  bpm: () => number;
  lookaheadMs: number;
  tickMs: number;
}

export interface MetronomeScheduler {
  start(): void;
  stop(): void;
  running(): boolean;
}

/**
 * Lookahead scheduler: every tick it queues every beat that falls before audioNow + lookahead,
 * advancing by 60/bpm per beat. The first beat is at the audio time of start().
 * If a tick runs late, missed beats are dropped and scheduling resumes from now (no catch-up burst).
 */
export function createScheduler(d: SchedulerDeps): MetronomeScheduler {
  let cancel: (() => void) | null = null;
  let next = 0;
  const pump = () => {
    const now = d.audioNow();
    if (next < now) next = now;
    const horizon = now + d.lookaheadMs / 1000;
    while (next < horizon) {
      d.schedule(next);
      next += 60 / d.bpm();
    }
  };
  return {
    start() {
      if (cancel) return;
      next = d.audioNow();
      cancel = d.every(pump, d.tickMs);
      pump();
    },
    stop() {
      cancel?.();
      cancel = null;
    },
    running: () => cancel !== null,
  };
}
