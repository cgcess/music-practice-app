/** v1 -> v2: Settings gain `metronomeBpm` (literal default, independent of config). */
export function v1ToV2(data: unknown): unknown {
  const d = data as { settings?: Record<string, unknown> | null };
  if (!d || typeof d !== "object" || !d.settings) return data;
  return { ...d, settings: { ...d.settings, metronomeBpm: 100 } };
}
