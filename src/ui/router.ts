export interface Route<V> {
  path: string;
  view: V;
}
export interface Match<V> {
  route: Route<V>;
  params: Record<string, string>;
}

/** "#/a/b/" -> "/a/b"; "" and "#" and "#/" -> "/". Strips one trailing slash. */
export function parseHash(hash: string): string {
  let p = hash.startsWith("#") ? hash.slice(1) : hash;
  if (p === "") return "/";
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** Match a normalised path against routes with simple :param segments. Null if none match. */
export function matchRoute<V>(routes: Route<V>[], path: string): Match<V> | null {
  const segs = path.split("/").slice(1);
  for (const route of routes) {
    const pat = route.path.split("/").slice(1);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const p = pat[i] as string;
      const s = segs[i] as string;
      if (p.startsWith(":")) {
        try {
          params[p.slice(1)] = decodeURIComponent(s);
        } catch {
          return null;
        }
      } else if (p !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/**
 * Resolve the current hash and call render(match|null) on each hashchange.
 * Does not render initially; the caller decides. Returns an unsubscribe fn.
 */
export function startRouter<V>(
  routes: Route<V>[],
  render: (match: Match<V> | null, initial: boolean) => void,
): () => void {
  const resolve = () => matchRoute(routes, parseHash(location.hash));
  const onChange = () => render(resolve(), false);
  window.addEventListener("hashchange", onChange);
  render(resolve(), true);
  return () => window.removeEventListener("hashchange", onChange);
}
