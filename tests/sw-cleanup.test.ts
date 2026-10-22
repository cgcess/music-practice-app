import { afterEach, describe, expect, it, vi } from "vitest";
// Real filter used by the generated SW (cleanupOutdatedCaches).
// Coupled to the plugin's workbox version: bump workbox-precaching together with vite-plugin-pwa.
import { deleteOutdatedCaches } from "workbox-precaching/utils/deleteOutdatedCaches.js";

const SCOPE = "https://cgcess.github.io/music-practice-app/";

afterEach(() => vi.unstubAllGlobals());

describe("SW cache cleanup", () => {
  it("deletes only this app's outdated precaches", async () => {
    const current = `music-practice-precache-v2-${SCOPE}`;
    const old = `music-practice-precache-old-${SCOPE}`;
    const other = "workbox-precache-v2-https://cgcess.github.io/other-app/";
    const otherPlain = "other-app-cache";
    const keys = [otherPlain, other, old, current];
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("self", { caches: { keys: async () => keys, delete: del }, registration: { scope: SCOPE } });
    const deleted = await deleteOutdatedCaches(current);
    expect(deleted).toEqual([old]);
    expect(del.mock.calls.map((c) => c[0])).toEqual([old]);
  });
});
