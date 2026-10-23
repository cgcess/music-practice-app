import type { Store } from "../data/store";
import type { Song } from "../data/schema";
import { todayLocal } from "../dates";
import { planTopUp } from "../sr/scheduler";
import type { PortDeps } from "./todayPort";

export interface TopUpResult {
  songs: Song[];
  songsPerDay: number;
  day: string;
}

/**
 * Daily top-up shared by the Today and Repertoire ports: pulls the soonest-due songs forward (dueDate = today)
 * so the selection reaches songsPerDay. Idempotent: pulled songs are due today, so a second call plans nothing.
 */
export async function topUpToday(
  store: Pick<Store, "getSettings" | "listSongs" | "putSong" | "getSong">,
  deps: Pick<PortDeps, "getEffectiveConfig" | "today">,
): Promise<TopUpResult> {
  const day = (deps.today ?? todayLocal)();
  const songsPerDay = deps.getEffectiveConfig(await store.getSettings()).songsPerDay;
  let songs = await store.listSongs();
  const pulled = planTopUp(songs, day, songsPerDay);
  if (pulled.length > 0) {
    // Persisting the pulled-ahead dueDate keeps the selection stable across reloads. A failed write
    // must not break the view: fall back to the re-listed store.
    try {
      const written = new Map<string, Song>();
      const removed = new Set<string>();
      for (const s of pulled) {
        // Re-read just before writing so a concurrent rename or rating is not overwritten with a stale record.
        const fresh = await store.getSong(s.id);
        if (!fresh) {
          removed.add(s.id);
          continue;
        }
        if (fresh.lastReviewed === day || fresh.dueDate <= day) {
          written.set(s.id, fresh);
          continue;
        }
        const next = { ...fresh, dueDate: day };
        await store.putSong(next);
        written.set(s.id, next);
      }
      songs = songs.filter((s) => !removed.has(s.id)).map((s) => written.get(s.id) ?? s);
    } catch {
      songs = await store.listSongs();
    }
  }
  return { songs, songsPerDay, day };
}
