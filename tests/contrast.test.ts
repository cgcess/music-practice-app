/**
 * t017 contrast checks, computed from the tokens in base.css (sRGB hex/rgba; the oklch source is only in comments).
 * Thresholds: 4.5:1 for text, 3:1 for large text and UI glyphs (asserted at 4.5 where the pair already passes).
 * Pairs, per theme (light and dark):
 *  - Today header at rest, partial (full stops), p=0.5 (sRGB blend of rest and full) and bloom (all stops):
 *    title, .date, .summary, Edit toggle, add button glyph on its tint. On bloom the ink is white.
 *  - Repertoire wash: title on --rest-1/--rest-2.
 *  - Undo on the toast; success text on card and page; warning text on card.
 *  - Rate buttons: rough, ok, solid (tinted fills with coloured text).
 *  - Running act icon (on-accent on accent); swipe icons (on-accent on accent, on-success on success-fill).
 * Set CONTRAST_REPORT=1 to print the worst ratio of each group (recorded in docs/decisions.md).
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const css = readFileSync("src/ui/base.css", "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const blocks = { light: css.slice(css.indexOf(":root"), darkStart), dark: css.slice(darkStart, css.indexOf("/* Reset */")) };

function parse(v: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (!m) throw new Error(`unparseable colour: ${v}`);
  const p = m[1]!.split(",").map((x) => parseFloat(x));
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}
/** Token lookup: dark overrides light. */
const token = (theme: "light" | "dark", name: string): RGBA => {
  const re = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`);
  const raw = (theme === "dark" ? re.exec(blocks.dark)?.[1] : undefined) ?? re.exec(blocks.light)?.[1];
  if (!raw) throw new Error(`missing token ${name}`);
  return parse(raw.replace(/\/\*.*?\*\//g, "").trim());
};
const over = (f: RGBA, b: RGB): RGB => [0, 1, 2].map((i) => Math.round(f[i]! * f[3] + b[i]! * (1 - f[3]))) as RGB;
const solid = (c: RGBA): RGB => [c[0], c[1], c[2]];
const mix = (a: RGB, b: RGB, p: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! * p + b[i]! * (1 - p))) as RGB;
const lum = (c: RGB) => {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: RGB, b: RGB) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const report: Record<string, number> = {};
function checkIn(theme0: string, group: string, fg: RGB, bg: RGB, min: number) {
  const r = ratio(fg, bg);
  const key = `${theme0} ${group}`;
  report[key] = Math.min(report[key] ?? Infinity, r);
  expect(r, `${group} fg=${fg} bg=${bg}`).toBeGreaterThanOrEqual(min);
}

describe.each(["light", "dark"] as const)("contrast (%s)", (theme) => {
  const check = (group: string, fg: RGB, bg: RGB, min: number) => checkIn(theme, group, fg, bg, min);
  const t = (n: string) => token(theme, n);
  const page = solid(t("--bg"));
  const card = solid(t("--bg-elevated"));
  const label = solid(t("--label"));

  const states: Record<string, RGB[]> = {
    rest: [solid(t("--rest-1")), solid(t("--rest-2"))],
    partial: [solid(t("--full-1")), solid(t("--full-2"))],
    mid: [mix(solid(t("--full-1")), solid(t("--rest-1")), 0.5), mix(solid(t("--full-2")), solid(t("--rest-2")), 0.5)],
    bloom: [solid(t("--bloom-1")), solid(t("--bloom-2")), solid(t("--bloom-3"))],
  };

  for (const [name, stops] of Object.entries(states)) {
    it(`header text and controls on ${name}`, () => {
      const bloom = name === "bloom";
      for (const bg of stops) {
        check(`header ${name}: title`, bloom ? solid(t("--bloom-ink")) : label, bg, 4.5);
        check(`header ${name}: date and summary`, over(bloom ? t("--bloom-ink-2") : t("--head-ink-2"), bg), bg, 4.5);
        check(`header ${name}: Edit toggle`, bloom ? solid(t("--bloom-ink")) : solid(t("--head-accent")), bg, 4.5);
        const fill = over(bloom ? t("--bloom-tint") : t("--head-tint"), bg);
        check(`header ${name}: add button glyph`, bloom ? solid(t("--bloom-ink")) : solid(t("--head-accent")), fill, 3);
      }
    });
  }

  it("Repertoire wash title", () => {
    for (const k of ["--rest-1", "--rest-2"]) check("repertoire wash: title", label, solid(t(k)), 4.5);
  });
  it("Undo on the toast", () => {
    check("toast: Undo", solid(t("--toast-undo")), solid(t("--toast-bg")), 4.5);
    check("toast: message", solid(t("--toast-ink")), solid(t("--toast-bg")), 4.5);
  });
  it("success and warning text", () => {
    check("success text on card", solid(t("--success-text")), card, 4.5);
    check("success text on page", solid(t("--success-text")), page, 4.5);
    check("warning text on card", solid(t("--warning-text")), card, 4.5);
  });
  it("rate buttons", () => {
    const rough = mix(solid(t("--warning")), card, 0.22);
    const good = mix(solid(t("--success")), card, 0.22);
    const ok = over(t("--accent-tint"), card);
    check("rate rough", solid(t("--warning-text")), rough, 4.5);
    check("rate solid", solid(t("--success-text")), good, 4.5);
    check("rate ok", solid(t("--accent-text")), ok, 4.5);
  });
  it("running act icon and swipe icons", () => {
    check("running act icon", solid(t("--on-accent")), solid(t("--accent")), 4.5);
    check("swipe start icon", solid(t("--on-accent")), solid(t("--accent")), 4.5);
    check("swipe finish icon", solid(t("--on-success")), solid(t("--success-fill")), 4.5);
  });
});

afterAll(() => {
  // eslint-disable-next-line no-console
  if (process.env.CONTRAST_REPORT) console.log(Object.entries(report).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join("\n"));
});
