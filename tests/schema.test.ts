import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import {
  schemaVersion, validateRecord, validateSettings, validateSong, validateTask, ValidationError, newId,
} from "../src/data/schema";
import { settings, song, task } from "./helpers";

describe("task", () => {
  it("accepts valid", () => {
    expect(validateTask(task())).toEqual(task());
    expect(validateTask(task({ days: [0, 6] })).days).toEqual([0, 6]);
  });
  it.each([0, 241, 1.5, "5", NaN])("rejects minutes %s", (m) => {
    expect(() => validateTask(task({ minutes: m as number }))).toThrow(ValidationError);
  });
  it("accepts minutes bounds", () => {
    validateTask(task({ minutes: 1 }));
    validateTask(task({ minutes: 240 }));
  });
  it.each([[[]], [[1, 1]], [[7]], [[-1]], [[1.5]], ["weekly"], [null]])("rejects days %j", (d) => {
    expect(() => validateTask(task({ days: d as never }))).toThrow(ValidationError);
  });
  it("rejects empty name, bad dates, missing and unknown fields", () => {
    expect(() => validateTask(task({ name: "" }))).toThrow(ValidationError);
    expect(() => validateTask(task({ lastCompletedOn: "2026-02-30" }))).toThrow(ValidationError);
    expect(() => validateTask(task({ createdAt: "2026-10-01" }))).toThrow(ValidationError);
    const { name: _n, ...rest } = task();
    expect(() => validateTask(rest)).toThrow(/missing/);
    expect(() => validateTask({ ...task(), extra: 1 })).toThrow(/unknown field/);
  });
});

describe("song", () => {
  it("accepts valid", () => {
    expect(validateSong(song())).toEqual(song());
    validateSong(song({ lastReviewed: null }));
    validateSong(song({ dueDate: "2026-10-22" }));
  });
  it("rejects empty title", () => expect(() => validateSong(song({ title: "" }))).toThrow(ValidationError));
  it.each([0, -1, 1.5])("rejects intervalDays %s", (n) => {
    expect(() => validateSong(song({ intervalDays: n }))).toThrow(ValidationError);
  });
  it.each([1.0, 3.1])("rejects ease %s", (e) => {
    expect(() => validateSong(song({ ease: e }))).toThrow(ValidationError);
  });
  it("rejects dueDate before lastReviewed", () => {
    expect(() => validateSong(song({ dueDate: "2026-10-21", lastReviewed: "2026-10-22" }))).toThrow(/lastReviewed/);
  });
  it("rejects unknown field", () => expect(() => validateSong({ ...song(), x: 1 })).toThrow(/unknown field/));
});

describe("settings and records", () => {
  it("accepts and rejects", () => {
    expect(validateSettings(settings())).toEqual(settings());
    expect(() => validateSettings({ ...settings(), suggestionPeriod: "monthly" })).toThrow(ValidationError);
    expect(() => validateSettings({ ...settings(), timerSound: "yes" })).toThrow(ValidationError);
    expect(() => validateSettings({ ...settings(), extra: true })).toThrow(/unknown field/);
  });
  it("has schemaVersion 2", () => expect(schemaVersion).toBe(2));
  it("rejects bad metronomeBpm", () => {
    const { metronomeBpm: _drop, ...missing } = settings();
    expect(() => validateSettings(missing)).toThrow(/missing field "metronomeBpm"/);
    expect(() => validateSettings({ ...settings(), metronomeBpm: 100.5 })).toThrow(ValidationError);
    expect(() => validateSettings({ ...settings(), metronomeBpm: "100" })).toThrow(ValidationError);
    expect(() => validateSettings({ ...settings(), metronomeBpm: config.metronome.minBpm - 1 })).toThrow(ValidationError);
    expect(() => validateSettings({ ...settings(), metronomeBpm: config.metronome.maxBpm + 1 })).toThrow(ValidationError);
    expect(validateSettings({ ...settings(), metronomeBpm: config.metronome.minBpm }).metronomeBpm).toBe(config.metronome.minBpm);
    expect(validateSettings({ ...settings(), metronomeBpm: config.metronome.maxBpm }).metronomeBpm).toBe(config.metronome.maxBpm);
  });
  it("rejects unknown record type", () => {
    expect(() => validateRecord("playlist", {})).toThrow(/unknown record type/);
    expect(validateRecord("song", song())).toEqual(song());
  });
  it("newId yields uuids", () => expect(newId()).toMatch(/^[0-9a-f-]{36}$/));
});
