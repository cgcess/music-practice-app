import { describe, expect, it } from "vitest";
import { createFeedback, type AudioContextLike, type FeedbackEnv } from "../src/ui/feedback";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(over: Partial<FeedbackEnv> = {}) {
  const log = { ctxs: [] as { closed: boolean; osc: number; resumed: number }[], vib: [] as number[], locks: [] as { released: boolean }[] };
  let visible: () => void = () => {};
  const env: FeedbackEnv = {
    audioSession: { type: "auto" },
    createAudioContext: () => {
      const rec = { closed: false, osc: 0, resumed: 0 };
      log.ctxs.push(rec);
      const ctx: AudioContextLike & { resume: () => void } = {
        currentTime: 0,
        destination: {},
        createOscillator: () => {
          rec.osc++;
          return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
        },
        createGain: () => ({ gain: { value: 1 }, connect() {} }),
        close: () => {
          rec.closed = true;
        },
        resume: () => {
          rec.resumed++;
        },
      };
      return ctx;
    },
    vibrate: (p) => {
      log.vib.push(p);
      return true;
    },
    wakeLock: {
      request: async () => {
        const s = { released: false };
        log.locks.push(s);
        return {
          release: async () => {
            s.released = true;
          },
        };
      },
    },
    onVisible: (fn) => {
      visible = fn;
      return () => {};
    },
    ...over,
  };
  return { env, log, fireVisible: () => visible() };
}

describe("feedback", () => {
  it("sets audioSession to playback", () => {
    const { env } = setup();
    createFeedback(env);
    expect(env.audioSession?.type).toBe("playback");
  });
  it("rebuilds the audio context on visible without resume()", () => {
    const { env, log, fireVisible } = setup();
    const f = createFeedback(env);
    f.prime();
    fireVisible();
    expect(log.ctxs).toHaveLength(2);
    expect(log.ctxs[0]!.closed).toBe(true);
    expect(log.ctxs.every((c) => c.resumed === 0)).toBe(true);
    f.chime({ sound: true, vibrate: false, overtime: true });
    expect(log.ctxs[1]!.osc).toBeGreaterThan(0);
  });
  it("does not play sound when off, and vibrates only if enabled and present", () => {
    const { env, log } = setup();
    const f = createFeedback(env);
    f.chime({ sound: false, vibrate: true, overtime: true });
    expect(log.ctxs).toHaveLength(0);
    expect(log.vib).toHaveLength(1);
    f.chime({ sound: false, vibrate: false, overtime: true });
    expect(log.vib).toHaveLength(1);
    const { env: env2 } = setup({ vibrate: undefined });
    expect(() => createFeedback(env2).chime({ sound: false, vibrate: true, overtime: true })).not.toThrow();
  });
  it("works with no audio support", () => {
    const { env } = setup({ createAudioContext: undefined, audioSession: undefined });
    expect(() => createFeedback(env).chime({ sound: true, vibrate: false, overtime: true })).not.toThrow();
  });
  it("acquires, re-acquires on visible, and releases the wake lock", async () => {
    const { env, log, fireVisible } = setup();
    const f = createFeedback(env);
    f.acquireWakeLock();
    await flush();
    expect(log.locks).toHaveLength(1);
    fireVisible();
    await flush();
    expect(log.locks).toHaveLength(2);
    expect(log.locks[0]!.released).toBe(true);
    f.releaseWakeLock();
    await flush();
    expect(log.locks[1]!.released).toBe(true);
    fireVisible();
    await flush();
    expect(log.locks).toHaveLength(2);
  });
  it("pause/resume/finish leaves no held wake lock (acquire, release, acquire, release)", async () => {
    const { env, log } = setup();
    const f = createFeedback(env);
    f.acquireWakeLock();
    await flush();
    f.releaseWakeLock();
    await flush();
    f.acquireWakeLock();
    await flush();
    f.releaseWakeLock();
    await flush();
    expect(log.locks).toHaveLength(2);
    expect(log.locks.every((l) => l.released)).toBe(true);
  });
  it("releases a lock that resolves after release was requested", async () => {
    const { env, log } = setup();
    const f = createFeedback(env);
    f.acquireWakeLock();
    f.releaseWakeLock();
    await flush();
    expect(log.locks[0]!.released).toBe(true);
  });
});
