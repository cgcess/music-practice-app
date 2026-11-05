// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { backupFileName } from "../src/data/store";
import { todayLocal } from "../src/dates";
import type { BackupPort } from "../src/ui/ports";
import { settingsView, type SettingsEnv } from "../src/ui/settings";

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
const name = backupFileName(todayLocal());

type Mocked = { [K in keyof BackupPort]: Mock<BackupPort[K]> };
function fakePort(over: Partial<BackupPort> = {}): Mocked {
  const p = {
    prepareExport: vi.fn<BackupPort["prepareExport"]>(async () => ({ fileName: name, text: "{}", tasks: 1, songs: 1 })),
    inspect: vi.fn(async () => ({ tasks: 4, songs: 7, hasSettings: true })),
    current: vi.fn(async () => ({ tasks: 2, songs: 3 })),
    importBackup: vi.fn(async () => {}),
    ...over,
  };
  return p as Mocked;
}
function fakeDoc() {
  const target = new EventTarget();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn((t: string, fn: EventListenerOrEventListenerObject) => target.addEventListener(t, fn)),
    removeEventListener: vi.fn((t: string, fn: EventListenerOrEventListenerObject) => target.removeEventListener(t, fn)),
  };
  return { doc: doc as unknown as NonNullable<SettingsEnv["doc"]>, raw: doc, fire: () => target.dispatchEvent(new Event("visibilitychange")) };
}
function mount(port: BackupPort, env: SettingsEnv = {}) {
  const d = fakeDoc();
  const v = settingsView(port, { doc: d.doc, ...env });
  document.body.appendChild(v.el);
  return { ...v, d };
}
const saveBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Save backup")!;
const status = () => document.querySelector("[role=status]")!;
const input = () => document.querySelector<HTMLInputElement>("input[type=file]")!;
const buttons = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === t)!;

function pick(content: string, fileName = "mine.json") {
  const f = new File([content], fileName, { type: "application/json" });
  Object.defineProperty(input(), "files", { value: [f], configurable: true });
  input().dispatchEvent(new Event("change"));
}

beforeEach(() => {
  document.body.replaceChildren();
  location.hash = "";
});
afterEach(() => {
  document.body.replaceChildren();
});

