// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TaskItem } from "../src/ui/ports";
import { createTaskForm, formatDays, type TaskForm } from "../src/ui/taskForm";

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const item: TaskItem = { id: "a", name: "Scales", minutes: 10, days: "daily", lastCompletedOn: null };

let form: TaskForm | null = null;
afterEach(() => {
  form?.dispose();
  form = null;
  document.body.replaceChildren();
});

const key = (k: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true }));

describe("taskForm", () => {
  it("formats days", () => {
    expect(formatDays("daily")).toBe("Daily");
    expect(formatDays([3, 1])).toBe("Mon, Wed");
  });
  it("traps Tab in the sheet; Escape returns focus to the opener; Save calls returnFocus with the task", async () => {
    const row = document.createElement("button");
    document.body.appendChild(row);
    const focused: (string | undefined)[] = [];
    form = createTaskForm({
      port: { addTask: async () => {}, updateTask: async () => {}, deleteTask: async () => ({ ...item, createdAt: "" }), restoreTask: async () => {} },
      onChanged: () => {},
      returnFocus: (t) => focused.push(t?.id),
    });
    row.focus();
    form.open(item);
    const submit = document.querySelector("button[type=submit]") as HTMLElement;
    submit.focus();
    key("Tab");
    expect(document.activeElement).toBe(document.querySelector("#task-name"));
    key("Tab", true);
    expect(document.activeElement).toBe(submit);
    key("Escape");
    expect(document.activeElement).toBe(row);
    expect(document.querySelector(".sheet")).toBeNull();
    form.open(item);
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(document.querySelector(".sheet")).toBeNull();
    expect(focused).toEqual(["a"]);
  });
  it("dispose closes an open sheet", () => {
    form = createTaskForm({
      port: { addTask: async () => {}, updateTask: async () => {}, deleteTask: async () => ({ ...item, createdAt: "" }), restoreTask: async () => {} },
      onChanged: () => {},
    });
    form.open();
    expect(document.querySelector(".sheet")!.getAttribute("aria-label")).toBe("Add task");
    form.dispose();
    expect(document.querySelector(".sheet")).toBeNull();
    form.open();
    expect(document.querySelector(".sheet")).toBeNull();
  });
});
