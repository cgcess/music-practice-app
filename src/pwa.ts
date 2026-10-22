import { log } from "./log";

export interface SwContainerLike {
  controller: unknown;
  register(url: string, opts: { scope: string; updateViaCache: "none" }): Promise<{ update(): Promise<unknown> }>;
  addEventListener(type: "controllerchange", fn: () => void): void;
}

export interface RegisterDeps {
  prod: boolean;
  baseUrl: string;
  serviceWorker: SwContainerLike | undefined;
  reload: () => void;
  /** Subscribe to the page becoming visible again; used to check for a new SW. */
  onVisible: (fn: () => void) => void;
}

export function shouldRegister(prod: boolean, serviceWorker: unknown): boolean {
  return prod && !!serviceWorker;
}

/** Register the SW (script and scope under baseUrl). Returns true if registration was attempted. */
export async function registerServiceWorker(d: RegisterDeps): Promise<boolean> {
  const sw = d.serviceWorker;
  if (!sw || !shouldRegister(d.prod, sw)) return false;
  const hadController = !!sw.controller;
  let reloaded = false;
  sw.addEventListener("controllerchange", () => {
    // First install claims the page too; only reload when a previous version was running.
    if (!hadController || reloaded) return;
    reloaded = true;
    d.reload();
  });
  try {
    const reg = await sw.register(d.baseUrl + "sw.js", { scope: d.baseUrl, updateViaCache: "none" });
    d.onVisible(() => {
      reg.update().catch(() => {});
    });
  } catch (e) {
    log("sw registration failed", e);
  }
  return true;
}

export interface StorageLike {
  persist?: () => Promise<boolean>;
}

/** Ask the browser not to evict our data. Never throws; returns whether persistence was granted. */
export async function requestPersistence(storage: StorageLike | undefined): Promise<boolean> {
  try {
    if (!storage || typeof storage.persist !== "function") return false;
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}
