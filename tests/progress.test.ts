import { describe, expect, it } from "vitest";
import { dayProgress, type ProgressInput } from "../src/today/progress";

const now = new Date(2026, 9, 23, 12); // Friday
const today = "2026-10-23";
const task = (done: boolean, days: "daily" | number[] = "daily") => ({ days, lastCompletedOn: done ? today : null });
const song = (ratedToday: boolean) => ({ ratedToday });
const base: ProgressInput = { tasks: [], songs: [], songsPerDay: 2, songsLoaded: true, now, today };
const run = (p: Partial<ProgressInput>) => dayProgress({ ...base, ...p });

describe("dayProgress", () => {
  it("nothing due is rest with no bloom", () => {
    expect(run({})).toEqual({ done: 0, total: 0, fraction: 0, state: "rest" });
    expect(run({ songsPerDay: 0, songs: [song(false)] }).state).toBe("rest");
    expect(run({ tasks: [task(false, [1])] }).state).toBe("rest"); // not due on a Friday
  });
  it("partial counts tasks and songs equally", () => {
    const p = run({ tasks: [task(true), task(false)], songs: [song(true), song(false)] });
    expect(p).toEqual({ done: 2, total: 4, fraction: 0.5, state: "partial" });
  });
  it("tasks finished today count in both done and total", () => {
    expect(run({ tasks: [task(true)], songsPerDay: 0 })).toEqual({ done: 1, total: 1, fraction: 1, state: "done" });
  });
  it("day done needs every task and every song", () => {
    expect(run({ tasks: [task(true)], songs: [song(true), song(true)] }).state).toBe("done");
    expect(run({ tasks: [task(true)], songs: [song(true), song(false)] }).state).toBe("partial");
    expect(run({ tasks: [task(false)], songs: [song(true)] }).state).toBe("partial");
  });
  it("an empty songs section counts as complete", () => {
    expect(run({ tasks: [task(true)], songs: [] }).state).toBe("done");
  });
  it("a hidden songs section (songsPerDay 0) counts as complete", () => {
    expect(run({ tasks: [task(true)], songs: [song(false)], songsPerDay: 0 }).state).toBe("done");
  });
  it("only songs, all rated, is done", () => {
    expect(run({ songs: [song(true)] })).toEqual({ done: 1, total: 1, fraction: 1, state: "done" });
  });
  it("is capped at partial until songs have loaded", () => {
    expect(run({ tasks: [task(true)], songsLoaded: false }).state).toBe("partial");
    expect(run({ tasks: [task(true)], songsLoaded: true }).state).toBe("done");
    expect(run({ songsLoaded: false }).state).toBe("rest");
  });
  it("undoing the last item leaves done", () => {
    const tasks = [task(true), task(true)];
    expect(run({ tasks }).state).toBe("done");
    tasks[1]!.lastCompletedOn = null;
    expect(run({ tasks }).state).toBe("partial");
    const songs = [song(true)];
    expect(run({ songs }).state).toBe("done");
    songs[0]!.ratedToday = false;
    expect(run({ songs }).state).toBe("partial");
  });
});
