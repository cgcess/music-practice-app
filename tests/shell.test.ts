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
  it("shows the app version in the footer", () => {
    mount();
    expect(document.querySelector("footer")?.textContent).toContain(`Version ${__APP_VERSION__}`);
  });
  it("renders one nav link per route", () => {
    mount();
    expect(document.querySelectorAll("nav a")).toHaveLength(routes.length);
  });
  it("tab bar is a nav with real links, one aria-current tab matching the route, one h1 in main", async () => {
    mount();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("nav.tabbar a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(routes.map((r) => "#" + r.path));
    expect(document.querySelectorAll("nav [aria-current=page]")).toHaveLength(1);
    expect(document.querySelector("nav [aria-current=page]")?.getAttribute("href")).toBe("#/today");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.closest("main")).not.toBeNull();
    await nav("#/settings");
    expect(document.querySelector("nav [aria-current=page]")?.getAttribute("href")).toBe("#/settings");
    expect(document.querySelector("h1")?.textContent).toBe("Settings");
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
  it("calls the previous view's dispose when navigating away", async () => {
    let disposed = 0;
    unsub = mountShell(document.body, {
      today: {
        listTasks: async () => [],
        addTask: async () => {},
        setCompleted: async () => {},
        updateTask: async () => {},
        deleteTask: async (id) => ({ id, name: "", minutes: 1, days: "daily", lastCompletedOn: null, createdAt: "" }),
        restoreTask: async () => {},
        getTimerPrefs: async () => ({ sound: true, vibrate: true, overtime: true }),
        getTempo: async () => 100,
        repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
        setTempo: async () => {},
        listTodaySongs: async () => ({ songsPerDay: 0, songs: [] }),
        rateTodaySong: async (id) => ({ id, title: "", dueDate: "2026-10-23", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" }),
        restoreTodaySong: async () => {},
      },
      todayEnv: {
        port: {
          listTasks: async () => [],
          addTask: async () => {},
          setCompleted: async () => {},
          updateTask: async () => {},
          deleteTask: async (id) => ({ id, name: "", minutes: 1, days: "daily", lastCompletedOn: null, createdAt: "" }),
          restoreTask: async () => {},
          getTimerPrefs: async () => ({ sound: true, vibrate: true, overtime: true }),
          getTempo: async () => 100,
          repertoireStrength: async () => ({ well: 0, okay: 0, poorly: 0, fresh: 0 }),
          setTempo: async () => {},
          listTodaySongs: async () => ({ songsPerDay: 0, songs: [] }),
          rateTodaySong: async (id) => ({ id, title: "", dueDate: "2026-10-23", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "" }),
          restoreTodaySong: async () => {},
        },
        now: () => Date.now(),
        feedback: {
          prime() {},
          chime() {},
          acquireWakeLock() {},
          releaseWakeLock() {},
          dispose: () => {
            disposed++;
          },
        },
        every: () => () => {},
        after: () => () => {},
        onVisible: () => () => {},
      },
    });
    expect(disposed).toBe(0);
    await nav("#/settings");
    expect(disposed).toBe(1);
  });
});
