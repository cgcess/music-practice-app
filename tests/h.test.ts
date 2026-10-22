// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "../src/ui/h";

describe("h", () => {
  it("sets attributes", () => {
    const el = h("a", { href: "#/x", "data-n": 3 }, "go");
    expect(el.getAttribute("href")).toBe("#/x");
    expect(el.getAttribute("data-n")).toBe("3");
    expect(el.textContent).toBe("go");
  });
  it("handles boolean and nullish attrs", () => {
    const el = h("input", { disabled: true, hidden: false, title: null, id: undefined });
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.hasAttribute("hidden")).toBe(false);
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.hasAttribute("id")).toBe(false);
  });
  it("attaches onclick listener", () => {
    const fn = vi.fn();
    const el = h("button", { onclick: fn }, "b");
    el.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute("onclick")).toBe(false);
  });
  it("inserts strings as text nodes", () => {
    const el = h("p", null, "hi", 5);
    expect(el.childNodes).toHaveLength(2);
    expect(el.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(el.textContent).toBe("hi5");
  });
  it("does not parse html in children", () => {
    const el = h("p", null, "<b>x</b>");
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toBe("<b>x</b>");
  });
  it("handles nested, array and null children", () => {
    const el = h("ul", null, [h("li", null, "a"), [h("li", null, "b")]], null, false, undefined, h("li", null, "c"));
    expect(el.querySelectorAll("li")).toHaveLength(3);
    expect(el.textContent).toBe("abc");
  });
});
