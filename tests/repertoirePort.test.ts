import "fake-indexeddb/auto";
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeRepertoirePort } from "../src/app/repertoirePort";
import { config, getEffectiveConfig } from "../src/config";
import { Store } from "../src/data/store";
import { dueText } from "../src/sr/dueText";
import { settings, song } from "./helpers";

let n = 0;
const deps = () => {
  let ids = 0;
  return { newId: () => `id-${++ids}`, nowIso: () => "2026-10-23T12:00:00+00:00", getEffectiveConfig, today: () => "2026-10-23" };
};
const setup = () => {
  const store = new Store(`repport-${++n}-${Math.random()}`);
  return { store, port: makeRepertoirePort(store, deps()) };
};

describe("repertoirePort", () => {
  it("repertoireStrength counts the whole repertoire and writes nothing", async () => {
    const { port, store } = setup();
    await store.putSong(song({ id: "a", ease: 2.8 }));
    await store.putSong(song({ id: "b", ease: 2.5 }));
    await store.putSong(song({ id: "c", ease: 2.0 }));
    await store.putSong(song({ id: "d", ease: 3.0, lastReviewed: null }));
    const before = await store.listSongs();
    expect(await port.repertoireStrength()).toEqual({ well: 1, okay: 1, poorly: 1, fresh: 1 });
    expect(await store.listSongs()).toEqual(before);
  });
  it("adds a trimmed song with new-song scheduling", async () => {
    const { port, store } = setup();
    await port.addSong("  Autumn Leaves  ");
    const [s] = await store.listSongs();
    expect(s).toMatchObject({ id: "id-1", title: "Autumn Leaves", ease: 2.5, intervalDays: 1, lastReviewed: null, createdAt: "2026-10-23T12:00:00+00:00" });
    expect(s!.dueDate >= "2026-10-23" && s!.dueDate <= "2026-10-30").toBe(true);
    await expect(port.addSong("   ")).rejects.toThrow();
  });

  it("bulk add: blanks, existing in other case, in-list duplicate give exact counts", async () => {
    const { port } = setup();
    await port.addSong("Blue Bossa");
    const res = await port.addSongs(["  Satin Doll ", "", "   ", "blue bossa", "Satin DOLL", "Misty", "Misty "]);
    expect(res).toEqual({ added: 2, skipped: 3 });
    expect((await port.listSongs()).map((s) => s.title).sort()).toEqual(["Blue Bossa", "Misty", "Satin Doll"]);
  });

  it("renames, and rejects blank or unknown", async () => {
    const { port } = setup();
    await port.addSong("Old");
    await port.renameSong("id-1", " New ");
    expect((await port.listSongs())[0]!.title).toBe("New");
    await expect(port.renameSong("id-1", " ")).rejects.toThrow();
    await expect(port.renameSong("nope", "x")).rejects.toThrow("Song not found");
  });

  it("delete returns the exact record and restore puts it back", async () => {
    const { port, store } = setup();
    await port.addSong("Keep");
    const before = (await store.getSong("id-1"))!;
    const snap = await port.deleteSong("id-1");
    expect(snap).toEqual(before);
    expect(await store.listSongs()).toEqual([]);
    await port.restoreSong(snap);
    expect(await store.getSong("id-1")).toEqual(before);
    await expect(port.deleteSong("nope")).rejects.toThrow("Song not found");
  });

  it("lists by dueDate, then title case-insensitive, then id", async () => {
    const { port, store } = setup();
    await store.putSettings({ ...settings(), songsPerDay: 0 });
    await store.putSong(song({ id: "3", title: "banana", dueDate: "2026-10-25", lastReviewed: null }));
    await store.putSong(song({ id: "2", title: "Cherry", dueDate: "2026-10-24", lastReviewed: null }));
    await store.putSong(song({ id: "1", title: "apple", dueDate: "2026-10-25", lastReviewed: null }));
    await store.putSong(song({ id: "4", title: "Apple", dueDate: "2026-10-25", lastReviewed: null }));
    expect((await port.listSongs()).map((s) => s.id)).toEqual(["2", "1", "4", "3"]);
  });

  describe("songsPerDay", () => {
    it("falls back to the config default with no Settings record", async () => {
      const { port } = setup();
      expect(await port.getSongsPerDay()).toBe(config.songsPerDay);
    });
    it("rounds, clamps, rejects non-finite", async () => {
      const { port, store } = setup();
      await port.setSongsPerDay(3.6);
      expect(await port.getSongsPerDay()).toBe(4);
      await port.setSongsPerDay(99);
      expect(await port.getSongsPerDay()).toBe(config.maxSongsPerDay);
      await port.setSongsPerDay(-1);
      expect(await port.getSongsPerDay()).toBe(0);
      await expect(port.setSongsPerDay(NaN)).rejects.toBeInstanceOf(RangeError);
      await expect(port.setSongsPerDay(Infinity)).rejects.toBeInstanceOf(RangeError);
      expect((await store.getSettings())!.songsPerDay).toBe(0);
    });
    it("keeps other settings and persists across a second port on the same store", async () => {
      const { port, store } = setup();
      await store.putSettings({ songsPerDay: 3, suggestionPeriod: "weekly", timerSound: false, timerVibrate: true, timerOvertime: false, metronomeBpm: 80 });
      await port.setSongsPerDay(7);
      expect(await makeRepertoirePort(store, deps()).getSongsPerDay()).toBe(7);
      expect(await store.getSettings()).toMatchObject({ suggestionPeriod: "weekly", timerSound: false, metronomeBpm: 80, songsPerDay: 7 });
    });
  });
});

