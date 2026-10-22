import { h } from "./h";
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
  setCompleted: async () => {},
  getTimerPrefs: async () => ({ sound: true, vibrate: true, overtime: true }),
};

const placeholder =
  (title: string): View =>
  () => ({ el: h("section", null, h("h1", null, title)) });

export function buildRoutes(deps: ViewDeps): (Route<View> & { label: string })[] {
  return [
    { path: "/today", label: "Today", view: () => todayView(deps.todayEnv ?? defaultTodayEnv(deps.today)) },
    { path: "/repertoire", label: "Repertoire", view: placeholder("Repertoire") },
    { path: "/settings", label: "Settings", view: placeholder("Settings") },
  ];
}

export const defaultDeps: ViewDeps = { today: emptyPort };
export const routes = buildRoutes(defaultDeps);

export const defaultPath = "/today";

export const notFound: View = () => ({
  el: h("section", null, h("h1", null, "Not found"), h("p", null, "That page does not exist.")),
});
