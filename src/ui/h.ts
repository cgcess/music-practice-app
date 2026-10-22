export type Child = string | number | Node | null | undefined | false | Child[];
export type AttrValue = string | number | boolean | null | undefined | ((e: Event) => void);
export type Attrs = Record<string, AttrValue>;

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
  } else if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else {
    parent.appendChild(child);
  }
}

/** Build a DOM element. Text and attribute values are only set via DOM APIs. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else if (typeof value !== "function") {
      el.setAttribute(key, String(value));
    }
  }
  for (const c of children) append(el, c);
  return el;
}
