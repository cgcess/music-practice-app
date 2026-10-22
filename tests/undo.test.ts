import { describe, expect, it } from "vitest";
import { applyUndo, prepareUndo } from "../src/today/undo";

describe("undo", () => {
  it("restores the previous value within the window", () => {
    const u = prepareUndo("a", "2026-10-21", 1000);
    expect(applyUndo(u, 1000 + 4000, 5000)).toEqual({ value: "2026-10-21" });
  });
  it("restores a null previous value", () => {
    expect(applyUndo(prepareUndo("a", null, 0), 10, 5000)).toEqual({ value: null });
  });
  it("expires after the window", () => {
    expect(applyUndo(prepareUndo("a", null, 0), 5001, 5000)).toBeNull();
  });
});
