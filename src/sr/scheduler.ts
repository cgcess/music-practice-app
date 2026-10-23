import { config } from "../config";
import { addDays, diffDays, todayLocal } from "../dates";
import type { Song } from "../data/schema";
import { fnv1a32, rand01 } from "./hash";

export type Rating = (typeof config.sr.ratingScale)[number];
type SrConfig = typeof config.sr;

export const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Round, fuzz (seeded, only when the rounded base is long enough), then clamp to 1..max. */
function finishInterval(raw: number, seed: string, sr: SrConfig): number {
  let days = Math.round(raw);
  if (days >= sr.fuzzMinIntervalDays) {
    days = Math.round(days * (1 + (2 * rand01(seed) - 1) * sr.fuzzPct));
  }
  return clamp(days, 1, sr.maxIntervalDays);
}

/**
 * A song just added: first due minOffset..newSongSpreadDays after today (minOffset defaults to 0),
 * seeded by id + add date.
 */
export function newSong(
  init: { id: string; title: string; createdAt: string },
  today: string,
  sr: SrConfig = config.sr,
  opts: { minOffset?: number } = {},
): Song {
  const min = Math.min(Math.max(0, Math.floor(opts.minOffset ?? 0)), sr.newSongSpreadDays);
  const offset = min + Math.floor(rand01(`${init.id}|${today}`) * (sr.newSongSpreadDays - min + 1));
  return {
    id: init.id,
    title: init.title,
    ease: sr.easeInitial,
    intervalDays: sr.initialIntervalDays,
    dueDate: addDays(today, offset),
    lastReviewed: null,
    createdAt: init.createdAt,
  };
}

/**
 * Apply a rating on `today`. gap = max(intervalDays, days since lastReviewed, or since createdAt when never rated).
 * rough: interval/2 (scheduled, not gap), ease - delta. ok: gap * ease. solid: gap * ease * multiplier, ease + delta.
 * The interval uses the ease BEFORE this rating.
 */
export function rateSong(song: Song, rating: Rating, today: string, sr: SrConfig = config.sr): Song {
  const ref = song.lastReviewed ?? song.createdAt.slice(0, 10);
  const gap = Math.max(song.intervalDays, diffDays(today, ref));
  let raw: number;
  let ease = song.ease;
  if (rating === "rough") {
    raw = song.intervalDays / 2;
    ease -= sr.easeRoughDelta;
  } else if (rating === "ok") {
    raw = gap * song.ease;
  } else {
    raw = gap * song.ease * sr.solidMultiplier;
    ease += sr.easeSolidDelta;
  }
  const intervalDays = finishInterval(raw, `${song.id}|${today}`, sr);
  return {
    ...song,
    ease: round2(clamp(ease, sr.easeMin, sr.easeMax)),
    intervalDays,
    lastReviewed: today,
    dueDate: addDays(today, intervalDays),
  };
}

/** Songs due on or before today: oldest dueDate first, ties by a stable hash of the id only. */
export function pickOrder(songs: readonly Song[], today: string): Song[] {
  return songs
    .filter((s) => s.dueDate <= today)
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      const ha = fnv1a32(a.id);
      const hb = fnv1a32(b.id);
      if (ha !== hb) return ha - hb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

const byIdHash = (a: Song, b: Song) => {
  const ha = fnv1a32(a.id);
  const hb = fnv1a32(b.id);
  return ha !== hb ? ha - hb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
const ratedToday = (songs: readonly Song[], today: string) => songs.filter((s) => s.lastReviewed === today).sort(byIdHash);
const dueUnrated = (songs: readonly Song[], today: string) => pickOrder(songs, today).filter((s) => s.lastReviewed !== today);

/**
 * Songs rated today (always all of them, even above songsPerDay), plus the first
 * max(0, songsPerDay - ratedToday) of the pick order. Unrated songs never exceed the remaining room.
 */
export function dailySelection(songs: readonly Song[], today: string, songsPerDay: number): Song[] {
  if (songsPerDay <= 0) return [];
  const rated = ratedToday(songs, today);
  const room = Math.max(0, songsPerDay - rated.length);
  return [...rated, ...dueUnrated(songs, today).slice(0, room)];
}

/**
 * Songs to pull ahead (set dueDate to today) so the selection reaches songsPerDay: the soonest-due future songs
 * when ratedToday + due is short. Songs created today are skipped unless nothing is rated or due, so a song
 * added after the day's selection is non-empty waits for a later day.
 */
export function planTopUp(songs: readonly Song[], today: string, songsPerDay: number): Song[] {
  if (songsPerDay <= 0) return [];
  const have = ratedToday(songs, today).length + dueUnrated(songs, today).length;
  const need = songsPerDay - have;
  if (need <= 0) return [];
  return songs
    .filter((s) => s.dueDate > today && s.lastReviewed !== today)
    .filter((s) => have === 0 || todayLocal(new Date(s.createdAt)) !== today)
    .sort((a, b) => (a.dueDate !== b.dueDate ? (a.dueDate < b.dueDate ? -1 : 1) : byIdHash(a, b)))
    .slice(0, need);
}
