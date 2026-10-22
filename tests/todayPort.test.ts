import "fake-indexeddb/auto";
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeTodayPort } from "../src/app/todayPort";
import { config, getEffectiveConfig } from "../src/config";
import { ValidationError } from "../src/data/schema";
import { Store } from "../src/data/store";
import { todayView, type TodayEnv } from "../src/ui/today";

let n = 0;
const setup = () => {
  const store = new Store(`todayport-${++n}-${Math.random()}`);
  let ids = 0;
  const port = makeTodayPort(store, {
    newId: () => `id-${++ids}`,
    nowIso: () => "2026-10-22T12:00:00+00:00",
    getEffectiveConfig,
  });
  return { store, port };
};

describe("todayPort", () => {
  it("adds a full task and lists it", async () => {
    const { port, store } = setup();
    await port.addTask({ name: "Scales", minutes: 10, days: "daily" });
    expect(await store.listTasks()).toEqual([
      { id: "id-1", name: "Scales", minutes: 10, days: "daily", lastCompletedOn: null, createdAt: "2026-10-22T12:00:00+00:00" },
    ]);
    expect((await port.listTasks())[0]?.name).toBe("Scales");
  });
  it("undo round trip restores the previous value in the real store", async () => {
    const { port, store } = setup();
    await port.addTask({ name: "S", minutes: 5, days: [1] });
    await port.setCompleted("id-1", "2026-10-20");
    await port.setCompleted("id-1", "2026-10-22");
    await port.setCompleted("id-1", "2026-10-20");
    expect((await store.getTask("id-1"))!.lastCompletedOn).toBe("2026-10-20");
    await port.setCompleted("id-1", null);
    expect((await store.getTask("id-1"))!.lastCompletedOn).toBeNull();
  });
  it("rejects invalid minutes with ValidationError", async () => {
    const { port, store } = setup();
    await expect(port.addTask({ name: "S", minutes: 241, days: "daily" })).rejects.toBeInstanceOf(ValidationError);
    await expect(port.addTask({ name: "", minutes: 5, days: "daily" })).rejects.toBeInstanceOf(ValidationError);
    expect(await store.listTasks()).toEqual([]);
  });
  it("rejects completing an unknown task", async () => {
    const { port } = setup();
    await expect(port.setCompleted("nope", "2026-10-22")).rejects.toThrow();
  });
  it("null settings give config.timer prefs", async () => {
    const { port } = setup();
    expect(await port.getTimerPrefs()).toEqual({
      sound: config.timer.sound,
      vibrate: config.timer.vibrate,
      overtime: config.timer.overtime,
    });
  });
  it("overtime:false settings show time up at 0:00 in the Today view", async () => {
    const { port, store } = setup();
    await store.putSettings({
      songsPerDay: 3,
      suggestionPeriod: "daily",
      timerSound: false,
      timerVibrate: false,
      timerOvertime: false,
    });
    expect(await port.getTimerPrefs()).toEqual({ sound: false, vibrate: false, overtime: false });
    await port.addTask({ name: "S", minutes: 1, days: "daily" });
    let clock = Date.now();
    let tick: () => void = () => {};
    const env: TodayEnv = {
      port,
      now: () => clock,
      feedback: { prime() {}, chime() {}, acquireWakeLock() {}, releaseWakeLock() {}, dispose() {} },
      every: (fn) => {
        tick = fn;
        return () => {};
      },
      after: () => () => {},
      onVisible: () => () => {},
    };
    const v = todayView(env);
    document.body.replaceChildren(v.el);
    await new Promise((r) => setTimeout(r, 20));
    (document.querySelector("button.act") as HTMLButtonElement).click();
    clock += 61_000;
    tick();
    expect(document.querySelector(".time")!.textContent).toContain("time up");
    v.dispose();
  });
});
