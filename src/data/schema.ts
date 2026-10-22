import { config } from "../config";
import { isLocalDate } from "../dates";

export const schemaVersion = 1;

export interface Task {
  id: string;
  name: string;
  minutes: number;
  days: "daily" | number[];
  lastCompletedOn: string | null;
  createdAt: string;
}
export interface Song {
  id: string;
  title: string;
  ease: number;
  intervalDays: number;
  dueDate: string;
  lastReviewed: string | null;
  createdAt: string;
}
export interface Settings {
  songsPerDay: number;
  suggestionPeriod: "daily" | "weekly";
  timerSound: boolean;
  timerVibrate: boolean;
  timerOvertime: boolean;
}
export type RecordType = "task" | "song" | "settings";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ValidationError(`${what}: expected object`);
  }
  return v as Record<string, unknown>;
}
function exactKeys(o: Record<string, unknown>, keys: string[], what: string): void {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) throw new ValidationError(`${what}: unknown field "${k}"`);
  }
  for (const k of keys) {
    if (!(k in o)) throw new ValidationError(`${what}: missing field "${k}"`);
  }
}
function str(v: unknown, f: string, nonEmpty = false): string {
  if (typeof v !== "string") throw new ValidationError(`${f}: expected string`);
  if (nonEmpty && v.trim() === "") throw new ValidationError(`${f}: must be non-empty`);
  return v;
}
function bool(v: unknown, f: string): boolean {
  if (typeof v !== "boolean") throw new ValidationError(`${f}: expected boolean`);
  return v;
}
function num(v: unknown, f: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${f}: expected finite number`);
  return v;
}
function int(v: unknown, f: string, min: number, max = Infinity): number {
  const n = num(v, f);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${f}: expected integer in ${min}..${max}`);
  }
  return n;
}
function localDate(v: unknown, f: string): string {
  if (!isLocalDate(v)) throw new ValidationError(`${f}: expected local date YYYY-MM-DD`);
  return v;
}
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function timestamp(v: unknown, f: string): string {
  if (typeof v !== "string" || !ISO_TS.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ValidationError(`${f}: expected ISO-8601 timestamp with offset`);
  }
  return v;
}

export function validateTask(v: unknown): Task {
  const o = obj(v, "task");
  exactKeys(o, ["id", "name", "minutes", "days", "lastCompletedOn", "createdAt"], "task");
  let days: "daily" | number[];
  if (o.days === "daily") {
    days = "daily";
  } else if (Array.isArray(o.days) && o.days.length > 0) {
    days = o.days.map((d, i) => int(d, `task.days[${i}]`, 0, 6));
    if (new Set(days).size !== days.length) throw new ValidationError("task.days: duplicates");
  } else {
    throw new ValidationError('task.days: expected "daily" or non-empty array');
  }
  return {
    id: str(o.id, "task.id", true),
    name: str(o.name, "task.name", true),
    minutes: int(o.minutes, "task.minutes", 1, 240),
    days,
    lastCompletedOn: o.lastCompletedOn === null ? null : localDate(o.lastCompletedOn, "task.lastCompletedOn"),
    createdAt: timestamp(o.createdAt, "task.createdAt"),
  };
}

export function validateSong(v: unknown): Song {
  const o = obj(v, "song");
  exactKeys(o, ["id", "title", "ease", "intervalDays", "dueDate", "lastReviewed", "createdAt"], "song");
  const ease = num(o.ease, "song.ease");
  if (ease < config.sr.easeMin || ease > config.sr.easeMax) {
    throw new ValidationError(`song.ease: must be within ${config.sr.easeMin}..${config.sr.easeMax}`);
  }
  const dueDate = localDate(o.dueDate, "song.dueDate");
  const lastReviewed = o.lastReviewed === null ? null : localDate(o.lastReviewed, "song.lastReviewed");
  if (lastReviewed !== null && dueDate < lastReviewed) {
    throw new ValidationError("song.dueDate: must be >= lastReviewed");
  }
  return {
    id: str(o.id, "song.id", true),
    title: str(o.title, "song.title", true),
    ease,
    intervalDays: int(o.intervalDays, "song.intervalDays", 1),
    dueDate,
    lastReviewed,
    createdAt: timestamp(o.createdAt, "song.createdAt"),
  };
}

export function validateSettings(v: unknown): Settings {
  const o = obj(v, "settings");
  exactKeys(o, ["songsPerDay", "suggestionPeriod", "timerSound", "timerVibrate", "timerOvertime"], "settings");
  if (o.suggestionPeriod !== "daily" && o.suggestionPeriod !== "weekly") {
    throw new ValidationError('settings.suggestionPeriod: expected "daily" | "weekly"');
  }
  return {
    songsPerDay: int(o.songsPerDay, "settings.songsPerDay", 0),
    suggestionPeriod: o.suggestionPeriod,
    timerSound: bool(o.timerSound, "settings.timerSound"),
    timerVibrate: bool(o.timerVibrate, "settings.timerVibrate"),
    timerOvertime: bool(o.timerOvertime, "settings.timerOvertime"),
  };
}

export function validateRecord(type: string, v: unknown): Task | Song | Settings {
  switch (type) {
    case "task":
      return validateTask(v);
    case "song":
      return validateSong(v);
    case "settings":
      return validateSettings(v);
    default:
      throw new ValidationError(`unknown record type "${type}"`);
  }
}
