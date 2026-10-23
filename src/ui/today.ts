import { config } from "../config";
import { todayLocal } from "../dates";
import { isDoneToday, isDueToday } from "../today/due";
import { formatDate, formatSummary, summarize } from "../today/summary";
import { TimerController, formatOvertime, formatRemaining } from "../today/timer";
import { applyUndo, prepareUndo, type Undo } from "../today/undo";
import { browserFeedbackEnv, createFeedback, type Feedback } from "./feedback";
import { h } from "./h";
import { browserMetronomeEnv, createMetronomePanel, type MetronomeEnv } from "./metronome";
import { icon } from "./icons";
import type { SongRating, SongSnapshot, TaskItem, TaskSnapshot, TimerPrefs, TodayPort, TodaySong } from "./ports";
import { openSheet, type Sheet } from "./sheet";
import { attachSwipe } from "./swipe";
import { attachSwipeReveal } from "./swipeReveal";
import { taskColor } from "./taskColor";

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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function todayView(env: TodayEnv): { el: HTMLElement; dispose: () => void } {
  let tasks: TaskItem[] = [];
  let prefs: TimerPrefs = { ...config.timer };
  let undo: Undo | null = null;
  let cancelToast: (() => void) | null = null;
  let cancelTick: (() => void) | null = null;
  let disposed = false;
  let editing: TaskItem | null = null;
  let editMode = false;
  let deleting = false;
  let songs: TodaySong[] = [];
  let songsPerDay = 0;
  /** Rating labels live in memory only; after a reload a rated row reads "Rated". */
  const songRatings = new Map<string, SongRating>();
  let openSong: string | null = null;
  let songRowDetach: (() => void)[] = [];

  const timer = new TimerController({
    now: env.now,
    graceMs: config.today.chimeGraceMs,
    overtime: () => prefs.overtime,
    onChime: () => env.feedback.chime(prefs),
  });

  const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const entering = new Set<string>();
  let doneOpen = true;
  let sheet: Sheet | null = null;

  const todoList = h("ul", { class: "task-list inset-list" });
  const doneList = h("ul", { class: "task-list inset-list" });
  const toast = h("div", { class: "toast", role: "status" });
  const errorEl = h("p", { class: "error", role: "alert" });
  const dateEl = h("p", { class: "date" });
  const summaryEl = h("p", { class: "summary" });
  const addBtn = h("button", { type: "button", class: "add-btn", "aria-label": "Add task", onClick: () => openForm() }, icon("plus"));
  const editToggle = h("button", { type: "button", class: "edit-toggle", onClick: () => toggleEditMode() }, "Edit");
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
    { class: "today" },
    h("header", { class: "large-header" }, h("div", { class: "title-row" }, h("h1", { class: "large-title" }, "Today"), editToggle, addBtn), dateEl, summaryEl, metronome.el),
    emptyDue,
    todoGroup,
    songSection,
    doneGroup,
    toast,
  );
  el.style.setProperty("--move-ms", `${config.today.moveMs}ms`);
  el.style.setProperty("--spring-ms", `${config.today.springMs}ms`);
  const detach: (() => void)[] = [];
  let rowDetach: (() => void)[] = [];

  const toggleDone = () => {
    doneOpen = !doneOpen;
    render();
  };

  const syncToggle = () => {
    editToggle.textContent = editMode ? "Done" : "Edit";
  };
  const toggleEditMode = () => {
    editMode = !editMode;
    syncToggle();
    render();
  };

  const isRunning = (id: string) => {
    const s = timer.snapshot();
    return s.taskId === id && (s.phase === "running" || s.phase === "overtime" || s.phase === "timesup");
  };

  const overtimeNow = () => {
    const p = timer.snapshot().phase;
    return p === "overtime" || p === "timesup";
  };

  const timeText = (): string => {
    const s = timer.snapshot();
    if (s.phase === "running") return formatRemaining(s.remainingMs);
    if (s.phase === "overtime") return formatOvertime(s.overtimeMs);
    if (s.phase === "timesup") return "0:00 time up";
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

  const start = (task: TaskItem) => {
    timer.start(task.id, task.minutes * 60000);
    env.feedback.prime();
    env.feedback.acquireWakeLock();
    startTick();
    render();
  };

  const finish = async (task: TaskItem) => {
    timer.done();
    stopTick();
    env.feedback.releaseWakeLock();
    const prev = task.lastCompletedOn;
    const date = todayLocal(new Date(env.now()));
    try {
      await env.port.setCompleted(task.id, date);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save");
      render();
      return;
    }
    task.lastCompletedOn = date;
    if (!reduceMotion()) entering.add(task.id);
    undo = prepareUndo(task.id, prev, env.now());
    showToast("Done", () => void doUndo());
    render();
  };

  const hideToast = () => {
    cancelToast?.();
    cancelToast = null;
    undo = null;
    toast.replaceChildren();
  };

  /** One toast element: a new toast replaces the previous one (and its Undo). */
  const showToast = (msg: string, onUndo?: () => void) => {
    cancelToast?.();
    const kids = [h("span", null, onUndo ? `${msg} · ` : msg)];
    if (onUndo) kids.push(h("button", { type: "button", class: "undo", onClick: onUndo }, "Undo"));
    toast.replaceChildren(...kids);
    cancelToast = env.after(hideToast, config.today.undoMs);
  };

  const doUndo = async () => {
    const u = undo;
    if (!u) return;
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
    const cls = "task" + (done ? " done" : "") + (running ? " running" : "") + (running && overtimeNow() ? " overtime" : "") + (entering.has(t.id) ? " entering" : "") + (editMode ? " editing" : "");
    const common = [
      h("span", { class: "dot", style: `background:${taskColor(t.id)}` }),
      h("span", { class: "name" }, t.name),
      h("span", { class: "mins" }, `${t.minutes} min`),
      h("span", { class: "time", "data-id": t.id }, running ? timeText() : ""),
    ];
    if (editMode) {
      // Edit mode: the whole row body opens the edit sheet; no start/stop button and no swipe.
      const body = h(
        "div",
        {
          class: "row-body",
          role: "button",
          tabindex: "0",
          "aria-label": `Edit ${t.name}`,
          "data-edit": t.id,
          onClick: () => openForm(t),
          onKeydown: (ev: Event) => {
            const e = ev as KeyboardEvent;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openForm(t);
            }
          },
        },
        ...common,
        done ? h("span", { class: "status" }, "✓ done") : null,
        h("span", { class: "chev" }, icon("chevron")),
      );
      return h("li", { class: cls, "data-id": t.id }, body);
    }
    const bg = h("div", { class: "swipe-bg " + (running ? "finish" : "start"), "aria-hidden": "true" }, icon(running ? "check" : "play"));
    const body = h(
      "div",
      { class: "row-body" },
      ...common,
      done
        ? h("span", { class: "status" }, "✓ done")
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
    const activeData = (document.activeElement as HTMLElement | null)?.dataset;
    const focusSel = activeData?.act ? `[data-act="${activeData.act}"]` : activeData?.edit ? `[data-edit="${activeData.edit}"]` : "";
    const now = new Date(env.now());
    const today = todayLocal(now);
    for (const d of rowDetach) d();
    rowDetach = [];
    const due = tasks.filter((t) => isDueToday(t, now));
    const todo = due.filter((t) => !isDoneToday(t, today));
    const done = due.filter((t) => isDoneToday(t, today));
    const sum = summarize(due, today);
    dateEl.textContent = formatDate(now);
    summaryEl.textContent = formatSummary(sum);
    todoList.replaceChildren(...todo.map((t) => makeRow(t, today)));
    doneList.replaceChildren(...done.map((t) => makeRow(t, today)));
    entering.clear();
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

  const setOpenSong = (id: string | null) => {
    if (openSong === id) return;
    openSong = id;
    renderSongs();
  };

  const makeSongRow = (s: TodaySong): HTMLElement => {
    const interactive = !s.ratedToday && !editMode;
    const open = interactive && openSong === s.id;
    const label = songRatings.get(s.id) ?? "Rated";
    const cls = "song" + (s.ratedToday ? " rated" : "") + (open ? " open" : "") + (editMode ? " editing" : "");
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
    const body = h("div", bodyAttrs, h("span", { class: "name" }, s.title), s.ratedToday ? h("span", { class: "status" }, label) : null);
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
    if (editMode) openSong = null;
    songSection.hidden = songsPerDay <= 0;
    songEmpty.hidden = songs.length > 0;
    songDone.hidden = !(songs.length > 0 && songs.every((x) => x.ratedToday));
    songList.hidden = songs.length === 0;
    songList.replaceChildren(...songs.map(makeSongRow));
    if (focusId) el.querySelector<HTMLElement>(`[data-song-body="${focusId}"]`)?.focus();
  };

  const loadSongs = async () => {
    try {
      const r = await env.port.listTodaySongs();
      songs = r.songs;
      songsPerDay = r.songsPerDay;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load songs");
    }
    renderSongs();
  };

  const rateSongRow = async (id: string, rating: SongRating) => {
    const s = songs.find((x) => x.id === id);
    if (!s || s.ratedToday) return;
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
    s.ratedToday = true;
    openSong = null;
    // One toast: this replaces a pending task toast (and its Undo button).
    showToast(`Rated ${s.title} ${rating}`, () => void undoRating(id, snap));
    renderSongs();
  };

  const undoRating = async (id: string, snap: SongSnapshot) => {
    hideToast();
    try {
      await env.port.restoreTodaySong(snap);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not restore");
      return;
    }
    songRatings.delete(id);
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

  const load = async () => {
    try {
      [tasks, prefs] = await Promise.all([env.port.listTasks(), env.port.getTimerPrefs()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load tasks");
    }
    render();
  };

  // Add-task sheet.
  const nameIn = h("input", { type: "text", name: "name", required: true, id: "task-name", autocomplete: "off" });
  const minsIn = h("input", {
    type: "number",
    name: "minutes",
    id: "task-minutes",
    inputmode: "numeric",
    min: config.timer.minMinutes,
    max: config.timer.maxMinutes,
    value: 10,
  });
  const dailyIn = h("input", { type: "checkbox", name: "daily", id: "task-daily", checked: true });
  const dayIns = DAY_NAMES.map((d, i) => h("input", { type: "checkbox", name: "day", value: i, "aria-label": d }));
  const chip = (input: HTMLInputElement, text: string) => h("label", { class: "chip" }, input, h("span", null, text));
  const submitBtn = h("button", { type: "submit" }, "Add");
  const deleteBtn = h("button", { type: "button", class: "danger", onClick: () => void remove() }, "Delete");
  const actions = h(
    "div",
    { class: "sheet-actions" },
    h("button", { type: "button", class: "cancel", onClick: () => sheet?.close() }, "Cancel"),
    submitBtn,
  );
  const form = h(
    "form",
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        void submit();
      },
    },
    h("label", { class: "field" }, "Name", nameIn),
    h("label", { class: "field" }, "Minutes", minsIn),
    h("fieldset", { class: "chips" }, h("legend", null, "Repeat"), chip(dailyIn, "Daily"), DAY_NAMES.map((d, i) => chip(dayIns[i]!, d))),
    errorEl,
    actions,
  );
  const setError = (m: string) => {
    errorEl.textContent = m;
  };
  /** Opens the shared sheet: empty "Add task" form, or "Edit task" pre-filled from `task`. */
  const openForm = (task?: TaskItem) => {
    if (sheet || disposed) return;
    editing = task ?? null;
    deleting = false;
    deleteBtn.disabled = false;
    setError("");
    nameIn.value = task ? task.name : "";
    minsIn.value = String(task ? task.minutes : 10);
    const days = task ? task.days : "daily";
    dailyIn.checked = days === "daily";
    dayIns.forEach((c, i) => (c.checked = days !== "daily" && days.includes(i)));
    submitBtn.textContent = task ? "Save" : "Add";
    deleteBtn.remove();
    if (task) actions.insertBefore(deleteBtn, submitBtn);
    sheet = openSheet(form, { title: task ? "Edit task" : "Add task", onClose: () => (sheet = null) });
  };
  const submit = async () => {
    const name = nameIn.value.trim();
    if (!name) return setError("Name is required");
    const days: "daily" | number[] = dailyIn.checked
      ? "daily"
      : dayIns.flatMap((c, i) => (c.checked ? [i] : []));
    if (days !== "daily" && days.length === 0) return setError("Choose Daily or at least one day");
    const patch = { name, minutes: Number(minsIn.value), days };
    try {
      if (editing) {
        // A running task keeps the target fixed at start (timer.ts), so a minutes change applies from the next start;
        // the running row hides .mins via CSS, so nothing visibly changes meanwhile. A name change shows at once.
        await env.port.updateTask(editing.id, patch);
      } else {
        await env.port.addTask(patch);
      }
    } catch (e) {
      return setError(e instanceof Error ? e.message : editing ? "Could not save task" : "Could not add task");
    }
    setError("");
    sheet?.close();
    tasks = await env.port.listTasks();
    render();
  };
  const remove = async () => {
    const task = editing;
    if (!task || deleting) return;
    deleting = true;
    deleteBtn.disabled = true;
    let snap: TaskSnapshot;
    try {
      snap = await env.port.deleteTask(task.id);
    } catch (e) {
      deleting = false;
      deleteBtn.disabled = false;
      return setError(e instanceof Error ? e.message : "Could not delete task");
    }
    // Undo restores the task, not its running state.
    if (isRunning(task.id)) {
      timer.stop();
      stopTick();
      env.feedback.releaseWakeLock();
    }
    sheet?.close();
    // The delete toast replaces any completion toast, so completion undo is dropped.
    undo = null;
    showToast(`Deleted ${snap.name}`, () => void restore(snap));
    tasks = await env.port.listTasks();
    render();
    addBtn.focus();
  };
  const restore = async (snap: TaskSnapshot) => {
    hideToast();
    try {
      await env.port.restoreTask(snap);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not restore");
      return;
    }
    tasks = await env.port.listTasks();
    render();
  };

  detach.push(env.onVisible(updateTimes));
  detach.push(() => document.removeEventListener("pointerdown", onDocPointerDown));
  void load();
  void loadSongs();

  return {
    el,
    dispose() {
      disposed = true;
      metronome.dispose();
      sheet?.close();
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
