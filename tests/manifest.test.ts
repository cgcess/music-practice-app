import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLOR, injectThemeColor, manifest } from "../pwa-manifest";

describe("manifest", () => {
  it("has required fields, relative to the sub-path", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("has 192, 512 and maskable 512 icons that exist in public/", () => {
    const icons = manifest.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const i of icons) {
      expect(i.src.startsWith("/") || i.src.includes("://")).toBe(false);
      expect(existsSync(`public/${i.src}`)).toBe(true);
    }
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
  });
});

describe("theme color", () => {
  it("injectThemeColor replaces the placeholder with THEME_COLOR", () => {
    const out = injectThemeColor('<meta name="theme-color" content="__THEME_COLOR__" />');
    expect(out).toContain(`content="${THEME_COLOR}"`);
    expect(out).not.toContain("__THEME_COLOR__");
    expect(manifest.theme_color).toBe(THEME_COLOR);
  });
  it("index.html source has the placeholder and no literal hex", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain("__THEME_COLOR__");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
