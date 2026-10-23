import type { Store } from "../data/store";
import { config } from "../config";
import { todayLocal } from "../dates";
import type { Settings, Song } from "../data/schema";
import { newSong } from "../sr/scheduler";
import { strengthCounts } from "../sr/strength";
import type { RepertoirePort } from "../ui/ports";
import type { PortDeps } from "./todayPort";
import { topUpToday } from "./topUp";

const key = (t: string) => t.trim().toLowerCase();

/**
 * Adapter between the Repertoire view and the validated store. Every write goes through
 * store.putSong / store.putSettings, which validate and throw ValidationError.
 */
export function makeRepertoirePort(
  store: Pick<Store, "putSong" | "getSong" | "deleteSong" | "listSongs" | "getSettings" | "putSettings">,
  deps: PortDeps,
): RepertoirePort {
  const today = () => (deps.today ?? todayLocal)();
  const create = (title: string, minOffset: number): Song =>
    newSong({ id: deps.newId(), title, createdAt: deps.nowIso() }, today(), config.sr, { minOffset });
  /**
   * Add-time rule (first-day rule): if every existing song was created today, a new song is due today while
   * fewer than songsPerDay such songs are already due today; otherwise it is due tomorrow or later, so it never
   * displaces a shown song. Single and bulk adds behave the same.
   */
  const planner = async () => {
    const existing = await store.listSongs();
    const day = today();
    const freshStart = existing.every((s) => todayLocal(new Date(s.createdAt)) === day);
    const spd = deps.getEffectiveConfig(await store.getSettings()).songsPerDay;
    let dueToday = existing.filter((s) => s.dueDate === day).length;
    return (title: string): Song => {
      if (freshStart && dueToday < spd) {
        dueToday++;
        return { ...create(title, 0), dueDate: day };
      }
      return create(title, 1);
    };
  };

  return {
    async listSongs() {
      const { songs } = await topUpToday(store, deps);
      return songs
        .map((s) => ({ id: s.id, title: s.title, dueDate: s.dueDate }))
        .sort((a, b) => {
          if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
          const ta = a.title.toLowerCase();
          const tb = b.title.toLowerCase();
          if (ta !== tb) return ta < tb ? -1 : 1;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
    },
    async getSongsPerDay() {
      return deps.getEffectiveConfig(await store.getSettings()).songsPerDay;
    },
    async setSongsPerDay(n) {
      if (!Number.isFinite(n)) throw new RangeError("songsPerDay must be a finite number");
      const value = Math.min(config.maxSongsPerDay, Math.max(0, Math.round(n)));
      const cur = await store.getSettings();
      const eff = deps.getEffectiveConfig(cur);
      const base: Settings = cur ?? {
        songsPerDay: eff.songsPerDay,
        suggestionPeriod: eff.suggestionPeriod,
        timerSound: eff.timer.sound,
        timerVibrate: eff.timer.vibrate,
        timerOvertime: eff.timer.overtime,
        metronomeBpm: eff.metronome.bpm,
      };
      await store.putSettings({ ...base, songsPerDay: value });
    },
    async addSong(title) {
      const t = title.trim();
      if (!t) throw new Error("Title is required");
      await store.putSong((await planner())(t));
    },
    async addSongs(titles) {
      const seen = new Set((await store.listSongs()).map((s) => key(s.title)));
      const make = await planner();
      let added = 0;
      let skipped = 0;
      for (const raw of titles) {
        const t = raw.trim();
        if (!t) continue;
        if (seen.has(key(t))) {
          skipped++;
          continue;
        }
        seen.add(key(t));
        try {
          await store.putSong(make(t));
        } catch (e) {
          // Earlier songs are already persisted: report the partial result instead of hiding it behind a throw.
          if (added === 0) throw e;
          return { added, skipped, error: e instanceof Error ? e.message : "Could not add songs" };
        }
        added++;
      }
      return { added, skipped };
    },
    async renameSong(id, title) {
      const t = title.trim();
      if (!t) throw new Error("Title is required");
      const old = await store.getSong(id);
      if (!old) throw new Error("Song not found");
      await store.putSong({ ...old, title: t });
    },
    async deleteSong(id) {
      const old = await store.getSong(id);
      if (!old) throw new Error("Song not found");
      await store.deleteSong(id);
      return old;
    },
    async restoreSong(snapshot) {
      await store.putSong(snapshot);
    },
    async repertoireStrength() {
      return strengthCounts(await store.listSongs());
    },
  };
}
