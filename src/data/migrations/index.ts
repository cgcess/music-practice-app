/**
 * Ordered migrations: index i migrates a backup's `data` from schema v(i+1) to v(i+2).
 * v1 is the first version, so the list is empty.
 */
export type Migration = (data: unknown) => unknown;
export const migrations: Migration[] = [];
