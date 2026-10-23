/**
 * FNV-1a, 32-bit. Small, pure and dependency-free; used to seed the scheduler so the
 * same inputs always give the same fuzz and ordering (no unseeded randomness, no clock reads).
 */
export function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic value in [0, 1) derived from a seed string. */
export function rand01(seed: string): number {
  return fnv1a32(seed) / 4294967296;
}
