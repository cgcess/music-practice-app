import { v1ToV2 } from "./v1-to-v2";

/**
 * Ordered migrations: index i migrates a backup's `data` from schema v(i+1) to v(i+2).
 */
export type Migration = (data: unknown) => unknown;
export const migrations: Migration[] = [v1ToV2];
