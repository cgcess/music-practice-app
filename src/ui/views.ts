import { h } from "./h";
import type { Route } from "./router";

export type View = (params: Record<string, string>) => HTMLElement;

const placeholder =
  (title: string): View =>
  () =>
    h("section", null, h("h1", null, title));

export const routes: (Route<View> & { label: string })[] = [
  { path: "/today", label: "Today", view: placeholder("Today") },
  { path: "/repertoire", label: "Repertoire", view: placeholder("Repertoire") },
  { path: "/settings", label: "Settings", view: placeholder("Settings") },
];

export const defaultPath = "/today";

export const notFound: View = () =>
  h("section", null, h("h1", null, "Not found"), h("p", null, "That page does not exist."));
