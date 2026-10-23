import type { Settings } from "./data/schema";

const DEFAULT_METRONOME_BPM = 100;

export const config = {
  sr: {
    initialIntervalDays: 1,
    easeMin: 1.3,
    easeMax: 3.0,
    easeInitial: 2.5,
    maxIntervalDays: 365,
    ratingScale: ["rough", "ok", "solid"] as const,
    /** Ease change for a "rough" rating (subtracted). */
    easeRoughDelta: 0.2,
    /** Ease change for a "solid" rating (added). */
    easeSolidDelta: 0.15,
    /** Extra interval multiplier for a "solid" rating. */
    solidMultiplier: 1.3,
    /** Interval fuzz, as a fraction either side (0.1 = +-10%). */
    fuzzPct: 0.1,
    /** Fuzz applies only to rounded intervals of at least this many days. */
    fuzzMinIntervalDays: 3,
    /** A new song is first due 0..this many days after it is added. */
    newSongSpreadDays: 7,
    /** Repertoire strength bar: ease at or above this counts as "well". */
    wellEase: 2.6,
    /** Repertoire strength bar: ease below this counts as "poorly". */
    poorEase: 2.4,
  },
  /** Upper bound of the songs-per-day stepper on the Repertoire tab. */
  maxSongsPerDay: 10,
  songsPerDay: 3,
  suggestionPeriod: "daily" as "daily" | "weekly",
  timer: {
    sound: true,
    vibrate: true,
    overtime: true,
    minMinutes: 1,
    maxMinutes: 240,
  },
  metronome: {
    defaultBpm: DEFAULT_METRONOME_BPM,
    minBpm: 30,
    maxBpm: 240,
    step: 1,
    /** How far ahead of the audio clock clicks are queued, in ms. */
    lookaheadMs: 100,
    /** Scheduler wake-up interval, in ms. */
    tickMs: 25,
    clickHz: 1000,
    clickMs: 30,
    /** Tempo from the Settings record (defaults to defaultBpm). */
    bpm: DEFAULT_METRONOME_BPM,
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
    /** Fallback removal of the leaving-toast ghost if animationend never fires. */
    toastLeaveMs: 400,
    /** Horizontal movement before a swipe captures the pointer so the row follows the finger, in px. */
    capturePx: 10,
  },
};

export type Config = typeof config;

/** Defaults overridden by the user-facing fields of the Settings record. */
export function getEffectiveConfig(settings?: Settings | null): Config {
  if (!settings) return config;
  return {
    ...config,
    metronome: { ...config.metronome, bpm: settings.metronomeBpm },
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
