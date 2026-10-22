/** Fixed palette of iOS system colours (CSS tokens in base.css), excluding accent, success and warning. */
export const TASK_COLORS = [
  "var(--task-1)",
  "var(--task-2)",
  "var(--task-3)",
  "var(--task-4)",
  "var(--task-5)",
  "var(--task-6)",
  "var(--task-7)",
  "var(--task-8)",
] as const;

/** Deterministic colour for a task id (FNV-1a hash -> palette index). */
export function taskColor(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TASK_COLORS[hash % TASK_COLORS.length]!;
}
