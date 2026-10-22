import { describe, expect, it } from "vitest";
import { isDoneToday, isDueToday } from "../src/today/due";

// 2026-10-18 is a Sunday.
const dayOf = (n: number) => new Date(2026, 9, 18 + n, 12);

describe("isDueToday", () => {
  for (let wd = 0; wd < 7; wd++) {
    it(`weekday ${wd}`, () => {
      expect(isDueToday({ days: [wd] }, dayOf(wd))).toBe(true);
      expect(isDueToday({ days: [(wd + 1) % 7] }, dayOf(wd))).toBe(false);
      expect(isDueToday({ days: "daily" }, dayOf(wd))).toBe(true);
    });
  }
  it("matches any listed weekday", () => {
    expect(isDueToday({ days: [1, 3, 5] }, dayOf(3))).toBe(true);
    expect(isDueToday({ days: [1, 3, 5] }, dayOf(2))).toBe(false);
  });
});

describe("isDoneToday", () => {
  it("is true only for today's date", () => {
    expect(isDoneToday({ lastCompletedOn: "2026-10-22" }, "2026-10-22")).toBe(true);
    expect(isDoneToday({ lastCompletedOn: "2026-10-21" }, "2026-10-22")).toBe(false);
    expect(isDoneToday({ lastCompletedOn: null }, "2026-10-22")).toBe(false);
  });
});
