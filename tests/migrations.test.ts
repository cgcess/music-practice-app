import { describe, expect, it } from "vitest";
import { migrate } from "../src/data/migrate";
import { migrations } from "../src/data/migrations";

describe("migrate", () => {
  it("real list is empty at v1 and is a no-op", () => {
    expect(migrations).toHaveLength(0);
    const d = { tasks: [] };
    expect(migrate(d, 1)).toBe(d);
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
    expect(() => migrate({}, 2)).toThrow(/newer/);
    expect(() => migrate({}, 0)).toThrow(/invalid/);
  });
});
