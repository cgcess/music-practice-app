const NS = "http://www.w3.org/2000/svg";

export type IconName = "today" | "repertoire" | "settings" | "play" | "pause" | "stop" | "check" | "plus" | "chevron" | "pencil" | "trash";

const PATHS: Record<IconName, { d: string[]; filled?: boolean }> = {
  today: { d: ["M5 5h14v15H5z", "M5 10h14", "M9 3v4", "M15 3v4"] },
  repertoire: { d: ["M9 18V6l10-2v12", "M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z", "M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"] },
  settings: { d: ["M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", "M16 5v4", "M8 15v4"] },
  play: { d: ["M8 5v14l11-7z"], filled: true },
  pause: { d: ["M7 5h3v14H7z", "M14 5h3v14h-3z"], filled: true },
  stop: { d: ["M6 6h12v12H6z"], filled: true },
  check: { d: ["M5 12.5l4.5 4.5L19 7.5"] },
  plus: { d: ["M12 5v14", "M5 12h14"] },
  chevron: { d: ["M9 6l6 6-6 6"] },
  pencil: { d: ["M4 20l1-4L16 5l3 3L8 19z", "M14 7l3 3"] },
  trash: { d: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"] },
};

const svgEl = (tag: string, attrs: Record<string, string>): SVGElement => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el as SVGElement;
};

/** Inline SVG icon (decorative: aria-hidden). Built with createElementNS (DOM APIs only). */
export function icon(name: IconName): SVGElement {
  const def = PATHS[name];
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24",
    width: "24",
    height: "24",
    fill: def.filled ? "currentColor" : "none",
    stroke: "currentColor",
    "stroke-width": def.filled ? "1" : "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  });
  for (const d of def.d) svg.appendChild(svgEl("path", { d }));
  return svg;
}
