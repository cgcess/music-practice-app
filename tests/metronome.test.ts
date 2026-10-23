// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { createMetronomePanel, type MetronomeAudioContext, type MetronomeEnv, type MetronomePanel } from "../src/ui/metronome";

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let panels: MetronomePanel[] = [];
afterEach(() => {
  for (const p of panels) p.dispose();
  panels = [];
  document.body.replaceChildren();
});

function rig(saved = 100) {
  const log = { created: 0, resumed: 0, closed: 0, clicks: [] as number[], saves: [] as number[], intervals: 0, cancelled: 0 };
  let now = 5;
  let tick: (() => void) | null = null;
  let vis: ((v: boolean) => void) | null = null;
  const env: MetronomeEnv = {
    audioSession: { type: "auto" },
    createAudioContext: () => {
      log.created++;
      const c: MetronomeAudioContext = {
        get currentTime() {
          return now;
        },
        destination: {},
        createOscillator: () => ({
          frequency: { value: 0 },
          connect: () => {},
          start: (t: number) => log.clicks.push(t),
          stop: () => {},
        }),
        createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
        resume: () => {
          log.resumed++;
        },
        close: () => {
          log.closed++;
        },
      };
      return c;
    },
    every: (fn) => {
      log.intervals++;
      tick = fn;
      return () => {
        log.cancelled++;
        tick = null;
      };
    },
    onVisible: (cb) => {
      vis = cb;
      return () => {
        vis = null;
      };
    },
  };
  let failSave: Error | null = null;
  const port = {
    getTempo: async () => saved,
    setTempo: async (b: number) => {
      if (failSave) throw failSave;
      log.saves.push(b);
    },
  };
  const panel = createMetronomePanel({ port, env });
  panels.push(panel);
  document.body.replaceChildren(panel.el);
  return {
    panel,
    log,
    env,
    advance: (ms: number) => {
      now += ms / 1000;
      tick?.();
    },
    hide: () => vis?.(false),
    show: () => vis?.(true),
    failWith: (e: Error) => (failSave = e),
  };
}
const q = <T extends Element>(s: string) => document.querySelector(s) as T;
const bpmText = () => q(".metro-bpm").textContent;
const slider = () => q<HTMLInputElement>(".metro-slider");

