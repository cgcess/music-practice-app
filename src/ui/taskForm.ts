import { config } from "../config";
import { h } from "./h";
import type { NewTask, TaskItem, TaskSnapshot, TodayPort } from "./ports";
import { openSheet, type Sheet } from "./sheet";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Daily" or the weekday names in order, e.g. "Mon, Wed". */
export function formatDays(days: TaskItem["days"]): string {
  if (days === "daily") return "Daily";
  return [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
}

export interface TaskFormOpts {
  port: Pick<TodayPort, "addTask" | "updateTask" | "deleteTask" | "restoreTask">;
  /** After a successful Save/Add or Restore (the sheet is already closed): reload and render. */
  onChanged: () => void | Promise<void>;
  /** After a successful delete, before the sheet closes: stop the timer, drop completion undo. */
  onDeleting?: (task: TaskItem) => void;
  /** After the sheet closed on a delete: show the Undo toast, reload, move focus. */
  onDeleted?: (snap: TaskSnapshot) => void | Promise<void>;
  /** After a Save: element to focus (the row, or the opener when `task` is undefined). */
  returnFocus?: (task?: TaskItem) => void;
  /** A restore failed. */
  onError?: (message: string) => void;
}

export interface TaskForm {
  /** Opens the sheet: empty "Add task" form, or "Edit task" pre-filled from `task`. */
  open(task?: TaskItem): void;
  /** Puts a deleted task back (Undo), then calls `onChanged`. */
  restore(snap: TaskSnapshot): Promise<void>;
  dispose(): void;
}

/** The add/edit task sheet shared by Today (Add) and the edit page (Add, Save, Delete). */
export function createTaskForm(opts: TaskFormOpts): TaskForm {
  let sheet: Sheet | null = null;
  let editing: TaskItem | null = null;
  let deleting = false;
  let disposed = false;

  const errorEl = h("p", { class: "error", role: "alert" });
  const nameIn = h("input", { type: "text", name: "name", required: true, id: "task-name", autocomplete: "off" });
  const minsIn = h("input", {
    type: "number",
    name: "minutes",
    id: "task-minutes",
    inputmode: "numeric",
    min: config.timer.minMinutes,
    max: config.timer.maxMinutes,
    value: config.today.defaultMinutes,
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

  const open = (task?: TaskItem) => {
    if (sheet || disposed) return;
    editing = task ?? null;
    deleting = false;
    deleteBtn.disabled = false;
    setError("");
    nameIn.value = task ? task.name : "";
    minsIn.value = String(task ? task.minutes : config.today.defaultMinutes);
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
    const days: "daily" | number[] = dailyIn.checked ? "daily" : dayIns.flatMap((c, i) => (c.checked ? [i] : []));
    if (days !== "daily" && days.length === 0) return setError("Choose Daily or at least one day");
    const patch: NewTask = { name, minutes: Number(minsIn.value), days };
    const task = editing;
    try {
      if (task) {
        // A running task keeps the target fixed at start (timer.ts), so a minutes change applies from the next start.
        await opts.port.updateTask(task.id, patch);
      } else {
        await opts.port.addTask(patch);
      }
    } catch (e) {
      return setError(e instanceof Error ? e.message : task ? "Could not save task" : "Could not add task");
    }
    setError("");
    sheet?.close();
    await opts.onChanged();
    opts.returnFocus?.(task ?? undefined);
  };

  const remove = async () => {
    const task = editing;
    if (!task || deleting) return;
    deleting = true;
    deleteBtn.disabled = true;
    let snap: TaskSnapshot;
    try {
      snap = await opts.port.deleteTask(task.id);
    } catch (e) {
      deleting = false;
      deleteBtn.disabled = false;
      return setError(e instanceof Error ? e.message : "Could not delete task");
    }
    // Undo restores the task, not its running state.
    opts.onDeleting?.(task);
    sheet?.close();
    await opts.onDeleted?.(snap);
  };

  const restore = async (snap: TaskSnapshot) => {
    try {
      await opts.port.restoreTask(snap);
    } catch (e) {
      opts.onError?.(e instanceof Error ? e.message : "Could not restore");
      return;
    }
    await opts.onChanged();
  };

  return {
    open,
    restore,
    dispose() {
      disposed = true;
      sheet?.close();
    },
  };
}
