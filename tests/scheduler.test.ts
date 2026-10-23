import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { addDays, diffDays } from "../src/dates";
import { validateSong } from "../src/data/schema";
import { fnv1a32, rand01 } from "../src/sr/hash";
import { dailySelection, newSong, pickOrder, rateSong, type Rating } from "../src/sr/scheduler";
import { song } from "./helpers";

const sr = config.sr;
const TODAY = "2026-10-23";
const RATINGS: Rating[] = ["rough", "ok", "solid"];
const mk = (o: { ease?: number; intervalDays?: number; late?: number; id?: string } = {}) => {
  const interval = o.intervalDays ?? 5;
  const last = addDays(TODAY, -(interval + (o.late ?? 0)));
  return song({ id: o.id ?? "s-1", ease: o.ease ?? 2.5, intervalDays: interval, lastReviewed: last, dueDate: addDays(last, interval) });
};

describe("hash", () => {
  it("is FNV-1a 32 (known vectors) and deterministic", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
    expect(rand01("x")).toBe(rand01("x"));
    expect(rand01("x")).toBeGreaterThanOrEqual(0);
    expect(rand01("x")).toBeLessThan(1);
  });
});

describe("rateSong", () => {
  it("is deterministic", () => {
    const s = mk();
    for (const r of RATINGS) expect(rateSong(s, r, TODAY)).toEqual(rateSong(s, r, TODAY));
  });

  it("monotone: rough <= ok <= solid interval; ease down/same/up, over a grid", () => {
    for (const ease of [1.3, 1.5, 2.0, 2.5, 2.9, 3.0]) {
      for (const intervalDays of [1, 2, 3, 4, 5, 6, 7, 10, 30, 200, 365]) {
        for (const late of [0, 1, 3, 20]) {
          for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
            const s = mk({ ease, intervalDays, late, id });
            const [r, o, so] = RATINGS.map((x) => rateSong(s, x, TODAY));
            expect(r!.intervalDays).toBeLessThanOrEqual(o!.intervalDays);
            expect(o!.intervalDays).toBeLessThanOrEqual(so!.intervalDays);
            expect(r!.ease).toBeLessThanOrEqual(s.ease);
            expect(o!.ease).toBe(s.ease);
            expect(so!.ease).toBeGreaterThanOrEqual(s.ease);
          }
        }
      }
    }
  });

  it("threshold cases: intervalDays 5, 6, 7 around the 3-day fuzz threshold", () => {
    // rough base = 2.5 -> 3 (fuzzed), 3 (fuzzed), 3.5 -> 4 (fuzzed)
    for (const [intervalDays, base] of [[5, 3], [6, 3], [7, 4]] as const) {
      for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
        const s = mk({ intervalDays, id });
        const r = rateSong(s, "rough", TODAY).intervalDays;
        const o = rateSong(s, "ok", TODAY).intervalDays;
        const f = 1 + (2 * rand01(`${id}|${TODAY}`) - 1) * sr.fuzzPct;
        expect(r).toBe(Math.round(base * f));
        expect(r).toBeLessThanOrEqual(o);
      }
    }
  });

  it("pins ok and solid to the pre-rating ease (fuzz factor computed from rand01)", () => {
    const s = mk({ ease: 2.5, intervalDays: 10, late: 0, id: "pin" });
    const f = 1 + (2 * rand01(`pin|${TODAY}`) - 1) * sr.fuzzPct;
    expect(rateSong(s, "ok", TODAY).intervalDays).toBe(Math.round(Math.round(10 * 2.5) * f));
    const solid = rateSong(s, "solid", TODAY);
    expect(solid.intervalDays).toBe(Math.round(Math.round(10 * 2.5 * 1.3) * f)); // 33 base, old ease 2.5, not 2.65
    expect(solid.ease).toBe(2.65);
    expect(rateSong(s, "rough", TODAY).ease).toBe(2.3);
  });

  it("lateness: ok and solid grow from the actual gap, rough halves the scheduled interval", () => {
    const s = mk({ intervalDays: 10, late: 10, id: "late" }); // gap 20
    const f = 1 + (2 * rand01(`late|${TODAY}`) - 1) * sr.fuzzPct;
    expect(rateSong(s, "ok", TODAY).intervalDays).toBe(Math.round(50 * f));
    expect(rateSong(s, "solid", TODAY).intervalDays).toBe(Math.round(Math.round(20 * 2.5 * 1.3) * f));
    expect(rateSong(s, "rough", TODAY).intervalDays).toBe(Math.round(5 * f));
  });

  it("never-rated song uses max(intervalDays, days since createdAt)", () => {
    const base = song({ id: "nr", ease: 2.0, intervalDays: 1, lastReviewed: null, dueDate: "2026-10-15", createdAt: "2026-10-13T09:00:00-04:00" });
    const f = 1 + (2 * rand01(`nr|${TODAY}`) - 1) * sr.fuzzPct;
    expect(diffDays(TODAY, "2026-10-13")).toBe(10);
    expect(rateSong(base, "ok", TODAY).intervalDays).toBe(Math.round(20 * f));
    // createdAt later than today: gap clamps to 0, so intervalDays wins
    const future = { ...base, intervalDays: 4, createdAt: "2026-11-01T09:00:00-04:00" };
    expect(rateSong(future, "ok", TODAY).intervalDays).toBe(Math.round(8 * (1 + (2 * rand01(`nr|${TODAY}`) - 1) * sr.fuzzPct)));
  });

  it("gap is DST safe (spans the Nov 1 2026 fall-back)", () => {
    const s = song({ id: "dst", ease: 2.0, intervalDays: 1, lastReviewed: "2026-10-25", dueDate: "2026-10-26" });
    const today = "2026-11-05";
    const f = 1 + (2 * rand01(`dst|${today}`) - 1) * sr.fuzzPct;
    expect(rateSong(s, "ok", today).intervalDays).toBe(Math.round(22 * f)); // gap 11 days across DST * ease 2.0
  });

  it("clamps interval to 1..365 and ease to 1.3..3.0", () => {
    const tiny = mk({ intervalDays: 1, ease: 1.3 });
    expect(rateSong(tiny, "rough", TODAY).intervalDays).toBe(1);
    expect(rateSong(tiny, "rough", TODAY).ease).toBe(1.3);
    const huge = mk({ intervalDays: 365, ease: 3.0, late: 100 });
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const r = rateSong({ ...huge, id }, "solid", TODAY);
      expect(r.intervalDays).toBe(365);
      expect(r.ease).toBe(3.0);
    }
  });

  it("fuzz bounds: within 10% (+0.5 rounding) for raw >= 3; exact rounded raw below", () => {
    for (let i = 0; i < 300; i++) {
      for (const [intervalDays, ease] of [[1, 2.5], [2, 1.3], [3, 2.0], [10, 2.5], [50, 1.7]] as const) {
        const s = mk({ intervalDays, ease, id: `id-${i}` });
        const raw = intervalDays * ease;
        const got = rateSong(s, "ok", TODAY).intervalDays;
        if (Math.round(raw) < sr.fuzzMinIntervalDays) expect(got).toBe(Math.max(1, Math.round(raw)));
        else expect(Math.abs(got - raw)).toBeLessThanOrEqual(sr.fuzzPct * raw + 0.5);
      }
    }
  });

  it("sets lastReviewed=today, dueDate=today+interval, and validates", () => {
    for (const r of RATINGS) {
      for (let i = 0; i < 50; i++) {
        const out = rateSong(mk({ id: `v-${i}`, late: i % 7 }), r, TODAY);
        expect(out.lastReviewed).toBe(TODAY);
        expect(out.dueDate).toBe(addDays(TODAY, out.intervalDays));
        expect(out.dueDate >= out.lastReviewed!).toBe(true);
        expect(() => validateSong(out)).not.toThrow();
      }
    }
  });
});