describe("settings view: save", () => {
  it("has Save and Load controls and no placeholder text", async () => {
    mount(fakePort());
    expect(document.body.textContent).not.toContain("Nothing here yet.");
    expect(saveBtn()).toBeTruthy();
    expect(document.body.textContent).toContain("Load backup");
  });
  it("disables Save until the file is ready", async () => {
    mount(fakePort());
    expect(saveBtn().disabled).toBe(true);
    await flush();
    expect(saveBtn().disabled).toBe(false);
  });
  it("calls canShare then share synchronously on click with a File", async () => {
    const order: string[] = [];
    const share = vi.fn(async (_d: { files: File[] }) => {});
    const canShare = vi.fn((_d: { files: File[] }) => (order.push("canShare"), true));
    share.mockImplementation(async () => void order.push("share"));
    mount(fakePort(), { canShare, share });
    await flush();
    saveBtn().click();
    expect(share).toHaveBeenCalledTimes(1); // no await between click and share
    expect(order).toEqual(["canShare", "share"]);
    const f = share.mock.calls[0]![0].files[0]!;
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe(name);
    expect(f.type).toBe("application/json");
  });
  it("builds on mount and on each visible visibilitychange, never on click", async () => {
    const port = fakePort();
    const m = mount(port, { canShare: () => true, share: async () => {} });
    await flush();
    expect(port.prepareExport).toHaveBeenCalledTimes(1);
    m.d.raw.visibilityState = "hidden";
    m.d.fire();
    expect(port.prepareExport).toHaveBeenCalledTimes(1);
    m.d.raw.visibilityState = "visible";
    m.d.fire();
    await flush();
    expect(port.prepareExport).toHaveBeenCalledTimes(2);
    saveBtn().click();
    await flush();
    expect(port.prepareExport).toHaveBeenCalledTimes(2);
  });
  it("shows a build error, keeps Save enabled, and a later build allows share", async () => {
    const port = fakePort();
    port.prepareExport.mockRejectedValueOnce(new Error("db broke"));
    const share = vi.fn(async () => {});
    mount(port, { canShare: () => true, share });
    await flush();
    expect(status().textContent).toBe("db broke");
    expect(saveBtn().disabled).toBe(false);
    saveBtn().click(); // retry build, not share
    expect(share).not.toHaveBeenCalled();
    await flush();
    expect(status().textContent).toBe("");
    saveBtn().click();
    expect(share).toHaveBeenCalledTimes(1);
  });
  it("dispose removes the visibilitychange listener", async () => {
    const port = fakePort();
    const m = mount(port);
    await flush();
    m.dispose();
    expect(m.d.raw.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    m.d.fire();
    await flush();
    expect(port.prepareExport).toHaveBeenCalledTimes(1);
  });
  it("falls back to download when canShare is missing", async () => {
    const download = vi.fn();
    mount(fakePort(), { download });
    await flush();
    saveBtn().click();
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![0].name).toBe(name);
  });
  it("falls back to download when canShare says no", async () => {
    const download = vi.fn();
    const share = vi.fn(async () => {});
    mount(fakePort(), { canShare: () => false, share, download });
    await flush();
    saveBtn().click();
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("treats AbortError as a silent cancel but reports other share errors", async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    mount(fakePort(), { canShare: () => true, share });
    await flush();
    saveBtn().click();
    await flush();
    expect(status().textContent).toBe("");
    share.mockImplementationOnce(async () => {
      throw new Error("share failed");
    });
    saveBtn().click();
    await flush();
    expect(status().textContent).toBe("share failed");
  });
});

describe("settings view: load", () => {
  it("file input is visible, labelled and accepts json", () => {
    mount(fakePort());
    expect(input().closest("label")?.textContent).toContain("Load backup");
    expect(input().getAttribute("accept")).toBe(".json,application/json");
    expect(input().hidden).toBe(false);
  });
  it("opens a confirm with both counts and the file name; settings replaced wording", async () => {
    mount(fakePort());
    pick("{}", "old-phone.json");
    await flush();
    const dlg = document.querySelector("[role=dialog]")!;
    expect(dlg.textContent).toContain("replaces 2 tasks and 3 songs");
    expect(dlg.textContent).toContain("with 4 tasks and 7 songs from old-phone.json");
    expect(dlg.textContent).toContain("Settings are replaced too.");
  });
  it("settings-absent wording", async () => {
    mount(fakePort({ inspect: vi.fn(async () => ({ tasks: 1, songs: 0, hasSettings: false })) }));
    pick("{}");
    await flush();
    const t = document.querySelector("[role=dialog]")!.textContent!;
    expect(t).toContain("Settings are reset to defaults.");
    expect(t).toContain("1 task and 0 songs");
  });
  it("Cancel changes nothing", async () => {
    const port = fakePort();
    const onImported = vi.fn();
    mount(port, { onImported });
    pick("{}");
    await flush();
    buttons("Cancel").click();
    await flush();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(port.importBackup).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });
  it("Replace imports, calls onImported, then goes to Today", async () => {
    const order: string[] = [];
    const port = fakePort({ importBackup: vi.fn(async () => void order.push("import")) });
    const onImported = vi.fn(() => void order.push(`imported@${location.hash}`));
    mount(port, { onImported });
    pick("FILE");
    await flush();
    buttons("Replace").click();
    await flush();
    expect(port.importBackup).toHaveBeenCalledWith("FILE");
    expect(order).toEqual(["import", "imported@"]);
    expect(location.hash).toBe("#/today");
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
  it("a bad file shows the error and never imports", async () => {
    const port = fakePort({ inspect: vi.fn(async () => { throw new Error("The file is not valid JSON"); }) });
    mount(port);
    pick("nope");
    await flush();
    expect(status().textContent).toBe("The file is not valid JSON");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(port.importBackup).not.toHaveBeenCalled();
  });
  it("an import failure stays in the dialog and keeps the hash", async () => {
    const port = fakePort({ importBackup: vi.fn(async () => { throw new Error("boom"); }) });
    const onImported = vi.fn();
    mount(port, { onImported });
    pick("{}");
    await flush();
    buttons("Replace").click();
    await flush();
    expect(document.querySelector("[role=dialog] .error")?.textContent).toBe("boom");
    expect(onImported).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });
  it("picking the same file twice fires twice", async () => {
    const port = fakePort();
    mount(port);
    pick("{}");
    await flush();
    buttons("Cancel").click();
    expect(input().value).toBe("");
    pick("{}");
    await flush();
    expect(port.inspect).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });
});
