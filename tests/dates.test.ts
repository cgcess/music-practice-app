import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, diffDays, isLocalDate, nowIso, todayLocal } from "../src/dates";

describe("dates (TZ America/New_York)", () => {
  it("TZ pin is active (EDT offset is 240)", () => {
    expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).toBe(240);
  });
  it("local today is stable across DST boundaries", () => {
    expect(todayLocal(new Date(2026, 2, 8, 0, 30))).toBe("2026-03-08");
    expect(todayLocal(new Date(2026, 2, 8, 23, 59))).toBe("2026-03-08");
    expect(todayLocal(new Date(2026, 10, 1, 0, 30))).toBe("2026-11-01");
    expect(todayLocal(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01");
  });
  it("addDays crosses DST changes by calendar days", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2026-11-02", -2)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-03-09", "2026-03-07")).toBe(2);
    expect(diffDays("2026-11-02", "2026-10-31")).toBe(2);
  });
  it("dayOfWeek and validity", () => {
    expect(dayOfWeek("2026-10-22")).toBe(4);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
  });
  it("nowIso carries the offset", () => {
    expect(nowIso(new Date(2026, 2, 8, 12))).toBe("2026-03-08T12:00:00-04:00");
    expect(nowIso(new Date(2026, 0, 8, 12))).toBe("2026-01-08T12:00:00-05:00");
  });
});
