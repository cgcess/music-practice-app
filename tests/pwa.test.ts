import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, requestPersistence, shouldRegister, type RegisterDeps } from "../src/pwa";

function setup(over: Partial<RegisterDeps> & { controller?: unknown } = {}) {
  let onChange: () => void = () => {};
  const update = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue({ update });
  const sw = {
    controller: over.controller ?? null,
    register,
    addEventListener: (_t: "controllerchange", fn: () => void) => {
      onChange = fn;
    },
  };
  let visible: () => void = () => {};
  const reload = vi.fn();
  const deps: RegisterDeps = {
    prod: true,
    baseUrl: "/music-practice-app/",
    serviceWorker: sw,
    reload,
    onVisible: (fn) => {
      visible = fn;
    },
    ...over,
  };
  return { deps, register, reload, update, fire: () => onChange(), show: () => visible() };
}

describe("registerServiceWorker", () => {
  it("shouldRegister requires PROD and serviceWorker", () => {
    expect(shouldRegister(false, {})).toBe(false);
    expect(shouldRegister(true, undefined)).toBe(false);
    expect(shouldRegister(true, {})).toBe(true);
  });
  it("skips when not PROD", async () => {
    const s = setup({ prod: false });
    expect(await registerServiceWorker(s.deps)).toBe(false);
    expect(s.register).not.toHaveBeenCalled();
  });
  it("skips when serviceWorker is missing", async () => {
    const s = setup({ serviceWorker: undefined });
    expect(await registerServiceWorker(s.deps)).toBe(false);
  });
  it("registers with BASE_URL script, scope and updateViaCache none", async () => {
    const s = setup();
    await registerServiceWorker(s.deps);
    expect(s.register).toHaveBeenCalledWith("/music-practice-app/sw.js", {
      scope: "/music-practice-app/",
      updateViaCache: "none",
    });
  });
  it("does not reload on first install (no prior controller)", async () => {
    const s = setup();
    await registerServiceWorker(s.deps);
    s.fire();
    expect(s.reload).not.toHaveBeenCalled();
  });
  it("reloads once when a prior controller existed", async () => {
    const s = setup({ controller: {} });
    await registerServiceWorker(s.deps);
    s.fire();
    s.fire();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });
  it("checks for updates when the page becomes visible", async () => {
    const s = setup();
    await registerServiceWorker(s.deps);
    s.show();
    expect(s.update).toHaveBeenCalledTimes(1);
  });
  it("tolerates a failing registration", async () => {
    const s = setup();
    s.register.mockRejectedValue(new Error("x"));
    await expect(registerServiceWorker(s.deps)).resolves.toBe(true);
  });
});

describe("requestPersistence", () => {
  it("returns false when storage or persist is missing", async () => {
    expect(await requestPersistence(undefined)).toBe(false);
    expect(await requestPersistence({})).toBe(false);
  });
  it("returns true when granted, calling persist once", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    expect(await requestPersistence({ persist })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it("returns false when denied", async () => {
    expect(await requestPersistence({ persist: vi.fn().mockResolvedValue(false) })).toBe(false);
  });
  it("swallows rejection and sync throws", async () => {
    expect(await requestPersistence({ persist: vi.fn().mockRejectedValue(new Error("x")) })).toBe(false);
    expect(
      await requestPersistence({
        persist: () => {
          throw new Error("x");
        },
      }),
    ).toBe(false);
  });
});
