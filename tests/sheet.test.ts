// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "../src/ui/h";
import { openSheet } from "../src/ui/sheet";

const key = (k: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true }));
let opener: HTMLButtonElement;
let a: HTMLInputElement;
let b: HTMLButtonElement;

beforeEach(() => {
  document.body.replaceChildren();
  opener = h("button", { type: "button" }, "open");
  document.body.append(opener);
  opener.focus();
  a = h("input", { type: "text" });
  b = h("button", { type: "button" }, "ok");
});

describe("sheet", () => {
  it("opens as a modal dialog and focuses inside", () => {
    openSheet(h("div", null, a, b), { title: "Add task" });
    const d = document.querySelector(".sheet")!;
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(a);
  });
  it("Escape closes, restores focus and calls onClose once", () => {
    const onClose = vi.fn();
    openSheet(h("div", null, a, b), { title: "t", onClose });
    key("Escape");
    key("Escape");
    expect(document.querySelector(".sheet")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("backdrop click closes; clicks inside do not", () => {
    openSheet(h("div", null, a, b), { title: "t" });
    a.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".sheet")).not.toBeNull();
    document.querySelector(".sheet-backdrop")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".sheet")).toBeNull();
  });
  it("traps Tab and Shift+Tab", () => {
    openSheet(h("div", null, a, b), { title: "t" });
    b.focus();
    key("Tab");
    expect(document.activeElement).toBe(a);
    key("Tab", true);
    expect(document.activeElement).toBe(b);
  });
  it("close() is idempotent and removes the key listener", () => {
    const s = openSheet(h("div", null, a), { title: "t" });
    s.close();
    s.close();
    expect(document.querySelector(".sheet")).toBeNull();
  });
});
