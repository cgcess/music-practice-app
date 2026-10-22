import { config } from "../config";
import { h } from "./h";

export interface SheetOpts {
  title: string;
  onClose?: () => void;
}
export interface Sheet {
  close(): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Bottom sheet: dialog role, backdrop, Escape, focus trap, focus restored on close. */
export function openSheet(content: Node, opts: SheetOpts): Sheet {
  const opener = document.activeElement as HTMLElement | null;
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": opts.title, tabindex: "-1" }, h("h2", null, opts.title), content);
  const backdrop = h("div", { class: "sheet-backdrop" }, panel);
  backdrop.style.setProperty("--sheet-ms", `${config.today.sheetMs}ms`);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    opener?.focus?.();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);
  (panel.querySelector<HTMLElement>("input, button") ?? panel).focus();
  return { close };
}
