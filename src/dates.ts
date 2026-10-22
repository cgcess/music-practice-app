/** Local-calendar date helpers. Dates are "YYYY-MM-DD" in the device's local time. */
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function formatLocalDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(now: Date = new Date()): string {
  return formatLocalDate(now);
}

export function parseLocalDate(s: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isLocalDate(s: unknown): s is string {
  return typeof s === "string" && parseLocalDate(s) !== null;
}

function toDayNumber(s: string): number {
  const p = parseLocalDate(s);
  if (!p) throw new Error(`invalid local date: ${s}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

/** Add whole calendar days (DST safe: arithmetic is on y/m/d, not on local midnights). */
export function addDays(date: string, n: number): string {
  const t = new Date((toDayNumber(date) + n) * 86400000);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** Day of week of a local date, 0 = Sunday. */
export function dayOfWeek(date: string): number {
  return new Date(toDayNumber(date) * 86400000).getUTCDay();
}

/** ISO-8601 timestamp with the local UTC offset, e.g. 2026-10-22T12:00:00-04:00. */
export function nowIso(now: Date = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return (
    `${formatLocalDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}
