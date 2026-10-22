import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import { injectThemeColor, manifest } from "./pwa-manifest";

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
  plugins: [
    { name: "inject-theme-color", transformIndexHtml: injectThemeColor },
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest,
      workbox: {
        cacheId: "music-practice",
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        globIgnores: ["**/icon-*.png", "**/manifest.webmanifest"],
      },
    }),
  ],
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
