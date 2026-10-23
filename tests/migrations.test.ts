import { describe, expect, it } from "vitest";
import { migrate } from "../src/data/migrate";
import { migrations } from "../src/data/migrations";
import { schemaVersion } from "../src/data/schema";

describe("migrate", () => {
  it("real list has one entry and matches schemaVersion", () => {
    expect(migrations).toHaveLength(1);
    expect(migrations.length + 1).toBe(schemaVersion);
  });
  it("v1 -> v2 adds metronomeBpm 100 to settings and keeps the rest", () => {
    const settings = { songsPerDay: 3, suggestionPeriod: "daily", timerSound: true, timerVibrate: true, timerOvertime: false };
    const d = { tasks: [], songs: [], settings };
    expect(migrate(d, 1)).toEqual({ tasks: [], songs: [], settings: { ...settings, metronomeBpm: 100 } });
    expect(settings).not.toHaveProperty("metronomeBpm");
  });
  it("v1 -> v2 leaves null settings alone", () => {
    const d = { tasks: [], songs: [], settings: null };
    expect(migrate(d, 1)).toEqual(d);
  });
  it("v2 data is a no-op", () => {
    const d = { tasks: [] };
    expect(migrate(d, 2)).toBe(d);
  });
  it("applies injected migrations in order v1 -> v3", () => {
    const fakes = [
      (d: unknown) => ({ ...(d as object), a: 1 }),
      (d: unknown) => ({ ...(d as object), b: (d as { a: number }).a + 1 }),
    ];
    expect(migrate({}, 1, fakes)).toEqual({ a: 1, b: 2 });
    expect(migrate({ a: 5 }, 2, fakes)).toEqual({ a: 5, b: 6 });
  });
  it("rejects newer or invalid versions", () => {
    expect(() => migrate({}, 3)).toThrow(/newer/);
    expect(() => migrate({}, 0)).toThrow(/invalid/);
  });
});
