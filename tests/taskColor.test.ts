import { describe, expect, it } from "vitest";
import { TASK_COLORS, taskColor } from "../src/ui/taskColor";

describe("taskColor", () => {
  it("is deterministic and in the palette", () => {
    expect(taskColor("abc")).toBe(taskColor("abc"));
    expect(TASK_COLORS).toContain(taskColor("abc"));
    expect(TASK_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(TASK_COLORS.length).toBeLessThanOrEqual(8);
  });
  it("spreads 200 ids over at least 4 colours", () => {
    const used = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = taskColor(crypto.randomUUID());
      expect(TASK_COLORS).toContain(c);
      used.add(c);
    }
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});
