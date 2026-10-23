/** The only way views reach persisted data. Implemented outside src/ui (see src/app/todayPort.ts). */
export interface TaskItem {
  id: string;
  name: string;
  minutes: number;
  days: "daily" | number[];
  lastCompletedOn: string | null;
}
export interface NewTask {
  name: string;
  minutes: number;
  days: "daily" | number[];
}
/** Full stored record of a task, kept for delete-undo. Structural: the data layer's Task is assignable. */
export interface TaskSnapshot extends TaskItem {
  createdAt: string;
}
export interface TimerPrefs {
  sound: boolean;
  vibrate: boolean;
  overtime: boolean;
}
export interface TodayPort {
  listTasks(): Promise<TaskItem[]>;
  addTask(t: NewTask): Promise<void>;
  /** Replaces name, minutes and days of an existing task; throws "Task not found" for an unknown id. */
  updateTask(id: string, patch: NewTask): Promise<void>;
  /** Removes the task and returns its full record so it can be restored. */
  deleteTask(id: string): Promise<TaskSnapshot>;
  restoreTask(snapshot: TaskSnapshot): Promise<void>;
  setCompleted(id: string, date: string | null): Promise<void>;
  getTimerPrefs(): Promise<TimerPrefs>;
  /** Saved metronome tempo (config default when nothing is saved). */
  getTempo(): Promise<number>;
  /** Persists the tempo; rejects with a validation error when out of range. */
  setTempo(bpm: number): Promise<void>;
}
