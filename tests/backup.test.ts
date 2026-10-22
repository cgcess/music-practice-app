import "fake-indexeddb/auto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store, backupFileName } from "../src/data/store";
import { schemaVersion, ValidationError } from "../src/data/schema";
import { todayLocal } from "../src/dates";
import { settings, song, task } from "./helpers";

let s: Store;
let n = 0;
beforeEach(() => { s = new Store(`test-backup-${n++}`); });
afterEach(async () => { await s.close(); });

async function seed() {
  await s.putTask(task());
  await s.putTask(task({ id: "t-2", days: [1, 2] }));
  await s.putSong(song());
  await s.putSettings(settings());
}

describe("backup", () => {
  it("has the documented envelope", async () => {
    const b = await s.exportBackup();
    expect(b).toMatchObject({ app: "music-practice", schemaVersion });
    expect(typeof b.appVersion).toBe("string");
    expect(b.exportedAt).toMatch(/Z$/);
  });
  it("file name helper", () => {
    expect(backupFileName("2026-10-22")).toBe("music-practice-backup-2026-10-22.json");
  });
  it("export -> import round trip is identical", async () => {
    await seed();
    const a = await s.exportBackup();
    const s2 = new Store(`test-backup-other-${n++}`);
    await s2.importBackup(JSON.stringify(a));
    const b = await s2.exportBackup();
    expect(b.data).toEqual(a.data);
    await s2.close();
  });
  it("e2e: writes a backup file to tmpdir and re-imports it", async () => {
    await seed();
    const before = (await s.exportBackup()).data;
    const file = join(mkdtempSync(join(tmpdir(), "mp-")), backupFileName(todayLocal()));
    writeFileSync(file, JSON.stringify(await s.exportBackup()));
    expect(JSON.parse(readFileSync(file, "utf8")).app).toBe("music-practice");
    await s.deleteTask("t-1");
    await s.importBackup(readFileSync(file, "utf8"));
    expect((await s.exportBackup()).data).toEqual(before);
  });

  describe("invalid imports throw and leave data unchanged", () => {
    const good = () => JSON.parse(JSON.stringify({ app: "music-practice", schemaVersion, exportedAt: "x", appVersion: "dev", data: { tasks: [task({ id: "new" })], songs: [], settings: null } }));
    const cases: [string, () => string][] = [
      ["bad JSON", () => "{nope"],
      ["wrong app", () => JSON.stringify({ ...good(), app: "other" })],
      ["newer schemaVersion", () => JSON.stringify({ ...good(), schemaVersion: schemaVersion + 1 })],
      ["bad record", () => { const g = good(); g.data.tasks[0].minutes = 0; return JSON.stringify(g); }],
      ["unknown field", () => { const g = good(); g.data.songs = [{ ...song(), extra: 1 }]; return JSON.stringify(g); }],
      ["unknown data key", () => { const g = good(); g.data.logs = []; return JSON.stringify(g); }],
    ];
    it.each(cases)("%s", async (_n, mk) => {
      await seed();
      const before = await s.exportBackup();
      await expect(s.importBackup(mk())).rejects.toThrow(ValidationError);
      expect((await s.exportBackup()).data).toEqual(before.data);
    });
  });
});
