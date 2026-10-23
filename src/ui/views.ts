import { config } from "../config";
import { h } from "./h";
import type { IconName } from "./icons";
import type { RepertoirePort, TodayPort } from "./ports";
import type { Route } from "./router";
import { repertoireView } from "./repertoire";
import { defaultTodayEnv, todayView, type TodayEnv } from "./today";

export interface ViewResult {
  el: HTMLElement;
  /** Called by the shell before the view is replaced (clear timers, release locks). */
  dispose?: () => void;
}
export type View = (params: Record<string, string>) => ViewResult;

export interface ViewDeps {
  today: TodayPort;
  repertoire?: RepertoirePort;
  /** Test seam: full Today environment (clock, timers, feedback). */
  todayEnv?: TodayEnv;
}

const emptyPort: TodayPort = {
  listTasks: async () => [],
  addTask: async () => {},
  updateTask: async () => {},
  deleteTask: async (id) => ({ id, name: "", minutes: 1, days: "daily", lastCompletedOn: null, createdAt: "" }),
  restoreTask: async () => {},
  setCompleted: async () => {},
  getTimerPrefs: async () => ({ sound: true, vibrate: true, overtime: true }),
  getTempo: async () => config.metronome.defaultBpm,
  setTempo: async () => {},
  listTodaySongs: async () => ({ songsPerDay: config.songsPerDay, songs: [] }),
  rateTodaySong: async (id) => ({ id, title: "", dueDate: "1970-01-01", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" }),
  restoreTodaySong: async () => {},
};

const emptyRepertoire: RepertoirePort = {
  listSongs: async () => [],
  getSongsPerDay: async () => config.songsPerDay,
  setSongsPerDay: async () => {},
  addSong: async () => {},
  addSongs: async () => ({ added: 0, skipped: 0 }),
  renameSong: async () => {},
  deleteSong: async (id) => ({ id, title: "", dueDate: "1970-01-01", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" }),
  restoreSong: async () => {},
};

const titled = (title: string, body: string): HTMLElement =>
  h(
    "section",
    { class: "view" },
    h("header", { class: "large-header" }, h("h1", { class: "large-title" }, title)),
    h("div", { class: "empty-card" }, body),
  );

const placeholder =
  (title: string): View =>
  () => ({ el: titled(title, "Nothing here yet.") });

export type AppRoute = Route<View> & { label: string; icon: IconName };

export function buildRoutes(deps: ViewDeps): AppRoute[] {
  return [
    { path: "/today", label: "Today", icon: "today", view: () => todayView(deps.todayEnv ?? defaultTodayEnv(deps.today)) },
    { path: "/repertoire", label: "Repertoire", icon: "repertoire", view: () => repertoireView(deps.repertoire ?? emptyRepertoire) },
    { path: "/settings", label: "Settings", icon: "settings", view: placeholder("Settings") },
  ];
}

export const defaultDeps: ViewDeps = { today: emptyPort, repertoire: emptyRepertoire };
export const routes = buildRoutes(defaultDeps);

export const defaultPath = "/today";

export const notFound: View = () => ({ el: titled("Not found", "That page does not exist.") });
