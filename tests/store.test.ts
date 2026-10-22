import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/data/store";
import { ValidationError } from "../src/data/schema";
import { settings, song, task } from "./helpers";

let s: Store;
let n = 0;
beforeEach(() => { s = new Store(`test-store-${n++}`); });
afterEach(async () => { await s.close(); });

describe("store", () => {
  it("round-trips a task", async () => {
    await s.putTask(task());
    expect(await s.getTask("t-1")).toEqual(task());
    expect(await s.listTasks()).toEqual([task()]);
    await s.deleteTask("t-1");
    expect(await s.getTask("t-1")).toBeUndefined();
  });
  it("round-trips a song", async () => {
    await s.putSong(song());
    expect(await s.getSong("s-1")).toEqual(song());
    await s.deleteSong("s-1");
    expect(await s.listSongs()).toEqual([]);
  });
  it("round-trips settings without a key field", async () => {
    expect(await s.getSettings()).toBeNull();
    await s.putSettings(settings());
    expect(await s.getSettings()).toEqual(settings());
    expect(Object.keys((await s.exportBackup()).data.settings!)).toEqual(Object.keys(settings()));
  });
  it("rejects invalid writes and stores nothing", async () => {
    await expect(s.putTask(task({ minutes: 0 }))).rejects.toThrow(ValidationError);
    await expect(s.putTask({ ...task(), extra: 1 })).rejects.toThrow(ValidationError);
    await expect(s.putSong(song({ title: "" }))).rejects.toThrow(ValidationError);
    await expect(s.putSettings({})).rejects.toThrow(ValidationError);
    expect(await s.listTasks()).toEqual([]);
    expect(await s.listSongs()).toEqual([]);
  });
});
