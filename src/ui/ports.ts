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
export interface TimerPrefs {
  sound: boolean;
  vibrate: boolean;
  overtime: boolean;
}
export interface TodayPort {
  listTasks(): Promise<TaskItem[]>;
  addTask(t: NewTask): Promise<void>;
  setCompleted(id: string, date: string | null): Promise<void>;
  getTimerPrefs(): Promise<TimerPrefs>;
}
