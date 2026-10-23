import { describe, expect, it } from "vitest";
import { dueText } from "../src/sr/dueText";

describe("dueText", () => {
  it("words", () => {
    expect(dueText("2026-10-23", "2026-10-23")).toBe("today");
    expect(dueText("2026-10-20", "2026-10-23")).toBe("today");
    expect(dueText("2026-10-24", "2026-10-23")).toBe("tomorrow");
    expect(dueText("2026-10-27", "2026-10-23")).toBe("in 4 days");
    expect(dueText("2026-11-02", "2026-10-30")).toBe("in 3 days");
  });
});
