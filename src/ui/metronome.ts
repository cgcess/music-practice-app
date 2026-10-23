import { config } from "../config";
import { h } from "./h";
import { icon } from "./icons";
import type { TodayPort } from "./ports";
import { createScheduler, type MetronomeScheduler } from "./metronomeScheduler";

export interface ClickOsc {
  type?: string;
  frequency: { value: number };
  connect(n: unknown): unknown;
  start(t: number): void;
  stop(t: number): void;
}
export interface ClickGain {
  gain: { value: number };
  connect(n: unknown): unknown;
}
export interface MetronomeAudioContext {
  currentTime: number;
  destination: unknown;
  createOscillator(): ClickOsc;
  createGain(): ClickGain;
  resume?(): Promise<void> | void;
  close(): Promise<void> | void;
}
export interface MetronomeEnv {
  audioSession?: { type: string };
  createAudioContext?: () => MetronomeAudioContext;
  /** Repeating callback; returns cancel. */
  every: (fn: () => void, ms: number) => () => void;
  /** Reports page visibility changes; returns unsubscribe. */
  onVisible: (cb: (visible: boolean) => void) => () => void;
}

export interface MetronomePanel {
  el: HTMLElement;
  playing(): boolean;
  bpm(): number;
  dispose(): void;
}

/**
 * The metronome owns its own AudioContext, created and resumed inside the Play tap (iOS needs a gesture).
 * Going to the background stops it and closes the context; the user presses Play again (fresh gesture).
 */
export function createMetronomePanel(opts: { port: Pick<TodayPort, "getTempo" | "setTempo">; env: MetronomeEnv }): MetronomePanel {
  const { port, env } = opts;
  const m = config.metronome;
  if (env.audioSession) env.audioSession.type = "playback";

  let bpm = m.defaultBpm;
  let touched = false;
  let expanded = false;
  let disposed = false;
  let ctx: MetronomeAudioContext | null = null;
  let sched: MetronomeScheduler | null = null;

  const clamp = (n: number) => Math.min(m.maxBpm, Math.max(m.minBpm, Math.round(n)));

  const closeCtx = () => {
    const c = ctx;
    ctx = null;
    try {
      void Promise.resolve(c?.close()).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const click = (time: number) => {
    const c = ctx;
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = m.clickHz;
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(time);
    osc.stop(time + m.clickMs / 1000);
  };

  const id = "metronome-controls";
  const bpmEl = h("span", { class: "metro-bpm" });
  const toggle = h("button", { type: "button", class: "metro-toggle", "aria-expanded": "false", "aria-controls": id, onClick: () => setExpanded(!expanded) }, h("span", null, "Metronome"), icon("chevron"));
  const playBtn = h("button", { type: "button", class: "metro-play", onClick: () => (sched?.running() ? stop() : play()) });
  const decBtn = h("button", { type: "button", class: "metro-step", "aria-label": "Decrease tempo", onClick: () => nudge(-m.step) }, "−");
  const incBtn = h("button", { type: "button", class: "metro-step", "aria-label": "Increase tempo", onClick: () => nudge(m.step) }, "+");
  const slider = h("input", {
    type: "range",
    class: "metro-slider",
    "aria-label": "Tempo",
    min: m.minBpm,
    max: m.maxBpm,
    step: m.step,
    onInput: () => setBpm(Number(slider.value)),
    onChange: () => commit(),
  });
  const errorEl = h("p", { class: "metro-error", "aria-live": "assertive" });
  const controls = h("div", { class: "metro-controls", id, role: "group", "aria-label": "Tempo controls", hidden: true }, decBtn, slider, incBtn);
  const el = h("section", { class: "metronome", "aria-label": "Metronome" }, h("div", { class: "metro-bar" }, toggle, bpmEl, playBtn), controls, errorEl);

  const sync = () => {
    bpmEl.textContent = `${bpm} BPM`;
    slider.value = String(bpm);
    slider.setAttribute("aria-valuetext", `${bpm} BPM`);
    decBtn.disabled = bpm <= m.minBpm;
    incBtn.disabled = bpm >= m.maxBpm;
    const on = sched?.running() ?? false;
    playBtn.setAttribute("aria-label", on ? "Stop metronome" : "Start metronome");
    playBtn.setAttribute("aria-pressed", String(on));
    playBtn.replaceChildren(icon(on ? "stop" : "play"));
    el.classList.toggle("playing", on);
  };
  const setExpanded = (v: boolean) => {
    expanded = v;
    controls.hidden = !v;
    toggle.setAttribute("aria-expanded", String(v));
  };
  const setBpm = (n: number) => {
    touched = true;
    bpm = clamp(n);
    sync();
  };
  const commit = () => {
    errorEl.textContent = "";
    port.setTempo(bpm).catch((e: unknown) => {
      if (!disposed) errorEl.textContent = e instanceof Error ? e.message : "Could not save tempo";
    });
  };
  const nudge = (d: number) => {
    const before = bpm;
    setBpm(bpm + d);
    if (bpm !== before) commit();
  };

  const stop = () => {
    sched?.stop();
    sched = null;
    closeCtx();
    sync();
  };
  const play = () => {
    if (sched?.running() || !env.createAudioContext) return;
    try {
      ctx = env.createAudioContext();
    } catch {
      ctx = null;
      return;
    }
    void Promise.resolve(ctx.resume?.()).catch(() => {});
    const c = ctx;
    sched = createScheduler({
      audioNow: () => c.currentTime,
      schedule: click,
      every: env.every,
      bpm: () => bpm,
      lookaheadMs: m.lookaheadMs,
      tickMs: m.tickMs,
    });
    sched.start();
    sync();
  };

  const offVisible = env.onVisible((visible) => {
    if (!visible && sched?.running()) stop();
  });

  sync();
  void port
    .getTempo()
    .then((b) => {
      if (disposed || touched) return;
      bpm = clamp(b);
      sync();
    })
    .catch(() => {});

  return {
    el,
    playing: () => sched?.running() ?? false,
    bpm: () => bpm,
    dispose() {
      disposed = true;
      offVisible();
      stop();
    },
  };
}

/** Real browser environment; audio is optional. */
export function browserMetronomeEnv(): MetronomeEnv {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { audioSession?: { type: string } };
  const g = globalThis as unknown as {
    AudioContext?: new () => MetronomeAudioContext;
    webkitAudioContext?: new () => MetronomeAudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return {
    audioSession: nav.audioSession,
    createAudioContext: Ctor ? () => new Ctor() : undefined,
    every: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    onVisible: (cb) => {
      const hnd = () => cb(document.visibilityState === "visible");
      document.addEventListener("visibilitychange", hnd);
      return () => document.removeEventListener("visibilitychange", hnd);
    },
  };
}
