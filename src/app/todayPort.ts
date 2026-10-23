import type { Store } from "../data/store";
import type { Config } from "../config";
import { todayLocal } from "../dates";
import type { Settings, Task } from "../data/schema";
import { dailySelection, rateSong } from "../sr/scheduler";
import { strengthCounts } from "../sr/strength";
import { topUpToday } from "./topUp";
import type { TodayPort } from "../ui/ports";

export interface PortDeps {
  newId: () => string;
  nowIso: () => string;
  getEffectiveConfig: (s?: Settings | null) => Config;
  /** Local date "YYYY-MM-DD"; defaults to the device clock. */
  today?: () => string;
}

/**
 * Adapter between the Today view and the validated store. Every write goes through
 * store.putTask, which validates and throws ValidationError.
 * Timer prefs mapping: Settings timerSound/timerVibrate/timerOvertime -> {sound, vibrate, overtime}
 * via getEffectiveConfig(...).timer (null settings falls back to config.timer).
 */
export function makeTodayPort(
  store: Pick<Store, "putTask" | "getTask" | "deleteTask" | "listTasks" | "getSettings" | "putSettings" | "listSongs" | "getSong" | "putSong">,
  deps: PortDeps,
): TodayPort {
  const today = () => (deps.today ?? todayLocal)();
  return {
    listTasks: () => store.listTasks(),
    async addTask(t) {
      const task: Task = {
        id: deps.newId(),
        name: t.name,
        minutes: t.minutes,
        days: t.days,
        lastCompletedOn: null,
        createdAt: deps.nowIso(),
      };
      await store.putTask(task);
    },
    async updateTask(id, patch) {
      const old = await store.getTask(id);
      if (!old) throw new Error("Task not found");
      await store.putTask({ ...old, name: patch.name, minutes: patch.minutes, days: patch.days });
    },
    async deleteTask(id) {
      const old = await store.getTask(id);
      if (!old) throw new Error("Task not found");
      await store.deleteTask(id);
      return old;
    },
    async restoreTask(snapshot) {
      await store.putTask(snapshot);
    },
    async setCompleted(id, date) {
      const task = await store.getTask(id);
      if (!task) throw new Error("Task not found");
      await store.putTask({ ...task, lastCompletedOn: date });
    },
    async getTimerPrefs() {
      const { sound, vibrate, overtime } = deps.getEffectiveConfig(await store.getSettings()).timer;
      return { sound, vibrate, overtime };
    },
    async getTempo() {
      return deps.getEffectiveConfig(await store.getSettings()).metronome.bpm;
    },
    async setTempo(bpm) {
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
      await store.putSettings({ ...base, metronomeBpm: bpm });
    },
    async listTodaySongs() {
      const { songs, songsPerDay, day } = await topUpToday(store, deps);
      return {
        songsPerDay,
        songs: dailySelection(songs, day, songsPerDay).map((s) => ({ id: s.id, title: s.title, ratedToday: s.lastReviewed === day })),
      };
    },
    async rateTodaySong(id, rating) {
      const day = today();
      const old = await store.getSong(id);
      if (!old) throw new Error("Song not found");
      if (old.lastReviewed === day) throw new Error("Already rated today");
      await store.putSong(rateSong(old, rating, day));
      return old;
    },
    async restoreTodaySong(snapshot) {
      await store.putSong(snapshot);
    },
    async repertoireStrength() {
      return strengthCounts(await store.listSongs());
    },
  };
}