describe("newSong", () => {
  it("starts at initial ease/interval, never reviewed, due within 0..7 days, all offsets seen", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const s = newSong({ id: `n-${i}`, title: "T", createdAt: "2026-10-23T09:00:00-04:00" }, TODAY);
      expect(s.ease).toBe(sr.easeInitial);
      expect(s.intervalDays).toBe(sr.initialIntervalDays);
      expect(s.lastReviewed).toBeNull();
      const off = diffDays(s.dueDate, TODAY);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThanOrEqual(7);
      seen.add(off);
      expect(() => validateSong(s)).not.toThrow();
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("is deterministic", () => {
    const a = newSong({ id: "x", title: "T", createdAt: "2026-10-23T09:00:00-04:00" }, TODAY);
    expect(newSong({ id: "x", title: "T", createdAt: "2026-10-23T09:00:00-04:00" }, TODAY)).toEqual(a);
  });
});

describe("pickOrder and dailySelection", () => {
  const due = (id: string, dueDate: string, extra = {}) => song({ id, dueDate, lastReviewed: null, ...extra });
  it("oldest due first, excludes future, same order on two days for equal due dates", () => {
    const songs = [due("c", "2026-10-20"), due("a", "2026-10-22"), due("b", "2026-10-20"), due("z", "2026-10-24"), due("d", "2026-10-22")];
    const ids = (t: string) => pickOrder(songs, t).map((s) => s.id);
    const day1 = ids(TODAY);
    expect(day1).not.toContain("z");
    expect(day1.slice(0, 2).sort()).toEqual(["b", "c"]);
    expect(day1.slice(2).sort()).toEqual(["a", "d"]);
    const day2 = ids("2026-10-24").filter((x) => x !== "z");
    expect(day2).toEqual(day1);
    expect(pickOrder([...songs].reverse(), TODAY).map((s) => s.id)).toEqual(day1);
  });
  it("caps at songsPerDay, 0 gives empty", () => {
    const songs = ["a", "b", "c", "d", "e"].map((id) => due(id, "2026-10-20"));
    expect(dailySelection(songs, TODAY, 3)).toHaveLength(3);
    expect(dailySelection(songs, TODAY, 0)).toEqual([]);
    expect(dailySelection(songs, TODAY, 99)).toHaveLength(5);
  });
  it("no refill after rating: rated songs stay and count toward the cap", () => {
    const songs = ["a", "b", "c", "d", "e"].map((id) => due(id, "2026-10-20"));
    const sel = dailySelection(songs, TODAY, 3);
    const rated = songs.map((s) => (s.id === sel[0]!.id ? rateSong(s, "ok", TODAY) : s));
    const after = dailySelection(rated, TODAY, 3);
    expect(after.map((s) => s.id).sort()).toEqual(sel.map((s) => s.id).sort());
    expect(after).toHaveLength(3);
  });
  it("a shown but unrated song is still shown the next day", () => {
    const songs = ["a", "b", "c", "d", "e"].map((id) => due(id, "2026-10-20"));
    const day1 = dailySelection(songs, TODAY, 2).map((s) => s.id);
    const rated = songs.map((s) => (s.id === day1[0] ? rateSong(s, "solid", TODAY) : s));
    const day2 = dailySelection(rated, "2026-10-24", 2).map((s) => s.id);
    expect(day2).toContain(day1[1]);
  });
  it("lowering songsPerDay drops from the end only", () => {
    const songs = ["a", "b", "c", "d"].map((id) => due(id, "2026-10-20"));
    expect(dailySelection(songs, TODAY, 3).slice(0, 2)).toEqual(dailySelection(songs, TODAY, 2));
  });
});
