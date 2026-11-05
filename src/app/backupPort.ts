import { todayLocal } from "../dates";
import { backupFileName, type Store } from "../data/store";
import { ValidationError } from "../data/schema";
import type { BackupPort } from "../ui/ports";

/** Turn store validation messages into wording fit for the user. */
export function friendlyBackupError(e: unknown): Error {
  const m = e instanceof Error ? e.message : String(e);
  if (!(e instanceof ValidationError)) return e instanceof Error ? e : new Error(m);
  if (/^backup: invalid JSON/.test(m)) return new Error("The file is not valid JSON");
  if (/^backup: (wrong app|expected object)/.test(m)) return new Error("This is not a backup from this app");
  if (/newer than supported/.test(m)) return new Error("This backup is from a newer version of the app; update the app first");
  return new Error(`The backup file has invalid data (${m})`);
}

/** Adapter between the Settings view and the store's backup functions. */
export function makeBackupPort(
  store: Pick<Store, "exportBackup" | "importBackup" | "inspectBackup" | "listTasks" | "listSongs">,
  deps: { today?: () => string } = {},
): BackupPort {
  const today = () => (deps.today ?? todayLocal)();
  return {
    async prepareExport() {
      const b = await store.exportBackup();
      return {
        fileName: backupFileName(today()),
        text: JSON.stringify(b, null, 2),
        tasks: b.data.tasks.length,
        songs: b.data.songs.length,
      };
    },
    async inspect(text) {
      try {
        return store.inspectBackup(text);
      } catch (e) {
        throw friendlyBackupError(e);
      }
    },
    async current() {
      return { tasks: (await store.listTasks()).length, songs: (await store.listSongs()).length };
    },
    async importBackup(text) {
      try {
        await store.importBackup(text);
      } catch (e) {
        throw friendlyBackupError(e);
      }
    },
  };
}
