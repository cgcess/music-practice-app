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
  it("tempo: default without a record, round trip, range check, other fields kept", async () => {
    const { port, store } = setup();
    expect(await port.getTempo()).toBe(config.metronome.defaultBpm);
    await port.setTempo(140);
    expect(await port.getTempo()).toBe(140);
    expect((await store.getSettings())?.metronomeBpm).toBe(140);
    await store.putSettings({ ...(await store.getSettings())!, songsPerDay: 5, timerSound: false });
    await port.setTempo(90);
    expect(await store.getSettings()).toMatchObject({ songsPerDay: 5, timerSound: false, metronomeBpm: 90 });
    await expect(port.setTempo(config.metronome.maxBpm + 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(port.setTempo(config.metronome.minBpm - 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(port.setTempo(100.5)).rejects.toBeInstanceOf(ValidationError);
    expect(await port.getTempo()).toBe(90);
  });
  it("overtime:false settings show time up at 0:00 in the Today view", async () => {
    const { port, store } = setup();
    await store.putSettings({
      songsPerDay: 3,
      suggestionPeriod: "daily",
      timerSound: false,
      timerVibrate: false,
      timerOvertime: false,
      metronomeBpm: 100,
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

describe("todayPort edit/delete", () => {
  it("update preserves id, lastCompletedOn, createdAt and persists in a new port", async () => {
    const { port, store } = setup();
    await port.addTask({ name: "S", minutes: 5, days: [1] });
    await port.setCompleted("id-1", "2026-10-20");
    await port.updateTask("id-1", { name: "Scales", minutes: 12, days: "daily" });
    const port2 = makeTodayPort(store, { newId: () => "x", nowIso: () => "2030-01-01T00:00:00+00:00", getEffectiveConfig });
    expect(await port2.listTasks()).toEqual([
      { id: "id-1", name: "Scales", minutes: 12, days: "daily", lastCompletedOn: "2026-10-20", createdAt: "2026-10-22T12:00:00+00:00" },
    ]);
  });
  it("update rejects invalid values and missing ids", async () => {
    const { port } = setup();
    await port.addTask({ name: "S", minutes: 5, days: "daily" });
    await expect(port.updateTask("id-1", { name: "S", minutes: 241, days: "daily" })).rejects.toBeInstanceOf(ValidationError);
    await expect(port.updateTask("id-1", { name: "S", minutes: 0, days: "daily" })).rejects.toBeInstanceOf(ValidationError);
    await expect(port.updateTask("nope", { name: "S", minutes: 5, days: "daily" })).rejects.toThrow("Task not found");
    await expect(port.deleteTask("nope")).rejects.toThrow("Task not found");
  });
  it("delete returns the full record and restore brings back the identical record", async () => {
    const { port } = setup();
    await port.addTask({ name: "S", minutes: 5, days: [2, 3] });
    const before = (await port.listTasks())[0]!;
    const snap = await port.deleteTask("id-1");
    expect(snap).toEqual({ ...before, createdAt: "2026-10-22T12:00:00+00:00" });
    expect(await port.listTasks()).toEqual([]);
    await port.restoreTask(snap);
    expect(await port.listTasks()).toEqual([snap]);
  });
});
