import { config } from "../config";
import { todayLocal } from "../dates";
import { isDoneToday, isDueToday } from "../today/due";
import { TimerController, formatOvertime, formatRemaining } from "../today/timer";
import { applyUndo, prepareUndo, type Undo } from "../today/undo";
import { browserFeedbackEnv, createFeedback, type Feedback } from "./feedback";
import { h } from "./h";
import type { TaskItem, TimerPrefs, TodayPort } from "./ports";
import { attachSwipe } from "./swipe";

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
  let formError = "";

  const timer = new TimerController({
    now: env.now,
    graceMs: config.today.chimeGraceMs,
    overtime: () => prefs.overtime,
    onChime: () => env.feedback.chime(prefs),
  });

  const list = h("ul", { class: "task-list" });
  const toast = h("div", { class: "toast", role: "status" });
  const errorEl = h("p", { class: "error", role: "alert" });
  const el = h("section", { class: "today" }, h("h1", null, "Today"), list, toast);
  const detach: (() => void)[] = [];
  let rowDetach: (() => void)[] = [];

  const isRunning = (id: string) => {
    const s = timer.snapshot();
    return s.taskId === id && (s.phase === "running" || s.phase === "overtime" || s.phase === "timesup");
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
    for (const t of list.querySelectorAll<HTMLElement>(".time")) {
      t.textContent = t.dataset.id === s.taskId ? timeText() : "";
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
    undo = prepareUndo(task.id, prev, env.now());
    showToast("Done", true);
    render();
  };

  const hideToast = () => {
    cancelToast?.();
    cancelToast = null;
    undo = null;
    toast.replaceChildren();
  };

  const showToast = (msg: string, withUndo = false) => {
    cancelToast?.();
    const kids = [h("span", null, withUndo ? `${msg} · ` : msg)];
    if (withUndo) kids.push(h("button", { type: "button", class: "undo", onClick: () => void doUndo() }, "Undo"));
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
    if (!disposed) render();
  };

  const render = () => {
    if (disposed) return;
    const focusId = (document.activeElement as HTMLElement | null)?.dataset?.act;
    const now = new Date(env.now());
    const today = todayLocal(now);
    for (const d of rowDetach) d();
    rowDetach = [];
    const rows = tasks
      .filter((t) => isDueToday(t, now))
      .map((t) => {
        const done = isDoneToday(t, today);
        const running = isRunning(t.id);
        const li = h(
          "li",
          { class: "task" + (done ? " done" : "") + (running ? " running" : ""), "data-id": t.id },
          h("span", { class: "name" }, t.name),
          h("span", { class: "mins" }, `${t.minutes} min`),
          h("span", { class: "time", "data-id": t.id }, running ? timeText() : ""),
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
                running ? "✓" : "▶",
              ),
        );
        if (!done) rowDetach.push(attachSwipe(li, () => act(t)));
        return li;
      });
    list.replaceChildren(...rows);
    if (focusId) list.querySelector<HTMLElement>(`[data-act="${focusId}"]`)?.focus();
  };

  const load = async () => {
    try {
      [tasks, prefs] = await Promise.all([env.port.listTasks(), env.port.getTimerPrefs()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load tasks");
    }
    render();
  };

  // Add-task form.
  const nameIn = h("input", { type: "text", name: "name", required: true, id: "task-name" });
  const minsIn = h("input", {
    type: "number",
    name: "minutes",
    id: "task-minutes",
    min: config.timer.minMinutes,
    max: config.timer.maxMinutes,
    value: 10,
  });
  const dailyIn = h("input", { type: "checkbox", name: "daily", id: "task-daily", checked: true });
  const dayIns = DAY_NAMES.map((d, i) => h("input", { type: "checkbox", name: "day", value: i, "aria-label": d }));
  const form = h(
    "form",
    {
      onSubmit: (e) => {
        e.preventDefault();
        void submit();
      },
    },
    h("label", null, "Name ", nameIn),
    h("label", null, "Minutes ", minsIn),
    h("label", null, dailyIn, " Daily"),
    h("fieldset", null, h("legend", null, "Days"), DAY_NAMES.map((d, i) => h("label", null, dayIns[i]!, ` ${d}`))),
    errorEl,
    h("button", { type: "submit" }, "Add task"),
  );
  const setError = (m: string) => {
    formError = m;
    errorEl.textContent = formError;
  };
  const submit = async () => {
    const name = nameIn.value.trim();
    if (!name) return setError("Name is required");
    const days: "daily" | number[] = dailyIn.checked
      ? "daily"
      : dayIns.flatMap((c, i) => (c.checked ? [i] : []));
    if (days !== "daily" && days.length === 0) return setError("Choose Daily or at least one day");
    try {
      await env.port.addTask({ name, minutes: Number(minsIn.value), days });
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Could not add task");
    }
    setError("");
    nameIn.value = "";
    tasks = await env.port.listTasks();
    render();
  };
  el.append(h("details", { class: "add" }, h("summary", null, "Add task"), form));

  detach.push(env.onVisible(updateTimes));
  void load();

  return {
    el,
    dispose() {
      disposed = true;
      stopTick();
      cancelToast?.();
      for (const d of detach) d();
      for (const d of rowDetach) d();
      env.feedback.releaseWakeLock();
      env.feedback.dispose();
    },
  };
}
