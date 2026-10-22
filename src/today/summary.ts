/** Pure helpers for the Today header. No DOM, no data imports. */
export interface SummaryTask {
  minutes: number;
  lastCompletedOn: string | null;
}
export interface Summary {
  done: number;
  due: number;
  minutesLeft: number;
}

/** `due` is the tasks due today; minutes count undone tasks only. */
export function summarize(due: readonly SummaryTask[], today: string): Summary {
  let done = 0;
  let minutesLeft = 0;
  for (const t of due) {
    if (t.lastCompletedOn === today) done++;
    else minutesLeft += t.minutes;
  }
  return { done, due: due.length, minutesLeft };
}

export function formatSummary(s: Summary): string {
  if (s.due === 0) return "Nothing due today";
  const base = `${s.done} of ${s.due}`;
  return s.minutesLeft > 0 ? `${base} · ${s.minutesLeft} min left` : `${base} · all done`;
}

/** e.g. "Thursday 22 Oct" in en-GB; follows the device locale when `locale` is undefined. */
export function formatDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" }).format(date);
}
