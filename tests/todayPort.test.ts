import "fake-indexeddb/auto";
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeTodayPort } from "../src/app/todayPort";
import { config, getEffectiveConfig } from "../src/config";
import { ValidationError } from "../src/data/schema";
import { Store } from "../src/data/store";
import { dueText } from "../src/sr/dueText";
import { makeRepertoirePort } from "../src/app/repertoirePort";
import { song } from "./helpers";
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
  it("repertoireStrength counts the whole repertoire and writes nothing", async () => {
    const { port, store } = setup();
    await store.putSong(song({ id: "a", ease: 2.8 }));
    await store.putSong(song({ id: "b", ease: 2.5 }));
    await store.putSong(song({ id: "c", ease: 2.0 }));
    await store.putSong(song({ id: "d", ease: 3.0, lastReviewed: null }));
    const before = await store.listSongs();
    expect(await port.repertoireStrength()).toEqual({ well: 1, okay: 1, poorly: 1, fresh: 1 });
    expect(await store.listSongs()).toEqual(before);
  });
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

describe("todayPort songs (t014)", () => {
  const DAY = "2026-10-23";
  const mkSongs = (spd = 3) => {
    const store = new Store(`todaysongs-${++n}-${Math.random()}`);
    const d = { newId: () => "x", nowIso: () => "2026-10-23T12:00:00+00:00", getEffectiveConfig, today: () => DAY };
    return { store, d, port: makeTodayPort(store, d), spd, repo: makeRepertoirePort(store, d) };
  };
  const put = async (store: Store, spd: number, ...songs: ReturnType<typeof song>[]) => {
    await store.putSettings({ ...settingsRec, songsPerDay: spd });
    for (const s of songs) await store.putSong(s);
  };
  const settingsRec = { songsPerDay: 3, suggestionPeriod: "daily" as const, timerSound: true, timerVibrate: false, timerOvertime: true, metronomeBpm: 100 };
  const fut = (id: string, dueDate: string, o = {}) => song({ id, dueDate, lastReviewed: null, ...o });

  it("top-up persists dueDate = today, reload gives the same list, dueText reads today", async () => {
    const { store, port, d } = mkSongs();
    await put(store, 3, fut("a", "2026-10-25"), fut("b", "2026-10-27"), fut("c", "2026-11-20"));
    const first = await port.listTodaySongs();
    expect(first.songs.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
    const stored = await store.listSongs();
    expect(stored.every((s) => s.dueDate === DAY)).toBe(true);
    const second = await makeTodayPort(store, d).listTodaySongs();
    expect(second).toEqual(first);
    expect(dueText(stored[0]!.dueDate, DAY)).toBe("today");
  });
  it("fewer due than songsPerDay gives a non-empty selection", async () => {
    const { store, port } = mkSongs();
    await put(store, 3, fut("a", "2026-10-30"));
    const r = await port.listTodaySongs();
    expect(r.songs.map((s) => s.id)).toEqual(["a"]);
    expect((await store.getSong("a"))!.dueDate).toBe(DAY);
  });
  it("songsPerDay 0 returns no songs and writes nothing", async () => {
    const { store, port } = mkSongs();
    await put(store, 0, fut("a", "2026-10-30"));
    expect((await port.listTodaySongs()).songs).toEqual([]);
    expect((await store.getSong("a"))!.dueDate).toBe("2026-10-30");
  });
  it("an unrated shown song is still shown the next day", async () => {
    const { store, d } = mkSongs();
    await put(store, 1, fut("a", "2026-10-20"), fut("b", "2026-10-21"));
    const day1 = await makeTodayPort(store, d).listTodaySongs();
    const day2 = await makeTodayPort(store, { ...d, today: () => "2026-10-24" }).listTodaySongs();
    expect(day2.songs.map((s) => s.id)).toEqual(day1.songs.map((s) => s.id));
  });
  it("rates via the validator, returns the exact previous record, and restore round-trips", async () => {
    const { store, port } = mkSongs();
    await put(store, 3, fut("a", "2026-10-20"));
    const before = (await store.getSong("a"))!;
    const snap = await port.rateTodaySong("a", "solid");
    expect(snap).toEqual(before);
    const after = (await store.getSong("a"))!;
    expect(after.lastReviewed).toBe(DAY);
    expect(after.dueDate > DAY).toBe(true);
    expect((await port.listTodaySongs()).songs).toEqual([{ id: "a", title: "Etude", ratedToday: true }]);
    await port.restoreTodaySong(snap);
    expect(await store.getSong("a")).toEqual(before);
    await expect(port.rateTodaySong("nope", "ok")).rejects.toThrow("Song not found");
  });
  it("a second rating of the same song rejects and leaves the record unchanged", async () => {
    const { store, port } = mkSongs();
    await put(store, 3, fut("a", "2026-10-20"));
    await port.rateTodaySong("a", "ok");
    const rated = (await store.getSong("a"))!;
    await expect(port.rateTodaySong("a", "rough")).rejects.toThrow();
    expect(await store.getSong("a")).toEqual(rated);
  });
  it("lowering songsPerDay below the rated count keeps all rated rows", async () => {
    const { store, port } = mkSongs();
    await put(store, 3, fut("a", "2026-10-20"), fut("b", "2026-10-20"), fut("c", "2026-10-20"), fut("e", "2026-10-20"));
    for (const id of ["a", "b", "c"]) await port.rateTodaySong(id, "ok");
    await store.putSettings({ ...settingsRec, songsPerDay: 1 });
    const r = await port.listTodaySongs();
    expect(r.songs.filter((s) => s.ratedToday)).toHaveLength(3);
    expect(r.songs).toHaveLength(3);
  });
  it("a rejecting putSong during top-up still returns the unmodified selection", async () => {
    const { store, d } = mkSongs();
    await put(store, 3, fut("a", "2026-10-20"), fut("b", "2026-10-26"));
    const failing = Object.create(store) as Store;
    failing.putSong = async () => {
      throw new Error("disk full");
    };
    const r = await makeTodayPort(failing, d).listTodaySongs();
    expect(r.songs.map((s) => s.id)).toEqual(["a"]);
    expect((await store.getSong("b"))!.dueDate).toBe("2026-10-26");
  });
  it("add-time rule: first songsPerDay adds to an empty repertoire are due today and fill the selection", async () => {
    const { store, port, d } = mkSongs();
    await store.putSettings({ ...settingsRec, songsPerDay: 2 });
    let k = 0;
    const repo = makeRepertoirePort(store, { ...d, newId: () => `n${++k}` });
    const res = await repo.addSongs(["A", "B", "C", "D"]);
    expect(res.added).toBe(4);
    const all = await store.listSongs();
    expect(all.filter((s) => s.dueDate === DAY).map((s) => s.title).sort()).toEqual(["A", "B"]);
    expect(all.filter((s) => s.title === "C" || s.title === "D").every((s) => s.dueDate > DAY)).toBe(true);
    expect((await port.listTodaySongs()).songs.map((s) => s.title).sort()).toEqual(["A", "B"]);
  });
  it("case A: B added while the selection is still empty (before Today opens) has offset >= 1 and competes by due date", async () => {
    const { store, port, repo } = mkSongs();
    await put(store, 1, fut("a", "2026-10-26"));
    await repo.addSong("B");
    const b = (await store.listSongs()).find((s) => s.title === "B")!;
    expect(b.dueDate > DAY).toBe(true);
    const soonest = [await store.getSong("a"), b].sort((x, y) => (x!.dueDate < y!.dueDate ? -1 : 1))[0]!;
    const r = await port.listTodaySongs();
    expect(r.songs.map((s) => s.id)).toEqual([soonest.id]);
  });
  it("case B: A topped up first, then B added: B is not shown that day", async () => {
    const { store, port, repo } = mkSongs();
    await put(store, 1, fut("a", "2026-10-26"));
    expect((await port.listTodaySongs()).songs.map((s) => s.id)).toEqual(["a"]);
    await repo.addSong("B");
    expect((await port.listTodaySongs()).songs.map((s) => s.id)).toEqual(["a"]);
  });
  it("first day: one-at-a-time adds fill up to songsPerDay, including after Today was listed", async () => {
    const { store, d } = mkSongs();
    await store.putSettings({ ...settingsRec, songsPerDay: 2 });
    let k = 0;
    const dd = { ...d, newId: () => `n${++k}` };
    const repo = makeRepertoirePort(store, dd);
    const port = makeTodayPort(store, dd);
    await repo.addSong("A");
    expect((await port.listTodaySongs()).songs.map((s) => s.title)).toEqual(["A"]);
    await repo.addSong("B");
    expect((await port.listTodaySongs()).songs.map((s) => s.title).sort()).toEqual(["A", "B"]);
    await repo.addSong("C");
    expect((await port.listTodaySongs()).songs.map((s) => s.title).sort()).toEqual(["A", "B"]);
  });
  it("later day: a song added after the selection is non-empty is not shown that day", async () => {
    const { store, port, repo } = mkSongs();
    await store.putSettings({ ...settingsRec, songsPerDay: 2 });
    await put(store, 2, fut("a", "2026-10-26"));
    expect((await port.listTodaySongs()).songs.map((s) => s.id)).toEqual(["a"]);
    await repo.addSong("B");
    expect((await port.listTodaySongs()).songs.map((s) => s.id)).toEqual(["a"]);
  });

  describe("top-up from both tabs (t016)", () => {
    const seedFour = async (store: Store) => {
      await put(store, 3, fut("a", DAY), fut("b", "2026-10-25"), fut("c", "2026-10-26"), fut("d", "2026-10-28"));
    };
    const dues = async (store: Store) => (await store.listSongs()).map((s) => [s.id, s.dueDate]).sort();
    it("Repertoire then Today and Today then Repertoire match Today alone", async () => {
      const alone = mkSongs();
      await seedFour(alone.store);
      const base = await alone.port.listTodaySongs();
      const baseDues = await dues(alone.store);

      const A = mkSongs();
      await seedFour(A.store);
      await A.repo.listSongs();
      expect(await A.port.listTodaySongs()).toEqual(base);
      expect(await dues(A.store)).toEqual(baseDues);

      const B = mkSongs();
      await seedFour(B.store);
      expect(await B.port.listTodaySongs()).toEqual(base);
      await B.repo.listSongs();
      expect(await dues(B.store)).toEqual(baseDues);
    });
    it("Today second call makes no writes", async () => {
      const { store, d } = mkSongs();
      await seedFour(store);
      await makeTodayPort(store, d).listTodaySongs();
      let puts = 0;
      const spy = { ...store, getSettings: () => store.getSettings(), listSongs: () => store.listSongs(), getSong: (id: string) => store.getSong(id), putSong: async (s: ReturnType<typeof song>) => { puts++; return store.putSong(s); } };
      await makeTodayPort(spy as unknown as Store, d).listTodaySongs();
      expect(puts).toBe(0);
    });
  });
});
