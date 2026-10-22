import type { Song, Task } from "../src/data/schema";

export const task = (o: Partial<Task> = {}): Task => ({
  id: "t-1", name: "Scales", minutes: 15, days: "daily", lastCompletedOn: null,
  createdAt: "2026-10-01T09:00:00-04:00", ...o,
});
export const song = (o: Partial<Song> = {}): Song => ({
  id: "s-1", title: "Etude", ease: 2.5, intervalDays: 1, dueDate: "2026-10-23",
  lastReviewed: "2026-10-22", createdAt: "2026-10-01T09:00:00-04:00", ...o,
});
export const settings = () => ({
  songsPerDay: 3, suggestionPeriod: "daily" as const, timerSound: true, timerVibrate: false, timerOvertime: true,
});
