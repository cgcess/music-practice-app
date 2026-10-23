import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Store } from "../src/data/store";

const dir = join(__dirname, "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("fixtures", () => {
  it("has at least one v1 fixture", () => {
    expect(files.some((f) => f.startsWith("v1-"))).toBe(true);
  });
  it.each(files)("%s validates and migrates to current", async (f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const s = new Store(`fixture-${f}`);
    await s.importBackup(text);
    const out = await s.exportBackup();
    const expected = JSON.parse(text).data;
    // v1 fixtures predate metronomeBpm: the v1 -> v2 migration adds the literal default 100.
    if (f.startsWith("v1-") && expected.settings) expected.settings.metronomeBpm = 100;
    expect(out.data).toEqual(expected);
    await s.close();
  });
});
