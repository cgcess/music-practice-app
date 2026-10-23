import { config } from "../config";
import { h } from "./h";
import { icon } from "./icons";
import { browserFeedbackEnv, createFeedback, type Feedback } from "./feedback";
import type { TaskItem, TodayPort } from "./ports";
import { createTaskForm, formatDays } from "./taskForm";
import type { SharedTimer } from "./today";

export interface EditTasksEnv {
  port: TodayPort;
  /** The timer shared with Today; deleting the running task stops it. */
  timer?: SharedTimer;
  /** Used only to release the wake lock when the running task is deleted; absent: made on demand. */
  feedback?: Feedback;
  /** One-shot callback; returns cancel. Defaults to setTimeout. */
  after?: (fn: () => void, ms: number) => () => void;
}

/** `#/edit`: every task, whatever its days, opening the shared edit sheet. */
export function editTasksView(env: EditTasksEnv): { el: HTMLElement; dispose: () => void } {
  let tasks: TaskItem[] = [];
  let disposed = false;
  let cancelToast: (() => void) | null = null;
  let ownFeedback: Feedback | null = null;
  const after =
    env.after ??
    ((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });

  const list = h("ul", { class: "task-list inset-list" });
  const empty = h("div", { class: "empty-card" }, "No tasks yet. Tap + to add one.");
  const toast = h("div", { class: "toast", role: "status" });
  const addBtn = h("button", { type: "button", class: "add-btn", "aria-label": "Add task", onClick: () => form.open() }, icon("plus"));
  const back = h("a", { class: "back-link", href: "#/today", "aria-label": "Back to Today" }, "Today");
  const el = h(
    "section",
    { class: "edit-page" },
    h("header", { class: "large-header" }, back, h("div", { class: "title-row" }, h("h1", { class: "large-title" }, "Edit tasks"), addBtn)),
    empty,
    list,
    toast,
  );

  const hideToast = () => {
    cancelToast?.();
    cancelToast = null;
    toast.classList.remove("show");
    toast.replaceChildren();
  };
  const showToast = (msg: string, onUndo?: () => void) => {
    cancelToast?.();
    const kids = [h("span", null, onUndo ? `${msg} · ` : msg)];
    if (onUndo) kids.push(h("button", { type: "button", class: "undo", onClick: onUndo }, "Undo"));
    toast.replaceChildren(...kids);
    toast.classList.add("show");
    cancelToast = after(hideToast, config.today.undoMs);
  };

  const rowFor = (id: string) => el.querySelector<HTMLElement>(`[data-edit="${id}"]`);
  const makeRow = (t: TaskItem): HTMLElement => {
    const open = () => form.open(t);
    return h(
      "li",
      { class: "task", "data-id": t.id },
      h(
        "div",
        {
          class: "row-body",
          role: "button",
          tabindex: "0",
          "aria-label": `Edit ${t.name}`,
          "data-edit": t.id,
          onClick: open,
          onKeydown: (ev: Event) => {
            const e = ev as KeyboardEvent;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          },
        },
        h("span", { class: "name" }, t.name),
        h("span", { class: "mins" }, `${t.minutes} min`),
        h("span", { class: "days" }, formatDays(t.days)),
        h("span", { class: "chev" }, icon("chevron")),
      ),
    );
  };
  const render = () => {
    if (disposed) return;
    const sorted = [...tasks].sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...sorted.map(makeRow));
    list.hidden = sorted.length === 0;
    empty.hidden = sorted.length > 0;
  };
  const reload = async () => {
    try {
      tasks = await env.port.listTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load tasks");
    }
    render();
  };

  const releaseWakeLock = () => {
    const fb = env.feedback ?? (ownFeedback ??= createFeedback(browserFeedbackEnv()));
    fb.releaseWakeLock();
  };

  const form = createTaskForm({
    port: env.port,
    onChanged: reload,
    onDeleting: (task) => {
      const s = env.timer?.controller.snapshot();
      if (s && s.taskId === task.id && (s.phase === "running" || s.phase === "overtime" || s.phase === "timesup")) {
        env.timer!.controller.stop();
        releaseWakeLock();
      }
    },
    onDeleted: async (snap) => {
      showToast(`Deleted ${snap.name}`, () => {
        hideToast();
        void form.restore(snap);
      });
      await reload();
      addBtn.focus();
    },
    returnFocus: (task) => (task ? rowFor(task.id) : addBtn)?.focus(),
    onError: (m) => showToast(m),
  });

  void reload();

  return {
    el,
    dispose() {
      disposed = true;
      form.dispose();
      cancelToast?.();
      cancelToast = null;
      ownFeedback?.dispose();
    },
  };
}
