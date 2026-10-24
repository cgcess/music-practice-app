import { config } from "../config";
import { todayLocal } from "../dates";
import { isDoneToday, isDueToday } from "../today/due";
import { dayProgress } from "../today/progress";
import { formatDate, formatSummary, summarize } from "../today/summary";
import { TimerController, formatOvertime, formatRemaining, isActive } from "../today/timer";
import { applyUndo, prepareUndo, type Undo } from "../today/undo";
import { browserFeedbackEnv, createFeedback, type Feedback } from "./feedback";
import { h } from "./h";
import { browserMetronomeEnv, createMetronomePanel, type MetronomeEnv } from "./metronome";
import { icon } from "./icons";
import type { SongRating, SongSnapshot, TaskItem, TimerPrefs, TodayPort, TodaySong } from "./ports";
import { createStrengthBar } from "./strengthBar";
import { attachSwipe } from "./swipe";
import { attachSwipeReveal } from "./swipeReveal";
import { createTaskForm } from "./taskForm";

export interface TodayEnv {
  port: TodayPort;
  /** Wall clock in ms. */
  now: () => number;
  feedback: Feedback;
  /** Repeating callback; returns cancel. */
  every: (fn: () => void, ms: number) => () => void;
  /** One-shot callback; returns cancel. */
  after: (fn: () => void, ms: number) => () => void;
  onVisible: (fn: () => void) => () => void;
  /** Metronome audio/timer/visibility seam; defaults to the browser. */
  metronome?: MetronomeEnv;
  /** Timer that outlives this view (the shell rebuilds views on navigation); absent: the view makes its own. */
  timer?: SharedTimer;
}

/** A TimerController whose chime and overtime callbacks are rebound by whichever Today view is mounted. */
export interface SharedTimer {
  controller: TimerController;
  hooks: { onChime: (taskId: string) => void; overtime: () => boolean };
}

export function createSharedTimer(now: () => number): SharedTimer {
  const hooks: SharedTimer["hooks"] = { onChime: () => {}, overtime: () => config.timer.overtime };
  const controller = new TimerController({
    now,
    graceMs: config.today.chimeGraceMs,
    overtime: () => hooks.overtime(),
    onChime: (id) => hooks.onChime(id),
  });
  return { controller, hooks };
}

export function defaultTodayEnv(port: TodayPort): TodayEnv {
  const fenv = browserFeedbackEnv();
  return {
    port,
    now: () => Date.now(),
    feedback: createFeedback(fenv),
    every: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    after: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    onVisible: fenv.onVisible,
  };
}

