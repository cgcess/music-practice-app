import { migrations as defaultMigrations, type Migration } from "./migrations";

/** Run migrations from `fromVersion` up to `toVersion` (= migrations.length + 1 by default). */
export function migrate(
  data: unknown,
  fromVersion: number,
  list: Migration[] = defaultMigrations,
  toVersion: number = list.length + 1,
): unknown {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new Error(`invalid schemaVersion ${fromVersion}`);
  if (fromVersion > toVersion) throw new Error(`backup schemaVersion ${fromVersion} is newer than supported ${toVersion}`);
  let cur = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const m = list[v - 1];
    if (!m) throw new Error(`missing migration v${v} -> v${v + 1}`);
    cur = m(cur);
  }
  return cur;
}
