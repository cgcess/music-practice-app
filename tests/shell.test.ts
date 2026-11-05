// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupPort } from "../src/ui/ports";
import { createSharedTimer, type TodayEnv } from "../src/ui/today";
import { mountShell } from "../src/ui/shell";
import { defaultDeps, routes } from "../src/ui/views";

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
    expect(document.querySelectorAll("nav a")).toHaveLength(routes.filter((r) => r.tab !== false).length);
  });
  it("tab bar is a nav with real links, one aria-current tab matching the route, one h1 in main", async () => {
    mount();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("nav.tabbar a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(routes.filter((r) => r.tab !== false).map((r) => "#" + r.path));
    expect(document.querySelectorAll("nav [aria-current=page]")).toHaveLength(1);
    expect(document.querySelector("nav [aria-current=page]")?.getAttribute("href")).toBe("#/today");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.closest("main")).not.toBeNull();
    await nav("#/settings");
    expect(document.querySelector("nav [aria-current=page]")?.getAttribute("href")).toBe("#/settings");
    expect(document.querySelector("h1")?.textContent).toBe("Settings");
  });
  it("renders #/edit without a tab bar entry", async () => {
    mount();
    await nav("#/edit");
    expect(document.querySelector("main h1")?.textContent).toBe("Edit tasks");
    expect(document.querySelectorAll("nav a")).toHaveLength(3);
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

describe("settings route", () => {
  it("renders Save and Load backup controls instead of the placeholder", async () => {
    mount();
    await nav("#/settings");
    expect(document.querySelector("main")?.textContent).not.toContain("Nothing here yet.");
    expect(document.querySelector("main")?.textContent).toContain("Save backup");
    expect(document.querySelector("main")?.textContent).toContain("Load backup");
  });
});

describe("import stops the timer", () => {
  const backup: BackupPort = {
    prepareExport: async () => ({ fileName: "f.json", text: "{}", tasks: 0, songs: 0 }),
    inspect: async () => ({ tasks: 1, songs: 1, hasSettings: true }),
    current: async () => ({ tasks: 0, songs: 0 }),
    importBackup: async () => {},
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  async function importWith(act: (t: ReturnType<typeof createSharedTimer>) => void) {
    const hashes: string[] = [];
    const release = vi.fn(() => void hashes.push(location.hash));
    const timer = createSharedTimer(() => 1000);
    const todayEnv = {
      port: defaultDeps.today,
      now: () => 1000,
      feedback: { prime() {}, chime() {}, acquireWakeLock() {}, releaseWakeLock: release, dispose() {} },
      every: () => () => {},
      after: () => () => {},
      onVisible: () => () => {},
      timer,
    } as unknown as TodayEnv;
    act(timer);
    unsub = mountShell(document.body, { today: defaultDeps.today, backup, todayEnv });
    await nav("#/settings");
    const f = new File(["{}"], "b.json");
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    const before = release.mock.calls.length;
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Replace")!.click();
    await flush();
    // onImported runs before the hash moves to Today, so a release seen while still on Settings is ours.
    return { releases: hashes.slice(before).filter((h) => h === "#/settings").length, timer };
  }
  it("stops a running timer and releases the wake lock", async () => {
    const { releases, timer } = await importWith((t) => t.controller.start("t1", 60_000));
    expect(timer.controller.snapshot().phase).toBe("idle");
    expect(releases).toBe(1);
    expect(location.hash).toBe("#/today");
  });
  it("stops a paused timer and releases the wake lock", async () => {
    const { releases, timer } = await importWith((t) => {
      t.controller.start("t1", 60_000);
      t.controller.pause();
    });
    expect(timer.controller.snapshot().phase).toBe("idle");
    expect(timer.controller.snapshot().paused).toBe(false);
    expect(releases).toBe(1);
  });
});
