/** Pure undo helper: the previous lastCompletedOn is held in memory only. */
export interface Undo {
  taskId: string;
  prev: string | null;
  at: number;
}

export function prepareUndo(taskId: string, prev: string | null, at: number): Undo {
  return { taskId, prev, at };
}

/** The value to restore, or null once the window has expired. */
export function applyUndo(u: Undo, now: number, windowMs: number): { value: string | null } | null {
  return now - u.at <= windowMs ? { value: u.prev } : null;
}
