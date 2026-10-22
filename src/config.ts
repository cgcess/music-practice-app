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
