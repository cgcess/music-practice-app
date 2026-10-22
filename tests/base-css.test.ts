import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/base.css", "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = css.slice(css.indexOf(":root"), darkStart);
const dark = css.slice(darkStart, css.indexOf("/* Reset */"));
const val = (block: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

describe("base.css", () => {
  it("task palette never equals accent, success or warning in either theme", () => {
    for (const block of [light, dark]) {
      const reserved = ["--accent", "--success", "--warning"].map((n) => val(block, n)!.toLowerCase());
      for (const n of reserved) expect(n).toBeTruthy();
      for (let i = 1; i <= 8; i++) {
        const v = val(block, `--task-${i}`)!.toLowerCase();
        expect(v).toBeTruthy();
        expect(reserved).not.toContain(v);
      }
    }
  });
  it("has the platform hooks", () => {
    for (const s of [
      "color-scheme",
      "prefers-color-scheme: dark",
      "prefers-reduced-motion",
      "user-select: none",
      "env(safe-area-inset-bottom)",
      "-webkit-backdrop-filter",
      "-webkit-tap-highlight-color: transparent",
      "text-size-adjust",
    ]) {
      expect(css).toContain(s);
    }
  });
  it("snackbar sits above the tab bar", () => {
    const toast = /\.toast\s*\{[^}]*\}/.exec(css)![0];
    expect(toast).toMatch(/bottom:[^;]*--tabbar-h/);
  });
});
