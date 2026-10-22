// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountShell } from "../src/ui/shell";
import { routes } from "../src/ui/views";

let unsub: (() => void) | null = null;

const nav = async (hash: string) => {
  const p = new Promise<void>((r) => window.addEventListener("hashchange", () => r(), { once: true }));
  location.hash = hash;
  await p;
};
const mount = () => {
  unsub = mountShell(document.body);
  return document.querySelector("main") as HTMLElement;
};

beforeEach(() => {
  location.hash = "";
  document.body.replaceChildren();
});
afterEach(() => {
  unsub?.();
  unsub = null;
  location.hash = "";
});

describe("shell", () => {
  it("focuses main after a hash navigation", async () => {
    const main = mount();
    await nav("#/settings");
    expect(document.activeElement).toBe(main);
  });
  it("does not focus main on initial mount", () => {
    const main = mount();
    expect(document.activeElement).not.toBe(main);
  });
  it("renders one nav link per route", () => {
    mount();
    expect(document.querySelectorAll("nav a")).toHaveLength(routes.length);
  });
  it("marks only the active link and swaps heading", async () => {
    mount();
    expect(document.querySelector("main h1")?.textContent).toBe("Today");
    expect(document.querySelectorAll("[aria-current=page]")).toHaveLength(1);
    await nav("#/repertoire");
    expect(document.querySelector("main h1")?.textContent).toBe("Repertoire");
    const cur = document.querySelectorAll("[aria-current=page]");
    expect(cur).toHaveLength(1);
    expect(cur[0]?.getAttribute("href")).toBe("#/repertoire");
  });
  it("shows not-found for unknown hash with no active link", async () => {
    mount();
    await nav("#/nope");
    expect(document.querySelector("main h1")?.textContent).toBe("Not found");
    expect(document.querySelectorAll("[aria-current=page]")).toHaveLength(0);
  });
  it("renders exactly once per hash change", async () => {
    const main = mount();
    let renders = 0;
    new MutationObserver(() => renders++).observe(main, { childList: true });
    await nav("#/settings");
    await Promise.resolve();
    expect(main.querySelectorAll("h1")).toHaveLength(1);
    expect(renders).toBe(1);
  });
  it("unsubscribe stops further renders", async () => {
    mount();
    unsub!();
    unsub = null;
    const before = document.querySelector("main h1")?.textContent;
    const p = new Promise<void>((r) => window.addEventListener("hashchange", () => r(), { once: true }));
    location.hash = "#/settings";
    await p;
    expect(document.querySelector("main h1")?.textContent).toBe(before);
  });
});
