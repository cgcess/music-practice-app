import { migrate } from "./migrate";
import {
  schemaVersion,
  validateSettings,
  validateSong,
  validateTask,
  ValidationError,
  type Settings,
  type Song,
  type Task,
} from "./schema";


export const DEFAULT_DB = "music-practice";
const SETTINGS_KEY = "settings";

export interface BackupData {
  tasks: Task[];
  songs: Song[];
  settings: Settings | null;
}
export interface Backup {
  app: "music-practice";
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error("transaction aborted"));
  });
}

export function backupFileName(date: string): string {
  return `music-practice-backup-${date}.json`;
}

export class Store {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly name: string = DEFAULT_DB) {}

  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((res, rej) => {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("tasks", { keyPath: "id" });
        r.result.createObjectStore("songs", { keyPath: "id" });
        r.result.createObjectStore("settings");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.dbp;
  }

  async close(): Promise<void> {
    if (this.dbp) (await this.dbp).close();
    this.dbp = null;
  }

  private async put(store: "tasks" | "songs", rec: Task | Song): Promise<void> {
    const tx = (await this.db()).transaction(store, "readwrite");
    tx.objectStore(store).put(rec);
    await txDone(tx);
  }
  private async get<T>(store: "tasks" | "songs", id: string, v: (x: unknown) => T): Promise<T | undefined> {
    const tx = (await this.db()).transaction(store, "readonly");
    const r = await req(tx.objectStore(store).get(id));
    return r === undefined ? undefined : v(r);
  }
  private async list<T>(store: "tasks" | "songs", v: (x: unknown) => T): Promise<T[]> {
    const tx = (await this.db()).transaction(store, "readonly");
    return (await req(tx.objectStore(store).getAll())).map(v);
  }
  private async del(store: "tasks" | "songs", id: string): Promise<void> {
    const tx = (await this.db()).transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    await txDone(tx);
  }

  async putTask(t: unknown): Promise<void> {
    return this.put("tasks", validateTask(t));
  }
  getTask(id: string): Promise<Task | undefined> {
    return this.get("tasks", id, validateTask);
  }
  listTasks(): Promise<Task[]> {
    return this.list("tasks", validateTask);
  }
  deleteTask(id: string): Promise<void> {
    return this.del("tasks", id);
  }

  async putSong(s: unknown): Promise<void> {
    return this.put("songs", validateSong(s));
  }
  getSong(id: string): Promise<Song | undefined> {
    return this.get("songs", id, validateSong);
  }
  listSongs(): Promise<Song[]> {
    return this.list("songs", validateSong);
  }
  deleteSong(id: string): Promise<void> {
    return this.del("songs", id);
  }

  async putSettings(s: unknown): Promise<void> {
    const rec = validateSettings(s);
    const tx = (await this.db()).transaction("settings", "readwrite");
    tx.objectStore("settings").put(rec, SETTINGS_KEY);
    await txDone(tx);
  }
  async getSettings(): Promise<Settings | null> {
    const tx = (await this.db()).transaction("settings", "readonly");
    const r = await req(tx.objectStore("settings").get(SETTINGS_KEY));
    return r === undefined ? null : validateSettings(r);
  }

  async exportBackup(now: Date = new Date()): Promise<Backup> {
    return {
      app: "music-practice",
      schemaVersion,
      exportedAt: now.toISOString(),
      appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
      data: {
        tasks: await this.listTasks(),
        songs: await this.listSongs(),
        settings: await this.getSettings(),
      },
    };
  }

  /** Validate and migrate the whole file first; only then replace data in one transaction. */
  async importBackup(json: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new ValidationError("backup: invalid JSON");
    }
    if (typeof parsed !== "object" || parsed === null) throw new ValidationError("backup: expected object");
    const b = parsed as Record<string, unknown>;
    if (b.app !== "music-practice") throw new ValidationError("backup: wrong app");
    if (typeof b.schemaVersion !== "number") throw new ValidationError("backup: missing schemaVersion");
    let data: unknown;
    try {
      data = migrate(b.data, b.schemaVersion);
    } catch (e) {
      throw new ValidationError(`backup: ${(e as Error).message}`);
    }
    if (typeof data !== "object" || data === null) throw new ValidationError("backup.data: expected object");
    const d = data as Record<string, unknown>;
    for (const k of Object.keys(d)) {
      if (!["tasks", "songs", "settings"].includes(k)) throw new ValidationError(`backup.data: unknown field "${k}"`);
    }
    if (!Array.isArray(d.tasks) || !Array.isArray(d.songs)) throw new ValidationError("backup.data: tasks/songs must be arrays");
    const tasks = d.tasks.map(validateTask);
    const songs = d.songs.map(validateSong);
    const settings = d.settings == null ? null : validateSettings(d.settings);

    const tx = (await this.db()).transaction(["tasks", "songs", "settings"], "readwrite");
    tx.objectStore("tasks").clear();
    tx.objectStore("songs").clear();
    tx.objectStore("settings").clear();
    for (const t of tasks) tx.objectStore("tasks").put(t);
    for (const s of songs) tx.objectStore("songs").put(s);
    if (settings) tx.objectStore("settings").put(settings, SETTINGS_KEY);
    await txDone(tx);
  }
}

export const store = new Store();
export const exportBackup = (now?: Date) => store.exportBackup(now);
export const importBackup = (json: string) => store.importBackup(json);
