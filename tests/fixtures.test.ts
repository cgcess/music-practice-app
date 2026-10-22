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
    expect(out.data).toEqual(JSON.parse(text).data);
    await s.close();
  });
});
