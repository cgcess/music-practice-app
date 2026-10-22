import type { ManifestOptions } from "vite-plugin-pwa";

/** Build-time constants (not user-tunable, so not in src/config.ts). */
export const THEME_COLOR_LIGHT = "#f2f2f7";
export const THEME_COLOR_DARK = "#000000";
export const BACKGROUND_COLOR = "#ffffff";

/** Replaces the theme-color placeholders in index.html so these constants are the only literals. */
export function injectThemeColor(html: string): string {
  return html.replaceAll("__THEME_COLOR_LIGHT__", THEME_COLOR_LIGHT).replaceAll("__THEME_COLOR_DARK__", THEME_COLOR_DARK);
}

export const manifest: Partial<ManifestOptions> = {
  name: "Music Practice",
  short_name: "Practice",
  id: "./",
  start_url: "./",
  scope: "./",
  display: "standalone",
  theme_color: THEME_COLOR_LIGHT,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
