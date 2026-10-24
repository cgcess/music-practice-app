import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/base.css", "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = css.slice(css.indexOf(":root"), darkStart);
const dark = css.slice(darkStart, css.indexOf("/* Reset */"));
const val = (block: string, name: string) => new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

describe("base.css", () => {
  it("task palette tokens are gone", () => {
    expect(css).not.toMatch(new RegExp("--task" + "-"));
  });
  it("t017 tokens are defined in both themes", () => {
    const names = [
      "--success-text", "--warning-text", "--success-fill", "--on-success", "--accent-text",
      "--toast-bg", "--toast-ink", "--toast-undo",
      "--rest-1", "--rest-2", "--full-1", "--full-2", "--bloom-1", "--bloom-2", "--bloom-3",
      "--bloom-ink-2", "--head-ink-2", "--head-accent", "--head-tint", "--glow",
    ];
    for (const block of [light, dark]) for (const n of names) expect(val(block, n), n).toBeTruthy();
    for (const n of ["--font-rounded", "--spring", "--bloom-ink", "--bloom-tint"]) expect(val(light, n), n).toBeTruthy();
    expect(val(light, "--font-rounded")).toMatch(/^ui-rounded/);
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
  it("the toast leave clone is its own rule, positioned above the tab bar", () => {
    expect(css).not.toMatch(/\.toast\s*,\s*\.toast-leaving|\.toast-leaving\s*,\s*\.toast\b/);
    const leaving = /\.toast-leaving\s*\{[^}]*\}/.exec(css)![0];
    expect(leaving).toMatch(/bottom:[^;]*--tabbar-h/);
    expect(leaving).toContain("position: fixed");
  });
});

describe("today.css paused row", () => {
  const today = readFileSync("src/ui/today.css", "utf8");
  it("keeps .time on one line and shrinks it when paused", () => {
    expect(/\.task \.time \{[^}]*white-space: nowrap/.test(today)).toBe(true);
    expect(/\.task\.paused \.time \{[^}]*font-size/.test(today)).toBe(true);
  });
});
