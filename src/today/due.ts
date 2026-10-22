/** Pure due/done logic for the Today checklist. No DOM, no data imports. */
export interface DueTask {
  days: "daily" | readonly number[];
}
export interface DoneTask {
  lastCompletedOn: string | null;
}

/** Due when daily or the list contains today's weekday (Date.getDay(), 0 = Sunday). */
export function isDueToday(task: DueTask, now: Date): boolean {
  return task.days === "daily" || task.days.includes(now.getDay());
}

export function isDoneToday(task: DoneTask, today: string): boolean {
  return task.lastCompletedOn === today;
}