export function todayView(env: TodayEnv): { el: HTMLElement; dispose: () => void } {
  let tasks: TaskItem[] = [];
  let prefs: TimerPrefs = { sound: config.timer.sound, vibrate: config.timer.vibrate, overtime: config.timer.overtime };
  let undo: Undo | null = null;
  let cancelToast: (() => void) | null = null;
  let cancelTick: (() => void) | null = null;
  let disposed = false;
  let songs: TodaySong[] = [];
  let songsPerDay = 0;
  /** Rating labels live in memory only; after a reload a rated row reads "Rated". */
  const songRatings = new Map<string, SongRating>();
  let openSong: string | null = null;
  let songRowDetach: (() => void)[] = [];
  let tasksLoaded = false;
  let songsLoaded = false;
  let lastDone: number | null = null;
  let pulseSeq = 0;

  const shared = env.timer ?? createSharedTimer(env.now);
  const timer = shared.controller;
  shared.hooks.overtime = () => prefs.overtime;
  shared.hooks.onChime = () => env.feedback.chime(prefs);

  const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const entering = new Set<string>();
  /** Ids whose next rendered row gets the `pop` touch; consumed by render()/renderSongs() like `entering`. */
  const popTasks = new Set<string>();
  const popSongs = new Set<string>();
  let doneOpen = true;

  const todoList = h("ul", { class: "task-list inset-list" });
  const doneList = h("ul", { class: "task-list inset-list" });
  const toast = h("div", { class: "toast", role: "status" });
  const hero = h("div", { class: "hero", "aria-hidden": "true" }, h("div", { class: "layer prog" }), h("div", { class: "layer bloom" }), h("div", { class: "layer glow" }));
  const dateEl = h("p", { class: "date" });
  const summaryEl = h("p", { class: "summary" });
  const addBtn = h("button", { type: "button", class: "add-btn", "aria-label": "Add task", onClick: () => form.open() }, icon("plus"));
  const editToggle = h("button", { type: "button", class: "edit-toggle", onClick: () => {
    location.hash = "#/edit";
  } }, "Edit");
  const strength = createStrengthBar();
  const metronome = createMetronomePanel({ port: env.port, env: env.metronome ?? browserMetronomeEnv() });
  const todoEmpty = h("div", { class: "empty-card" });
  const emptyDue = h("div", { class: "empty-card" }, "No tasks due today. Tap + to add one.");
  const todoGroup = h("section", { class: "group todo" }, h("h2", { class: "group-title" }, "To do"), todoEmpty, todoList);
  const doneToggle = h("button", { type: "button", class: "group-toggle", "aria-expanded": "true", onClick: () => toggleDone() });
  const doneGroup = h("section", { class: "group done-group" }, h("h2", { class: "group-title" }, doneToggle), doneList);
  const songList = h("ul", { class: "song-list inset-list" });
  const songEmpty = h("div", { class: "empty-card" }, "Nothing to play today");
  const songDone = h("p", { class: "songs-done" }, "All done for today");
  const songSection = h("section", { class: "group songs" }, h("h2", { class: "group-title" }, "Songs"), songDone, songEmpty, songList);
  songSection.hidden = true;
  const el = h(
    "section",
    { class: "today no-anim state-rest" },
    hero,
    h("header", { class: "large-header" }, h("div", { class: "title-row" }, h("h1", { class: "large-title" }, "Today"), editToggle, addBtn), dateEl, summaryEl, strength.el, metronome.el),
    emptyDue,
    todoGroup,
    songSection,
    doneGroup,
    toast,
  );
  el.style.setProperty("--move-ms", `${config.today.moveMs}ms`);
  el.style.setProperty("--spring-ms", `${config.today.springMs}ms`);
  const detach: (() => void)[] = [];

  /** Drops the first-paint suppression; called synchronously by every handler that changes progress. */
  const releaseAnim = () => el.classList.remove("no-anim");
  /** Restarts the header glow: two identical keyframes under different names, used alternately. */
  const pulse = () => {
    if (reduceMotion()) return;
    const next = el.classList.contains("pulse-a") ? "pulse-b" : "pulse-a";
    el.classList.remove("pulse-a", "pulse-b");
    el.dataset.pulse = String(++pulseSeq);
    el.classList.add(next);
  };
  const afterFrames = (fn: () => void) => {
    if (typeof requestAnimationFrame !== "function") return fn();
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };
  const loadSettled = () => {
    if (tasksLoaded && songsLoaded) afterFrames(() => !disposed && releaseAnim());
  };
  let rowDetach: (() => void)[] = [];

  const toggleDone = () => {
    doneOpen = !doneOpen;
    render();
  };

  const isRunning = (id: string) => {
    const s = timer.snapshot();
    return s.taskId === id && isActive(s);
  };

  const overtimeNow = () => {
    const sn = timer.snapshot();
    return !sn.paused && (sn.phase === "overtime" || sn.phase === "timesup");
  };

  const timeText = (): string => {
    const s = timer.snapshot();
    const pre = s.paused ? "Paused " : "";
    if (s.phase === "running") return pre + formatRemaining(s.remainingMs);
    if (s.phase === "overtime") return pre + formatOvertime(s.overtimeMs);
    if (s.phase === "timesup") return pre + "0:00 time up";
    return "";
  };

  const updateTimes = () => {
    timer.tick();
    const s = timer.snapshot();
    for (const t of el.querySelectorAll<HTMLElement>(".time")) {
      t.textContent = t.dataset.id === s.taskId ? timeText() : "";
    }
    const over = overtimeNow();
    for (const li of el.querySelectorAll<HTMLElement>("li.task")) {
      li.classList.toggle("overtime", li.classList.contains("running") && li.dataset.id === s.taskId && over);
    }
  };

  const startTick = () => {
    if (!cancelTick) cancelTick = env.every(updateTimes, config.today.tickMs);
  };
  const stopTick = () => {
    cancelTick?.();
    cancelTick = null;
  };

  const act = (task: TaskItem) => {
    if (isRunning(task.id)) void finish(task);
    else if (!isDoneToday(task, todayLocal(new Date(env.now())))) start(task);
  };

  const togglePause = () => {
    if (timer.snapshot().paused) {
      timer.resume();
      startTick();
      env.feedback.acquireWakeLock();
    } else {
      timer.pause();
      stopTick();
      env.feedback.releaseWakeLock();
    }
    render();
  };

  const start = (task: TaskItem) => {
    timer.start(task.id, task.minutes * 60000);
    env.feedback.prime();
    env.feedback.acquireWakeLock();
    startTick();
    render();
  };

  const finish = async (task: TaskItem) => {
    releaseAnim();
    timer.done();
    stopTick();
    env.feedback.releaseWakeLock();
    const prev = task.lastCompletedOn;
    const date = todayLocal(new Date(env.now()));
    try {
      await env.port.setCompleted(task.id, date);
    } catch (e) {
      if (disposed) return;
      showToast(e instanceof Error ? e.message : "Could not save");
      render();
      return;
    }
    task.lastCompletedOn = date;
    if (disposed) return;
    if (!reduceMotion()) {
      entering.add(task.id);
      popTasks.add(task.id);
    }
    pulse();
    undo = prepareUndo(task.id, prev, env.now());
    showToast("Done", () => void doUndo());
    render();
  };

  const hideToast = () => {
    cancelToast?.();
    cancelToast = null;
    undo = null;
    const text = toast.textContent ?? "";
    toast.classList.remove("show");
    toast.replaceChildren();
    if (text && !reduceMotion()) {
      // The live toast empties at once (it is `display: none` when empty); a text-only clone plays the slide-out.
      const ghost = h("div", { class: "toast-leaving", "aria-hidden": "true", inert: true }, text);
      const remove = () => ghost.remove();
      ghost.addEventListener("animationend", remove);
      setTimeout(remove, config.today.toastLeaveMs);
      el.appendChild(ghost);
    }
  };

  /** One toast element: a new toast replaces the previous one (and its Undo). */
  const showToast = (msg: string, onUndo?: () => void) => {
    cancelToast?.();
    const kids = [h("span", null, onUndo ? `${msg} · ` : msg)];
    if (onUndo) kids.push(h("button", { type: "button", class: "undo", onClick: onUndo }, "Undo"));
    toast.replaceChildren(...kids);
    toast.classList.add("show");
    cancelToast = env.after(hideToast, config.today.undoMs);
  };

  const doUndo = async () => {
    const u = undo;
    if (!u) return;
    releaseAnim();
    const res = applyUndo(u, env.now(), config.today.undoMs);
    hideToast();
    if (!res) return;
    await env.port.setCompleted(u.taskId, res.value);
    const t = tasks.find((x) => x.id === u.taskId);
    if (t) t.lastCompletedOn = res.value;
    if (t && !reduceMotion()) entering.add(t.id);
    if (!disposed) render();
  };

  const makeRow = (t: TaskItem, today: string): HTMLElement => {
    const done = isDoneToday(t, today);
    const running = isRunning(t.id);
    const paused = running && timer.snapshot().paused;
    const cls = "task" + (done ? " done" : "") + (running ? " running" : "") + (paused ? " paused" : "") + (running && overtimeNow() ? " overtime" : "") + (entering.has(t.id) ? " entering" : "");
    const common = [
      h("span", { class: "name" }, t.name),
      h("span", { class: "mins" }, `${t.minutes} min`),
      h("span", { class: "time", "data-id": t.id }, running ? timeText() : ""),
    ];
    const bg = h("div", { class: "swipe-bg " + (running ? "finish" : "start"), "aria-hidden": "true" }, icon(running ? "check" : "play"));
    const body = h(
      "div",
      { class: "row-body" },
      ...common,
      done || !running
        ? null
        : h(
            "button",
            {
              type: "button",
              class: "pause",
              "data-pause": t.id,
              "aria-label": (paused ? "Resume " : "Pause ") + t.name,
              onClick: togglePause,
            },
            icon(paused ? "play" : "pause"),
          ),
      done
        ? h("span", { class: "status" + (popTasks.has(t.id) ? " pop" : "") }, "✓ done")
        : h(
            "button",
            {
              type: "button",
              class: "act",
              "data-act": t.id,
              "aria-label": (running ? "Finish " : "Start ") + t.name,
              onClick: () => act(t),
            },
            icon(running ? "check" : "play"),
          ),
    );
    const li = h("li", { class: cls, "data-id": t.id }, done ? null : bg, body);
    if (!done) {
      rowDetach.push(
        attachSwipe(li, () => act(t), {
          onMove: (dx) => {
            li.classList.add("dragging");
            if (dx > 0) body.style.transform = `translateX(${dx}px)`;
            else body.style.removeProperty("transform");
            li.style.setProperty("--reveal", String(Math.min(1, dx / config.today.swipeMinPx)));
          },
          onEnd: (committed) => {
            li.classList.remove("dragging");
            body.style.removeProperty("transform");
            li.style.removeProperty("--reveal");
          },
        }),
      );
    }
    return li;
  };

  const render = () => {
    if (disposed) return;
    const activeEl = (document.activeElement as HTMLElement | null)?.dataset;
    const focusSel = activeEl?.act ? `[data-act="${activeEl.act}"]` : activeEl?.pause ? `[data-pause="${activeEl.pause}"]` : "";
    const now = new Date(env.now());
    const today = todayLocal(now);
    for (const d of rowDetach) d();
    rowDetach = [];
    const due = tasks.filter((t) => isDueToday(t, now));
    const todo = due.filter((t) => !isDoneToday(t, today));
    const done = due.filter((t) => isDoneToday(t, today));
    dateEl.textContent = formatDate(now);
    todoList.replaceChildren(...todo.map((t) => makeRow(t, today)));
    doneList.replaceChildren(...done.map((t) => makeRow(t, today)));
    entering.clear();
    popTasks.clear();
    todoGroup.hidden = due.length === 0;
    todoList.hidden = todo.length === 0;
    todoEmpty.hidden = todo.length > 0;
    todoEmpty.textContent = "All done for today";
    doneGroup.hidden = done.length === 0;
    doneList.hidden = !doneOpen;
    doneToggle.setAttribute("aria-expanded", String(doneOpen));
    doneToggle.replaceChildren(`Done (${done.length})`, icon("chevron"));
    emptyDue.hidden = due.length > 0;
    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus();
    renderSongs();
  };

  /** Gradient depth, state classes and summary, all derived from the same data as the lists (so a reload is correct). */
  const renderHeader = () => {
    const now = new Date(env.now());
    const today = todayLocal(now);
    const prog = dayProgress({ tasks, songs, songsPerDay, songsLoaded: songsLoaded && tasksLoaded, now, today });
    el.style.setProperty("--p", String(prog.state === "done" ? 1 : prog.fraction));
    el.classList.toggle("state-rest", prog.state === "rest");
    el.classList.toggle("state-partial", prog.state === "partial");
    el.classList.toggle("state-daydone", prog.state === "done");
    const sum = summarize(
      tasks.filter((t) => isDueToday(t, now)),
      today,
    );
    if (prog.state === "done") {
      summaryEl.textContent = "Day done";
    } else {
      const text = formatSummary(sum);
      if (sum.due > 0) {
        const n = String(sum.done);
        const tick = lastDone !== null && lastDone !== sum.done && !reduceMotion();
        summaryEl.replaceChildren(h("span", { class: "n" + (tick ? " tick" : "") }, n), text.slice(n.length));
      } else {
        summaryEl.textContent = text;
      }
    }
    lastDone = sum.done;
  };

  const setOpenSong = (id: string | null) => {
    if (openSong === id) return;
    openSong = id;
    renderSongs();
  };

  const makeSongRow = (s: TodaySong): HTMLElement => {
    const interactive = !s.ratedToday;
    const open = interactive && openSong === s.id;
    const label = songRatings.get(s.id) ?? "Rated";
    const popped = popSongs.has(s.id);
    const cls = "song" + (s.ratedToday ? " rated" : "") + (popped ? " settle" : "") + (open ? " open" : "");
    const toggle = () => setOpenSong(openSong === s.id ? null : s.id);
    const bodyAttrs = interactive
      ? {
          class: "row-body",
          role: "button",
          tabindex: "0",
          "aria-expanded": String(open),
          "data-song-body": s.id,
          onClick: toggle,
          onKeydown: (ev: Event) => {
            const e = ev as KeyboardEvent;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          },
        }
      : s.ratedToday
        ? { class: "row-body", role: "button", "aria-disabled": "true" }
        : { class: "row-body" };
    const body = h("div", bodyAttrs, h("span", { class: "name" }, s.title), s.ratedToday ? h("span", { class: "status" + (popped ? " pop" : "") }, label) : null);
    if (!interactive) return h("li", { class: cls, "data-song": s.id }, body);
    const actions = h(
      "div",
      { class: "song-actions" },
      config.sr.ratingScale.map((r) =>
        h("button", { type: "button", class: `rate rate-${r}`, "aria-label": `Rate ${s.title} ${r}`, onClick: () => void rateSongRow(s.id, r) }, r),
      ),
    );
    const li = h("li", { class: cls, "data-song": s.id }, actions, body);
    songRowDetach.push(
      attachSwipeReveal(li, {
        onMove: (dx) => {
          if (openSong === s.id) return;
          li.classList.add("dragging");
          li.style.setProperty("--drag", `${Math.min(0, dx)}px`);
        },
        onEnd: () => {
          li.classList.remove("dragging");
          li.style.removeProperty("--drag");
        },
        onOpen: () => setOpenSong(s.id),
        onClose: () => {
          if (openSong === s.id) setOpenSong(null);
        },
      }),
    );
    return li;
  };

  const renderSongs = () => {
    if (disposed) return;
    const focusId = (document.activeElement as HTMLElement | null)?.dataset?.songBody;
    for (const d of songRowDetach) d();
    songRowDetach = [];
    songSection.hidden = songsPerDay <= 0;
    songEmpty.hidden = songs.length > 0;
    songDone.hidden = !(songs.length > 0 && songs.every((x) => x.ratedToday));
    songList.hidden = songs.length === 0;
    songList.replaceChildren(...songs.map(makeSongRow));
    popSongs.clear();
    renderHeader();
    if (focusId) el.querySelector<HTMLElement>(`[data-song-body="${focusId}"]`)?.focus();
  };

  /** Whole-repertoire bar; independent of today's songs (shown even when songsPerDay is 0). */
  const refreshStrength = (animate: boolean) => void strength.refresh(() => env.port.repertoireStrength(), animate);

  const loadSongs = async () => {
    refreshStrength(false);
    try {
      const r = await env.port.listTodaySongs();
      songs = r.songs;
      songsPerDay = r.songsPerDay;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load songs");
    } finally {
      songsLoaded = true;
    }
    renderSongs();
    loadSettled();
  };

  const rateSongRow = async (id: string, rating: SongRating) => {
    const s = songs.find((x) => x.id === id);
    if (!s || s.ratedToday) return;
    releaseAnim();
    const hadRateFocus = !!(document.activeElement as HTMLElement | null)?.closest?.(".rate");
    let snap: SongSnapshot;
    try {
      snap = await env.port.rateTodaySong(id, rating);
    } catch (e) {
      openSong = null;
      showToast(e instanceof Error ? e.message : "Could not save rating");
      await loadSongs();
      return;
    }
    songRatings.set(id, rating);
    refreshStrength(true);
    s.ratedToday = true;
    openSong = null;
    if (!reduceMotion()) popSongs.add(id);
    pulse();
    // One toast: this replaces a pending task toast (and its Undo button).
    showToast(`Rated ${s.title} ${rating}`, () => void undoRating(id, snap));
    renderSongs();
    // The focused rate button was just replaced; keep keyboard users in place by moving to Undo.
    if (hadRateFocus) el.querySelector<HTMLElement>(".toast .undo")?.focus();
  };

  const undoRating = async (id: string, snap: SongSnapshot) => {
    releaseAnim();
    hideToast();
    try {
      await env.port.restoreTodaySong(snap);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not restore");
      return;
    }
    songRatings.delete(id);
    refreshStrength(true);
    const s = songs.find((x) => x.id === id);
    if (s) s.ratedToday = false;
    renderSongs();
  };

  // A tap outside the open row closes it; taps on other interactive song rows are left to that row.
  const onDocPointerDown = (e: Event) => {
    if (openSong === null) return;
    const li = (e.target as Element | null)?.closest?.("li.song");
    if (li && !li.classList.contains("rated")) return;
    setOpenSong(null);
  };
  document.addEventListener("pointerdown", onDocPointerDown);

  let resumed = false;
  const load = async () => {
    try {
      [tasks, prefs] = await Promise.all([env.port.listTasks(), env.port.getTimerPrefs()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load tasks");
    } finally {
      tasksLoaded = true;
    }
    // Chime (within grace) only once the user's sound/vibrate prefs are known.
    if (resumed && !disposed) timer.tick();
    render();
    loadSettled();
  };

  const reloadTasks = async () => {
    tasks = await env.port.listTasks();
    render();
  };
  // Today only adds; editing, deleting and Undo live on the edit page.
  const form = createTaskForm({ port: env.port, onChanged: reloadTasks });

  detach.push(env.onVisible(updateTimes));
  // Back from the edit page with a timer still running: resume ticking and the wake lock; a due chime fires only within grace.
  if (["running", "overtime", "timesup"].includes(timer.snapshot().phase)) {
    if (!timer.snapshot().paused) {
      startTick();
      env.feedback.acquireWakeLock();
    }
    resumed = true;
  }
  detach.push(() => document.removeEventListener("pointerdown", onDocPointerDown));
  void load();
  void loadSongs();

  return {
    el,
    dispose() {
      disposed = true;
      metronome.dispose();
      form.dispose();
      stopTick();
      cancelToast?.();
      for (const d of detach) d();
      for (const d of rowDetach) d();
      for (const d of songRowDetach) d();
      env.feedback.releaseWakeLock();
      env.feedback.dispose();
    },
  };
}
