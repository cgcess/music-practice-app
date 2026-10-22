import { describe, expect, it } from "vitest";
import { formatDate, formatSummary, summarize } from "../src/today/summary";

const T = "2026-10-22";
const t = (minutes: number, last: string | null = null) => ({ minutes, lastCompletedOn: last });

describe("summary", () => {
  it("counts done of due and minutes over undone tasks only", () => {
    const s = summarize([t(10), t(5, T), t(15, "2026-10-21"), t(20, T)], T);
    expect(s).toEqual({ done: 2, due: 4, minutesLeft: 25 });
    expect(formatSummary(s)).toBe("2 of 4 · 25 min left");
  });
  it("handles empty and all done", () => {
    expect(summarize([], T)).toEqual({ done: 0, due: 0, minutesLeft: 0 });
    expect(formatSummary(summarize([], T))).toBe("Nothing due today");
    expect(formatSummary(summarize([t(5, T)], T))).toBe("1 of 1 · all done");
  });
  it("formats the date for a fixed locale", () => {
    expect(formatDate(new Date(2026, 9, 22, 12), "en-GB")).toBe("Thursday 22 Oct");
  });
});
