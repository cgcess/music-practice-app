import { diffDays } from "../dates";

/** Due date in words: "today" (also when overdue), "tomorrow", "in N days". */
export function dueText(dueDate: string, today: string): string {
  const n = diffDays(dueDate, today);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