describe("metronome panel", () => {
  it("starts collapsed, showing BPM and play; expanding reveals the tempo controls", async () => {
    const r = rig();
    await flush();
    const toggle = q<HTMLButtonElement>(".metro-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(bpmText()).toBe("100 BPM");
    expect(q<HTMLElement>(".metro-play").getAttribute("aria-label")).toBe("Start metronome");
    expect(q<HTMLElement>(".metro-controls").hidden).toBe(true);
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(q<HTMLElement>(".metro-controls").hidden).toBe(false);
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBe(q(".metro-controls"));
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(r.panel.playing()).toBe(false);
  });

  it("mount reads getTempo and renders it in text and slider", async () => {
    rig(140);
    await flush();
    expect(bpmText()).toBe("140 BPM");
    expect(slider().value).toBe("140");
    expect(slider().getAttribute("aria-valuetext")).toBe("140 BPM");
  });

  it("Play creates and resumes a context, sets the audio session and schedules clicks; Stop closes it", async () => {
    const r = rig();
    expect(r.env.audioSession?.type).toBe("playback");
    q<HTMLButtonElement>(".metro-play").click();
    expect(r.log.created).toBe(1);
    expect(r.log.resumed).toBe(1);
    expect(r.panel.playing()).toBe(true);
    expect(r.log.clicks[0]).toBe(5);
    expect(q<HTMLElement>(".metro-play").getAttribute("aria-label")).toBe("Stop metronome");
    for (let i = 0; i < 40; i++) r.advance(25);
    expect(r.log.clicks.length).toBeGreaterThan(1);
    expect(r.log.clicks[1]! - r.log.clicks[0]!).toBeCloseTo(0.6, 9);
    q<HTMLButtonElement>(".metro-play").click();
    expect(r.panel.playing()).toBe(false);
    expect(r.log.closed).toBe(1);
    expect(r.log.cancelled).toBe(1);
    const n = r.log.clicks.length;
    r.advance(2000);
    expect(r.log.clicks.length).toBe(n);
    expect(q<HTMLElement>(".metro-play").getAttribute("aria-label")).toBe("Start metronome");
  });

  it("going to the background stops playback and closes the context; Play again works", () => {
    const r = rig();
    q<HTMLButtonElement>(".metro-play").click();
    r.hide();
    expect(r.panel.playing()).toBe(false);
    expect(r.log.closed).toBe(1);
    expect(q<HTMLElement>(".metro-play").getAttribute("aria-label")).toBe("Start metronome");
    r.show();
    expect(r.panel.playing()).toBe(false);
    q<HTMLButtonElement>(".metro-play").click();
    expect(r.panel.playing()).toBe(true);
    expect(r.log.created).toBe(2);
  });

  it("-/+ clamp to min and max and save the tempo", async () => {
    const r = rig(config.metronome.minBpm);
    await flush();
    const [dec, inc] = [...document.querySelectorAll<HTMLButtonElement>(".metro-step")];
    expect(dec!.disabled).toBe(true);
    dec!.click();
    expect(r.panel.bpm()).toBe(config.metronome.minBpm);
    expect(r.log.saves).toEqual([]);
    inc!.click();
    expect(r.panel.bpm()).toBe(config.metronome.minBpm + config.metronome.step);
    expect(r.log.saves).toEqual([config.metronome.minBpm + config.metronome.step]);
    slider().value = String(config.metronome.maxBpm);
    slider().dispatchEvent(new Event("input"));
    expect(inc!.disabled).toBe(true);
    inc!.click();
    expect(r.panel.bpm()).toBe(config.metronome.maxBpm);
  });

  it("slider changes the tempo while playing and saves on change, not on input", async () => {
    const r = rig();
    await flush();
    q<HTMLButtonElement>(".metro-play").click();
    slider().value = "60";
    slider().dispatchEvent(new Event("input"));
    expect(bpmText()).toBe("60 BPM");
    expect(slider().getAttribute("aria-valuetext")).toBe("60 BPM");
    expect(r.log.saves).toEqual([]);
    slider().dispatchEvent(new Event("change"));
    expect(r.log.saves).toEqual([60]);
    const n = r.log.clicks.length;
    for (let i = 0; i < 200; i++) r.advance(25);
    const t = r.log.clicks.slice(n);
    expect(r.log.clicks[n + 1]! - r.log.clicks[n]!).toBeCloseTo(1, 9);
    expect(t.length).toBeGreaterThan(2);
    expect(r.panel.playing()).toBe(true);
  });

  it("shows a save error", async () => {
    const r = rig();
    r.failWith(new Error("nope"));
    q<HTMLButtonElement>(".metro-step:last-of-type").click();
    await flush();
    expect(q(".metro-error").textContent).toBe("nope");
  });

  it("controls have labels, are focusable and are in DOM order", () => {
    rig();
    const order = [".metro-toggle", ".metro-play", ".metro-step[aria-label='Decrease tempo']", ".metro-slider", ".metro-step[aria-label='Increase tempo']"];
    const els = order.map((s) => q<HTMLElement>(s));
    for (const e of els) {
      expect(e.tabIndex).toBeGreaterThanOrEqual(0);
      expect((e as HTMLButtonElement).disabled).toBeFalsy();
    }
    expect(slider().getAttribute("aria-label")).toBe("Tempo");
    expect(slider().type).toBe("range");
    expect(slider().min).toBe(String(config.metronome.minBpm));
    expect(slider().max).toBe(String(config.metronome.maxBpm));
    const doc = [...document.querySelectorAll("button, input")];
    // bar order: toggle, then bpm, then play; controls follow the bar
    expect(doc.indexOf(els[0]!)).toBeLessThan(doc.indexOf(els[1]!));
    expect(doc.indexOf(els[1]!)).toBeLessThan(doc.indexOf(els[2]!));
    expect(doc.indexOf(els[2]!)).toBeLessThan(doc.indexOf(els[3]!));
    expect(doc.indexOf(els[3]!)).toBeLessThan(doc.indexOf(els[4]!));
  });
});
