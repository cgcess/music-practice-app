import { describe, expect, it, vi } from "vitest";

describe("gitShortCommit", () => {
  it("falls back to dev when git fails", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({ execSync: () => { throw new Error("no git"); } }));
    const { gitShortCommit } = await import("../vite.config");
    expect(gitShortCommit()).toBe("dev");
    vi.doUnmock("node:child_process");
  });
});
