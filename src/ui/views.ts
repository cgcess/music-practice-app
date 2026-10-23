import { h } from "./h";
import type { IconName } from "./icons";
import type { TodayPort } from "./ports";
import type { Route } from "./router";
import { defaultTodayEnv, todayView, type TodayEnv } from "./today";

export interface ViewResult {
  el: HTMLElement;
  /** Called by the shell before the view is replaced (clear timers, release locks). */
  dispose?: () => void;
}
export type View = (params: Record<string, string>) => ViewResult;

export interface ViewDeps {
  today: TodayPort;
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
  getTempo: async () => 100,
  setTempo: async () => {},
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
    { path: "/repertoire", label: "Repertoire", icon: "repertoire", view: placeholder("Repertoire") },
    { path: "/settings", label: "Settings", icon: "settings", view: placeholder("Settings") },
  ];
}

export const defaultDeps: ViewDeps = { today: emptyPort };
export const routes = buildRoutes(defaultDeps);

export const defaultPath = "/today";

export const notFound: View = () => ({ el: titled("Not found", "That page does not exist.") });
