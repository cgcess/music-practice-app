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
  it("row state tokens are defined in both themes", () => {
    for (const block of [light, dark]) {
      for (const n of ["--row-running", "--row-overtime"]) expect(val(block, n)).toBeTruthy();
    }
  });
  it("running row rules use the tokens and no literal colours", () => {
    const today = readFileSync("src/ui/today.css", "utf8");
    const running = /\.task\.running \.row-body\s*\{[^}]*\}/.exec(today)![0];
    const over = /\.task\.running\.overtime \.row-body\s*\{[^}]*\}/.exec(today)![0];
    const text = /\.task\.running \.time, \.task\.running \.name\s*\{[^}]*\}/.exec(today)![0];
    expect(running).toContain("var(--row-running)");
    expect(over).toContain("var(--row-overtime)");
    expect(text).toContain("var(--label)");
    for (const r of [running, over, text]) expect(r).not.toMatch(/#|rgb\(/);
  });
  it("focus view styles are gone", () => {
    expect(css).not.toMatch(/\.focus\b(?!-visible)|\.ring\b|focus-ms/);
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
