import { config } from "../config";
import { h } from "./h";
import type { IconName } from "./icons";
import type { RepertoirePort, TodayPort } from "./ports";
import type { Route } from "./router";
import { repertoireView } from "./repertoire";
import { editTasksView } from "./editTasks";
import { createSharedTimer, defaultTodayEnv, todayView, type TodayEnv } from "./today";

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
  repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
};

const emptyRepertoire: RepertoirePort = {
  listSongs: async () => [],
  getSongsPerDay: async () => config.songsPerDay,
  setSongsPerDay: async () => {},
  addSong: async () => {},
  addSongs: async () => ({ added: 0, skipped: 0 }),
  renameSong: async () => {},
  deleteSong: async () => {
    throw new Error("No repertoire port");
  },
  restoreSong: async () => {},
  repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
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

/** `tab: false` routes are reachable by link only and get no tab bar entry. */
export type AppRoute = Route<View> & { label: string; icon: IconName; tab?: boolean };

export function buildRoutes(deps: ViewDeps): AppRoute[] {
  // One timer for the whole session: the shell rebuilds views on navigation, so Today cannot own it.
  const timer = deps.todayEnv?.timer ?? createSharedTimer(deps.todayEnv?.now ?? (() => Date.now()));
  return [
    { path: "/today", label: "Today", icon: "today", view: () => todayView({ ...(deps.todayEnv ?? defaultTodayEnv(deps.today)), timer }) },
    {
      path: "/edit",
      label: "Edit tasks",
      icon: "today",
      tab: false,
      view: () => editTasksView({ port: deps.today, timer, feedback: deps.todayEnv?.feedback, after: deps.todayEnv?.after }),
    },
    { path: "/repertoire", label: "Repertoire", icon: "repertoire", view: () => repertoireView(deps.repertoire ?? emptyRepertoire) },
    { path: "/settings", label: "Settings", icon: "settings", view: placeholder("Settings") },
  ];
}

export const defaultDeps: ViewDeps = { today: emptyPort, repertoire: emptyRepertoire };
export const routes = buildRoutes(defaultDeps);

export const defaultPath = "/today";

export const notFound: View = () => ({ el: titled("Not found", "That page does not exist.") });
