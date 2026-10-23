import { config } from "../config";
import { round2 } from "./scheduler";

import type { StrengthCounts } from "../ui/ports";

export type { StrengthCounts };

/** Bucket a repertoire for the strength bar. Unreviewed songs are "fresh" whatever their ease. */
export function strengthCounts(
  songs: ReadonlyArray<{ ease: number; lastReviewed: string | null }>,
  sr: Pick<typeof config.sr, "wellEase" | "poorEase"> = config.sr,
): StrengthCounts {
  const c: StrengthCounts = { well: 0, okay: 0, poorly: 0, fresh: 0 };
  for (const s of songs) {
    if (!s.lastReviewed) c.fresh++;
    else {
      const e = round2(s.ease);
      if (e >= sr.wellEase) c.well++;
      else if (e < sr.poorEase) c.poorly++;
      else c.okay++;
    }
  }
  return c;
}
