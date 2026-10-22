import { h } from "./h";
import { startRouter, parseHash, type Match } from "./router";
import { buildRoutes, defaultDeps, notFound, defaultPath, type View, type ViewDeps, type ViewResult } from "./views";

/** Mount header, nav and main into root. Returns an unsubscribe fn for the router. */
export function mountShell(root: HTMLElement, deps: ViewDeps = defaultDeps): () => void {
  const routes = buildRoutes(deps);
  const links = routes.map((r) =>
    h("a", { href: "#" + r.path, "data-path": r.path }, r.label),
  );
  const main = h("main", { id: "main", tabindex: "-1" });
  root.replaceChildren(
    h("header", null, h("h1", null, "Music Practice"), h("nav", { "aria-label": "Main" }, links)),
    main,
    h("footer", null, `Version ${__APP_VERSION__}`),
  );

  // Empty hash resolves to the default route.
  const table = [...routes.map((r) => ({ path: r.path, view: r.view })), { path: "/", view: routes.find((r) => r.path === defaultPath)!.view }];

  let current: ViewResult | null = null;
  const stop = startRouter<View>(table, (match: Match<View> | null, initial) => {
    const activePath = match ? (parseHash(location.hash) === "/" ? defaultPath : match.route.path) : null;
    for (const a of links) {
      if (a.dataset.path === activePath) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    current?.dispose?.();
    current = match ? match.route.view(match.params) : notFound({});
    main.replaceChildren(current.el);
    if (!initial) main.focus();
  });
  return () => {
    stop();
    current?.dispose?.();
    current = null;
  };
}
