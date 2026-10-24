import { config } from "../config";
import type { TimerPrefs } from "./ports";

export interface OscLike {
  frequency: { value: number };
  connect(n: unknown): unknown;
  start(t: number): void;
  stop(t: number): void;
}
export interface GainLike {
  gain: { value: number };
  connect(n: unknown): unknown;
}
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  createOscillator(): OscLike;
  createGain(): GainLike;
  close(): Promise<void> | void;
}
export interface SentinelLike {
  release(): Promise<void>;
}
export interface FeedbackEnv {
  audioSession?: { type: string };
  createAudioContext?: () => AudioContextLike;
  vibrate?: (pattern: number) => boolean;
  wakeLock?: { request(type: "screen"): Promise<SentinelLike> };
  onVisible: (fn: () => void) => () => void;
}

export interface Feedback {
  /** Create the audio engine; call from a user gesture (iOS). */
  prime(): void;
  chime(prefs: TimerPrefs): void;
  acquireWakeLock(): void;
  releaseWakeLock(): void;
  dispose(): void;
}

export function createFeedback(env: FeedbackEnv): Feedback {
  if (env.audioSession) env.audioSession.type = "playback";
  let ctx: AudioContextLike | null = null;
  let sentinel: SentinelLike | null = null;
  let wanted = false;

  const closeCtx = () => {
    try {
      void Promise.resolve(ctx?.close()).catch(() => {});
    } catch {
      /* ignore */
    }
    ctx = null;
  };
  const build = () => {
    if (!env.createAudioContext) return;
    try {
      ctx = env.createAudioContext();
    } catch {
      ctx = null;
    }
  };
  const request = async () => {
    if (!env.wakeLock) return;
    try {
      const s = await env.wakeLock.request("screen");
      if (!wanted || sentinel) {
        void s.release().catch(() => {});
        return;
      }
      sentinel = s;
    } catch {
      /* denied or unsupported: best effort */
    }
  };

  const offVisible = env.onVisible(() => {
    // WebKit can leave Web Audio silent after backgrounding and resume() is unreliable: rebuild.
    if (ctx) {
      closeCtx();
      build();
    }
    if (wanted) {
      const old = sentinel;
      sentinel = null;
      void old?.release().catch(() => {});
      void request();
    }
  });

  return {
    prime() {
      if (!ctx) build();
    },
    chime(prefs) {
      if (prefs.sound) {
        if (!ctx) build();
        if (ctx) {
          const t0 = ctx.currentTime;
          const len = config.today.chimeMs / 1000;
          for (let i = 0; i < config.today.chimeBeeps; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = config.today.chimeHz;
            gain.gain.value = config.today.chimeGain;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + i * len * 2);
            osc.stop(t0 + i * len * 2 + len);
          }
        }
      }
      if (prefs.vibrate && env.vibrate) env.vibrate(config.today.vibrateMs);
    },
    acquireWakeLock() {
      wanted = true;
      if (!sentinel) void request();
    },
    releaseWakeLock() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    },
    dispose() {
      offVisible();
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
      closeCtx();
    },
  };
}

/** Real browser environment; every capability is optional. */
export function browserFeedbackEnv(): FeedbackEnv {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    audioSession?: { type: string };
    wakeLock?: { request(type: "screen"): Promise<SentinelLike> };
  };
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return {
    audioSession: nav.audioSession,
    createAudioContext: Ctor ? () => new Ctor() : undefined,
    vibrate: typeof nav.vibrate === "function" ? (p) => nav.vibrate(p) : undefined,
    wakeLock: nav.wakeLock,
    onVisible: (fn) => {
      const h = () => {
        if (document.visibilityState === "visible") fn();
      };
      document.addEventListener("visibilitychange", h);
      return () => document.removeEventListener("visibilitychange", h);
    },
  };
}
