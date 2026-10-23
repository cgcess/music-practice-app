// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { icon, type IconName } from "../src/ui/icons";

describe("icons", () => {
  it("builds SVG-namespaced elements with paths", () => {
    const names: IconName[] = ["today", "repertoire", "settings", "play", "stop", "check", "plus", "chevron", "pencil", "trash"];
    for (const n of names) {
      const el = icon(n);
      expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(el.getAttribute("aria-hidden")).toBe("true");
      const p = el.querySelector("path")!;
      expect(p.namespaceURI).toBe("http://www.w3.org/2000/svg");
    }
  });
});
