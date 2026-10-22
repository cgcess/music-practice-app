import type { ManifestOptions } from "vite-plugin-pwa";

/** Build-time constants (not user-tunable, so not in src/config.ts). */
export const THEME_COLOR = "#1f3a5f";
export const BACKGROUND_COLOR = "#ffffff";

export const manifest: Partial<ManifestOptions> = {
  name: "Music Practice",
  short_name: "Practice",
  id: "./",
  start_url: "./",
  scope: "./",
  display: "standalone",
  theme_color: THEME_COLOR,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
