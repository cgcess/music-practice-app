/** Pure progress derivation for the Today header. No DOM, no data imports. */
import { isDoneToday, isDueToday, type DoneTask, type DueTask } from "./due";

export type DayState = "rest" | "partial" | "done";

export interface DayProgress {
  done: number;
  total: number;
  /** done / total, 0 when nothing is due. */
  fraction: number;
  state: DayState;
}

export interface ProgressInput {
  tasks: readonly (DueTask & DoneTask)[];
  songs: readonly { ratedToday: boolean }[];
  songsPerDay: number;
  /** False until the first song load has resolved (success or failure). */
  songsLoaded: boolean;
  now: Date;
  /** Local date "YYYY-MM-DD" of `now`. */
  today: string;
}

/**
 * Items done / items due, tasks and songs counted equally. An empty or hidden songs section adds 0.
 * Until the songs have loaded, Day done is capped at `partial` so a reload never flashes the bloom.
 */
export function dayProgress(i: ProgressInput): DayProgress {
  let done = 0;
  let total = 0;
  for (const t of i.tasks) {
    if (!isDueToday(t, i.now)) continue;
    total++;
    if (isDoneToday(t, i.today)) done++;
  }
  if (i.songsPerDay > 0) {
    for (const s of i.songs) {
      total++;
      if (s.ratedToday) done++;
    }
  }
  const fraction = total === 0 ? 0 : done / total;
  let state: DayState = total === 0 ? "rest" : done === total ? "done" : "partial";
  if (state === "done" && !i.songsLoaded) state = "partial";
  return { done, total, fraction, state };
}
