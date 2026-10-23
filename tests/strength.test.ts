import { describe, expect, it } from "vitest";
import { strengthCounts } from "../src/sr/strength";
import { round2 } from "../src/sr/scheduler";

const rev = (ease: number) => ({ ease, lastReviewed: "2026-10-01" });
const one = (ease: number) => strengthCounts([rev(ease)]);

describe("strengthCounts", () => {
  it("returns zeros for an empty list", () => {
    expect(strengthCounts([])).toEqual({ well: 0, okay: 0, poorly: 0, fresh: 0 });
  });
  it("buckets on the boundaries", () => {
    expect(one(2.4)).toEqual({ well: 0, okay: 1, poorly: 0, fresh: 0 });
    expect(one(2.39)).toEqual({ well: 0, okay: 0, poorly: 1, fresh: 0 });
    expect(one(2.6)).toEqual({ well: 1, okay: 0, poorly: 0, fresh: 0 });
    expect(one(2.59)).toEqual({ well: 0, okay: 1, poorly: 0, fresh: 0 });
  });
  it("treats the 2.5 start value as okay", () => {
    expect(one(2.5).okay).toBe(1);
  });
  it("counts unrated songs as new whatever their ease", () => {
    const r = strengthCounts([
      { ease: 3.0, lastReviewed: null },
      { ease: 1.3, lastReviewed: null },
    ]);
    expect(r).toEqual({ well: 0, okay: 0, poorly: 0, fresh: 2 });
  });
  it("rounds float drift before comparing (direct callers)", () => {
    const up = 2.5 + 0.15 + 0.15 - 0.2;
    expect(up).not.toBe(2.6);
    expect(round2(up)).toBe(2.6);
    expect(one(up).well).toBe(1);
    const low = 2.5 + 0.15 - 0.2 - 0.2 + 0.15;
    expect(low).not.toBe(2.4);
    expect(round2(low)).toBe(2.4);
    expect(one(low).okay).toBe(1);
  });
  it("counts a mix", () => {
    const r = strengthCounts([rev(2.8), rev(2.5), rev(2.0), { ease: 2.5, lastReviewed: null }, rev(3)]);
    expect(r).toEqual({ well: 2, okay: 1, poorly: 1, fresh: 1 });
  });
});
