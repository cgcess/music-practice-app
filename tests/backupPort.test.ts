import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeBackupPort } from "../src/app/backupPort";
import { Store } from "../src/data/store";
import { schemaVersion } from "../src/data/schema";
import { settings, song, task } from "./helpers";

let s: Store;
let t: Store;
let n = 0;
beforeEach(() => {
  s = new Store(`test-bport-a-${n++}`);
  t = new Store(`test-bport-b-${n++}`);
});
afterEach(async () => {
  await s.close();
  await t.close();
});

const port = () => makeBackupPort(s, { today: () => "2026-11-05" });
async function seed(st: Store) {
  await st.putTask(task());
  await st.putTask(task({ id: "t-2", days: [1, 2] }));
  await st.putSong(song());
  await st.putSettings(settings());
}
const env = (data: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({ app: "music-practice", schemaVersion, exportedAt: "x", appVersion: "dev", data, ...over });

describe("backupPort", () => {
  it("prepareExport gives counts, file name and parseable text", async () => {
    await seed(s);
    const r = await port().prepareExport();
    expect(r.fileName).toBe("music-practice-backup-2026-11-05.json");
    expect(r.tasks).toBe(2);
    expect(r.songs).toBe(1);
    expect(JSON.parse(r.text).data.tasks).toHaveLength(2);
  });
  it("round-trips into a fresh store", async () => {
    await seed(s);
    const r = await port().prepareExport();
    await makeBackupPort(t).importBackup(r.text);
    expect(await t.listTasks()).toEqual(await s.listTasks());
    expect(await t.listSongs()).toEqual(await s.listSongs());
    expect(await t.getSettings()).toEqual(await s.getSettings());
  });
  it("inspect reports counts and settings presence and writes nothing", async () => {
    await seed(s);
    const text = (await port().prepareExport()).text;
    const p = makeBackupPort(t);
    expect(await p.inspect(text)).toEqual({ tasks: 2, songs: 1, hasSettings: true });
    expect(await p.current()).toEqual({ tasks: 0, songs: 0 });
    expect(await p.inspect(env({ tasks: [], songs: [], settings: null }))).toEqual({ tasks: 0, songs: 0, hasSettings: false });
  });
  const bad: [string, string, string][] = [
    ["not JSON", "nope{", "The file is not valid JSON"],
    ["array", "[]", "This is not a backup from this app"],
    ["wrong app", JSON.stringify({ app: "other", schemaVersion: 1, data: {} }), "This is not a backup from this app"],
    ["newer schema", env({ tasks: [], songs: [], settings: null }, { schemaVersion: schemaVersion + 5 }), "This backup is from a newer version of the app; update the app first"],
    ["invalid record", env({ tasks: [{ id: "x" }], songs: [], settings: null }), "The backup file has invalid data ("],
    ["bad data shape", env(5), "The backup file has invalid data (backup.data: expected object)"],
  ];
  for (const [name, text, msg] of bad) {
    it(`rejects ${name} with a friendly message and leaves data unchanged`, async () => {
      await seed(t);
      const p = makeBackupPort(t);
      for (const fn of [() => p.inspect(text), () => p.importBackup(text)]) {
        const err = await fn().then(() => null, (e: Error) => e);
        expect(err?.message.startsWith(msg)).toBe(true);
      }
      expect(await p.current()).toEqual({ tasks: 2, songs: 1 });
    });
  }
});
