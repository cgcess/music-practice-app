import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

export function gitShortCommit(): string {
  try {
    const out = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return out || "dev";
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(gitShortCommit()) },
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
