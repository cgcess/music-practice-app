import "fake-indexeddb/auto";
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeRepertoirePort } from "../src/app/repertoirePort";
import { config, getEffectiveConfig } from "../src/config";
import { Store } from "../src/data/store";
import { song } from "./helpers";

let n = 0;
const deps = () => {
  let ids = 0;
  return { newId: () => `id-${++ids}`, nowIso: () => "2026-10-23T12:00:00+00:00", getEffectiveConfig, today: () => "2026-10-23" };
};
const setup = () => {
  const store = new Store(`repport-${++n}-${Math.random()}`);
  return { store, port: makeRepertoirePort(store, deps()) };
};

describe("repertoirePort", () => {
  it("adds a trimmed song with new-song scheduling", async () => {
    const { port, store } = setup();
    await port.addSong("  Autumn Leaves  ");
    const [s] = await store.listSongs();
    expect(s).toMatchObject({ id: "id-1", title: "Autumn Leaves", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "2026-10-23T12:00:00+00:00" });
    expect(s!.dueDate >= "2026-10-23" && s!.dueDate <= "2026-10-30").toBe(true);
    await expect(port.addSong("   ")).rejects.toThrow();
  });

  it("bulk add: blanks, existing in other case, in-list duplicate give exact counts", async () => {
    const { port } = setup();
    await port.addSong("Blue Bossa");
    const res = await port.addSongs(["  Satin Doll ", "", "   ", "blue bossa", "Satin DOLL", "Misty", "Misty "]);
    expect(res).toEqual({ added: 2, skipped: 3 });
    expect((await port.listSongs()).map((s) => s.title).sort()).toEqual(["Blue Bossa", "Misty", "Satin Doll"]);
  });

  it("renames, and rejects blank or unknown", async () => {
    const { port } = setup();
    await port.addSong("Old");
    await port.renameSong("id-1", " New ");
    expect((await port.listSongs())[0]!.title).toBe("New");
    await expect(port.renameSong("id-1", " ")).rejects.toThrow();
    await expect(port.renameSong("nope", "x")).rejects.toThrow("Song not found");
  });

  it("delete returns the exact record and restore puts it back", async () => {
    const { port, store } = setup();
    await port.addSong("Keep");
    const before = (await store.getSong("id-1"))!;
    const snap = await port.deleteSong("id-1");
    expect(snap).toEqual(before);
    expect(await store.listSongs()).toEqual([]);
    await port.restoreSong(snap);
    expect(await store.getSong("id-1")).toEqual(before);
    await expect(port.deleteSong("nope")).rejects.toThrow("Song not found");
  });

  it("lists by dueDate, then title case-insensitive, then id", async () => {
    const { port, store } = setup();
    await store.putSong(song({ id: "3", title: "banana", dueDate: "2026-10-25", lastReviewed: null }));
    await store.putSong(song({ id: "2", title: "Cherry", dueDate: "2026-10-24", lastReviewed: null }));
    await store.putSong(song({ id: "1", title: "apple", dueDate: "2026-10-25", lastReviewed: null }));
    await store.putSong(song({ id: "4", title: "Apple", dueDate: "2026-10-25", lastReviewed: null }));
    expect((await port.listSongs()).map((s) => s.id)).toEqual(["2", "1", "4", "3"]);
  });

  describe("songsPerDay", () => {
    it("falls back to the config default with no Settings record", async () => {
      const { port } = setup();
      expect(await port.getSongsPerDay()).toBe(config.songsPerDay);
    });
    it("rounds, clamps, rejects non-finite", async () => {
      const { port, store } = setup();
      await port.setSongsPerDay(3.6);
      expect(await port.getSongsPerDay()).toBe(4);
      await port.setSongsPerDay(99);
      expect(await port.getSongsPerDay()).toBe(config.maxSongsPerDay);
      await port.setSongsPerDay(-1);
      expect(await port.getSongsPerDay()).toBe(0);
      await expect(port.setSongsPerDay(NaN)).rejects.toBeInstanceOf(RangeError);
      await expect(port.setSongsPerDay(Infinity)).rejects.toBeInstanceOf(RangeError);
      expect((await store.getSettings())!.songsPerDay).toBe(0);
    });
    it("keeps other settings and persists across a second port on the same store", async () => {
      const { port, store } = setup();
      await store.putSettings({ songsPerDay: 3, suggestionPeriod: "weekly", timerSound: false, timerVibrate: true, timerOvertime: false, metronomeBpm: 80 });
      await port.setSongsPerDay(7);
      expect(await makeRepertoirePort(store, deps()).getSongsPerDay()).toBe(7);
      expect(await store.getSettings()).toMatchObject({ suggestionPeriod: "weekly", timerSound: false, metronomeBpm: 80, songsPerDay: 7 });
    });
  });
});
