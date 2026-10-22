import { h } from "./h";
import { startRouter, parseHash, type Match } from "./router";
import { routes, notFound, defaultPath, type View } from "./views";

/** Mount header, nav and main into root. Returns an unsubscribe fn for the router. */
export function mountShell(root: HTMLElement): () => void {
  const links = routes.map((r) =>
    h("a", { href: "#" + r.path, "data-path": r.path }, r.label),
  );
  const main = h("main", { id: "main", tabindex: "-1" });
  root.replaceChildren(
    h("header", null, h("h1", null, "Music Practice"), h("nav", { "aria-label": "Main" }, links)),
    main,
  );

  // Empty hash resolves to the default route.
  const table = [...routes.map((r) => ({ path: r.path, view: r.view })), { path: "/", view: routes.find((r) => r.path === defaultPath)!.view }];

  return startRouter<View>(table, (match: Match<View> | null, initial) => {
    const activePath = match ? (parseHash(location.hash) === "/" ? defaultPath : match.route.path) : null;
    for (const a of links) {
      if (a.dataset.path === activePath) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    main.replaceChildren(match ? match.route.view(match.params) : notFound({}));
    if (!initial) main.focus();
  });
}
