/** The only way views reach persisted data. Implemented outside src/ui (see src/app/todayPort.ts). */
import type { StrengthCounts } from "../sr/strength";

export type { StrengthCounts };

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
export type SongRating = "rough" | "ok" | "solid";
/** One slot of the day's songs. `ratedToday` rows are done for the day. */
export interface TodaySong {
  id: string;
  title: string;
  ratedToday: boolean;
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
  /** The day's songs (rated today first, then the next to play) and the songsPerDay setting. */
  listTodaySongs(): Promise<{ songsPerDay: number; songs: TodaySong[] }>;
  /** Applies the scheduler and returns the previous record for Undo; rejects when already rated today. */
  rateTodaySong(id: string, rating: SongRating): Promise<SongSnapshot>;
  restoreTodaySong(snapshot: SongSnapshot): Promise<void>;
  /** Strength buckets for the whole repertoire (read only). */
  repertoireStrength(): Promise<StrengthCounts>;
}

/** Repertoire tab port (see src/app/repertoirePort.ts). */
export interface SongItem {
  id: string;
  title: string;
  dueDate: string;
}
/** Full stored record of a song, kept for delete-undo. Structural: the data layer's Song is assignable. */
export interface SongSnapshot extends SongItem {
  ease: number;
  intervalDays: number;
  lastReviewed: string | null;
  createdAt: string;
}
export interface BulkAddResult {
  added: number;
  skipped: number;
  /** Set only when a write failed after at least one song was added; the rest were not attempted. */
  error?: string;
}
export interface RepertoirePort {
  /** Songs ordered by dueDate, then title (case-insensitive), then id. */
  listSongs(): Promise<SongItem[]>;
  getSongsPerDay(): Promise<number>;
  /** Rounds and clamps to 0..max; rejects with RangeError for non-finite input. */
  setSongsPerDay(n: number): Promise<void>;
  /** Adds one song (trimmed title); rejects when the title is blank. */
  addSong(title: string): Promise<void>;
  /** One title per entry: trims, drops blanks, skips case-insensitive duplicates of existing and earlier titles. */
  addSongs(titles: string[]): Promise<BulkAddResult>;
  renameSong(id: string, title: string): Promise<void>;
  /** Removes the song and returns its full record so it can be restored. */
  deleteSong(id: string): Promise<SongSnapshot>;
  restoreSong(snapshot: SongSnapshot): Promise<void>;
  /** Strength buckets for the whole repertoire (read only). */
  repertoireStrength(): Promise<StrengthCounts>;
}
