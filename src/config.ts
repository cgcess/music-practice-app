import type { Settings } from "./data/schema";

export const config = {
  sr: {
    initialIntervalDays: 1,
    easeMin: 1.3,
    easeMax: 3.0,
    easeInitial: 2.5,
    maxIntervalDays: 365,
    ratingScale: [1, 2, 3, 4] as readonly number[],
  },
  songsPerDay: 3,
  suggestionPeriod: "daily" as "daily" | "weekly",
  timer: {
    sound: true,
    vibrate: true,
    overtime: true,
    minMinutes: 1,
    maxMinutes: 240,
  },
  today: {
    /** How long the "Done - Undo" toast stays. */
    undoMs: 5000,
    /** A chime later than this after the target is dropped (returning from background). */
    chimeGraceMs: 2000,
    /** Minimum horizontal drag for a swipe, in px. */
    swipeMinPx: 60,
    /** |dx| must exceed swipeRatio * |dy| for a swipe. */
    swipeRatio: 2,
    tickMs: 250,
    chimeHz: 880,
    chimeMs: 300,
    chimeBeeps: 3,
    vibrateMs: 300,
    /** Fade/collapse when a row moves between To do and Done. */
    moveMs: 250,
    /** Swipe release spring-back. */
    springMs: 250,
    /** Add-task sheet slide/fade. */
    sheetMs: 250,
  },
};

export type Config = typeof config;

/** Defaults overridden by the user-facing fields of the Settings record. */
export function getEffectiveConfig(settings?: Settings | null): Config {
  if (!settings) return config;
  return {
    ...config,
    songsPerDay: settings.songsPerDay,
    suggestionPeriod: settings.suggestionPeriod,
    timer: {
      ...config.timer,
      sound: settings.timerSound,
      vibrate: settings.timerVibrate,
      overtime: settings.timerOvertime,
    },
  };
}