describe("repertoirePort bulk add partial failure (t019)", () => {
  const failing = (store: Store, failOn: number) => {
    let puts = 0;
    return {
      ...store,
      getSettings: () => store.getSettings(),
      listSongs: () => store.listSongs(),
      getSong: (id: string) => store.getSong(id),
      putSong: async (s: Parameters<Store["putSong"]>[0]) => {
        if (++puts === failOn) throw new Error("disk full");
        return store.putSong(s);
      },
    } as unknown as Store;
  };
  it("a failure after the first write reports the partial result", async () => {
    const { store } = setup();
    const res = await makeRepertoirePort(failing(store, 2), deps()).addSongs(["A", "B", "C"]);
    expect(res).toEqual({ added: 1, skipped: 0, error: "disk full" });
    expect((await store.listSongs()).map((s) => s.title)).toEqual(["A"]);
  });
  it("a failure on the first write still throws; success has no error key", async () => {
    const { store, port } = setup();
    await expect(makeRepertoirePort(failing(store, 1), deps()).addSongs(["A"])).rejects.toThrow("disk full");
    expect(await port.addSongs(["X", "Y"])).toEqual({ added: 2, skipped: 0 });
  });
});

describe("repertoirePort add-time due rule (t014)", () => {
  it("first songsPerDay adds to an empty repertoire are due today; later ones are due tomorrow or later", async () => {
    const { port, store } = setup();
    await port.setSongsPerDay(2);
    await port.addSongs(["A", "B", "C", "D", "E"]);
    const due = Object.fromEntries((await store.listSongs()).map((s) => [s.title, s.dueDate]));
    expect(due.A).toBe("2026-10-23");
    expect(due.B).toBe("2026-10-23");
    for (const t of ["C", "D", "E"]) expect(due[t]! > "2026-10-23").toBe(true);
  });
  it("single adds on an empty-start day are due today up to songsPerDay, then wait", async () => {
    const { port, store } = setup();
    await port.setSongsPerDay(2);
    for (const t of ["A", "B", "C"]) await port.addSong(t);
    const due = Object.fromEntries((await store.listSongs()).map((s) => [s.title, s.dueDate]));
    expect(due.A).toBe("2026-10-23");
    expect(due.B).toBe("2026-10-23");
    expect(due.C! > "2026-10-23").toBe(true);
  });
  it("a song added to a non-empty repertoire is never due today", async () => {
    const { port, store } = setup();
    await store.putSong(song({ id: "old", dueDate: "2026-11-30" }));
    await port.addSong("New");
    const added = (await store.listSongs()).find((s) => s.title === "New")!;
    expect(added.dueDate > "2026-10-23").toBe(true);
  });

  describe("repertoire top-up (t016)", () => {
    const DAY = "2026-10-23";
    const fut = (id: string, dueDate: string, o = {}) => song({ id, dueDate, lastReviewed: null, ...o });
    const counting = (store: Store, opts: { failPut?: boolean; onList?: () => Promise<void> } = {}) => {
      const c = { puts: 0 };
      const wrapped = {
        getSettings: () => store.getSettings(),
        getSong: (id: string) => store.getSong(id),
        listSongs: async () => {
          const r = await store.listSongs();
          await opts.onList?.();
          return r;
        },
        putSong: async (s: Parameters<Store["putSong"]>[0]) => {
          c.puts++;
          if (opts.failPut) throw new Error("boom");
          return store.putSong(s);
        },
      };
      return { c, wrapped };
    };
    const seed = async (store: Store, spd = 3) => {
      await store.putSettings({ ...settings(), songsPerDay: spd });
      await store.putSong(fut("a", DAY));
      await store.putSong(fut("b", "2026-10-25"));
      await store.putSong(fut("c", "2026-10-26"));
      await store.putSong(fut("d", "2026-10-28"));
    };

    it("Repertoire-first: the two soonest read as today, the third keeps its date", async () => {
      const { port, store } = setup();
      await seed(store);
      const listed = await port.listSongs();
      const byId = new Map(listed.map((s) => [s.id, s.dueDate]));
      expect(byId.get("b")).toBe(DAY);
      expect(byId.get("c")).toBe(DAY);
      expect(byId.get("d")).toBe("2026-10-28");
      const stored = await store.listSongs();
      expect(stored.find((s) => s.id === "b")!.dueDate).toBe(DAY);
      expect(stored.find((s) => s.id === "c")!.dueDate).toBe(DAY);
      expect(stored.find((s) => s.id === "d")!.dueDate).toBe("2026-10-28");
      expect(dueText(byId.get("b")!, DAY)).toBe("today");
    });

    it("second call makes no writes", async () => {
      const { store } = setup();
      await seed(store);
      const { c, wrapped } = counting(store);
      const port = makeRepertoirePort({ ...store, ...wrapped, deleteSong: (id: string) => store.deleteSong(id), putSettings: (x: Parameters<Store["putSettings"]>[0]) => store.putSettings(x) } as unknown as Store, deps());
      await port.listSongs();
      expect(c.puts).toBe(2);
      await port.listSongs();
      expect(c.puts).toBe(2);
    });

    it("a song already rated today is kept and not re-pulled", async () => {
      const { port, store } = setup();
      await store.putSettings({ ...settings(), songsPerDay: 1 });
      await store.putSong(song({ id: "r", lastReviewed: DAY, dueDate: "2026-10-30" }));
      await store.putSong(fut("f", "2026-10-25"));
      const listed = await port.listSongs();
      expect(listed.find((s) => s.id === "r")!.dueDate).toBe("2026-10-30");
      expect(listed.find((s) => s.id === "f")!.dueDate).toBe("2026-10-25");
    });

    it("songsPerDay 0 and an empty repertoire make no writes", async () => {
      const a = setup();
      await a.store.putSettings({ ...settings(), songsPerDay: 0 });
      await a.store.putSong(fut("a", "2026-10-30"));
      const ca = counting(a.store);
      await makeRepertoirePort(ca.wrapped as unknown as Store, deps()).listSongs();
      expect(ca.c.puts).toBe(0);
      const b = setup();
      const cb = counting(b.store);
      expect(await makeRepertoirePort(cb.wrapped as unknown as Store, deps()).listSongs()).toEqual([]);
      expect(cb.c.puts).toBe(0);
    });

    it("a failing write still returns the list without rejecting", async () => {
      const { store } = setup();
      await seed(store);
      const { wrapped } = counting(store, { failPut: true });
      const listed = await makeRepertoirePort(wrapped as unknown as Store, deps()).listSongs();
      expect(listed.map((s) => s.id).sort()).toEqual(["a", "b", "c", "d"]);
      expect(listed.find((s) => s.id === "b")!.dueDate).toBe("2026-10-25");
    });

    it("a rename between the read and the write is not overwritten", async () => {
      const { store } = setup();
      await seed(store);
      let done = false;
      const { wrapped } = counting(store, {
        onList: async () => {
          if (done) return;
          done = true;
          await store.putSong({ ...(await store.getSong("b"))!, title: "Renamed" });
        },
      });
      await makeRepertoirePort(wrapped as unknown as Store, deps()).listSongs();
      const b = (await store.getSong("b"))!;
      expect(b.title).toBe("Renamed");
      expect(b.dueDate).toBe(DAY);
    });

    it("a song rated between the read and the write is not pulled", async () => {
      const { store } = setup();
      await seed(store);
      let done = false;
      const { wrapped } = counting(store, {
        onList: async () => {
          if (done) return;
          done = true;
          await store.putSong({ ...(await store.getSong("b"))!, lastReviewed: DAY, dueDate: "2026-10-30" });
        },
      });
      const listed = await makeRepertoirePort(wrapped as unknown as Store, deps()).listSongs();
      expect((await store.getSong("b"))!.dueDate).toBe("2026-10-30");
      // The list shows the fresh record, not the stale pulled-ahead guess.
      expect(listed.find((s) => s.id === "b")!.dueDate).toBe("2026-10-30");
    });

    it("a song deleted between the read and the write is absent from the list", async () => {
      const { store } = setup();
      await seed(store);
      let done = false;
      const { wrapped } = counting(store, {
        onList: async () => {
          if (done) return;
          done = true;
          await store.deleteSong("b");
        },
      });
      const listed = await makeRepertoirePort(wrapped as unknown as Store, deps()).listSongs();
      expect(listed.map((s) => s.id)).not.toContain("b");
      expect(await store.getSong("b")).toBeUndefined();
    });
  });
});
