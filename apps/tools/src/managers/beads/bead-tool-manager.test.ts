import { afterEach, describe, expect, it, vi } from "vitest";

import { BeadToolManager, BeadPreviewMode } from "$/managers/beads/bead-tool-manager";
import type { BeadInput, BeadToolPort } from "$/managers/ports/beads";

const image = () => ({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 0]),
});
function port(overrides: Partial<BeadToolPort> = {}): BeadToolPort {
  return {
    read: async () => ({ pixels: image() }),
    example: async () => new File([], "example.png"),
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    savePng: vi.fn(async () => {}),
    savePdf: vi.fn(async () => {}),
    ...overrides,
  };
}
afterEach(() => vi.useRealTimers());

describe("standalone bead tool", () => {
  it("preserves source pixels and empty cells while changing grid dimensions", async () => {
    vi.useFakeTimers();
    const pixels = image(),
      before = pixels.data.slice();
    const manager = new BeadToolManager(port({ read: async () => ({ pixels }) }));
    await manager.open(new File([], "art.png"));
    expect(manager.getSnapshot().grid!.total).toBe(1);
    manager.changeSettings({ width: 4 });
    expect(manager.getSnapshot().pending).toBe(true);
    await vi.runAllTimersAsync();
    expect(manager.getSnapshot().settings).toMatchObject({ width: 4, height: 2 });
    expect(manager.getSnapshot().grid!.total).toBe(4);
    expect(pixels.data).toEqual(before);
    manager.setMode(BeadPreviewMode.Overview);
    expect(manager.getSnapshot().preview!.width).toBe(4);
    manager.selectAt({ x: 0, y: 0 });
    expect(manager.getSnapshot().mode).toBe(BeadPreviewMode.Board);
    manager.dispose();
  });
  it("ignores a superseded file read", async () => {
    let release!: (value: BeadInput) => void;
    const old = new Promise<BeadInput>((resolve) => {
      release = resolve;
    });
    const manager = new BeadToolManager(
      port({
        read: (file) => (file.name === "old.png" ? old : Promise.resolve({ pixels: image() })),
      }),
    );
    const pending = manager.open(new File([], "old.png"));
    await Promise.resolve();
    await manager.open(new File([], "new.png"));
    release({ pixels: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]) } });
    await pending;
    expect(manager.getSnapshot().name).toBe("new.png");
    expect(manager.getSnapshot().grid!.total).toBe(1);
    manager.dispose();
  });
  it("regenerates the previous file's pending grid after a new file fails to open", async () => {
    vi.useFakeTimers();
    const io = port({
      read: async (file) => {
        if (file.name === "bad.png") throw new Error("Bad image");
        return { pixels: image() };
      },
    });
    const manager = new BeadToolManager(io);
    await manager.open(new File([], "good.png"));
    manager.changeSettings({ width: 4 });
    await manager.downloadPng();
    expect(io.savePng).not.toHaveBeenCalled();
    await manager.open(new File([], "bad.png"));
    expect(manager.getSnapshot()).toMatchObject({
      name: "good.png",
      pending: false,
      loading: false,
      error: "Bad image",
    });
    expect(manager.getSnapshot().grid!.total).toBe(4);
    await manager.downloadPng();
    expect(io.savePng).toHaveBeenCalledWith(manager.getSnapshot().grid, true, 29, "good-beads.png");
    manager.dispose();
  });
  it("blocks settings and file replacement while saving and releases the lock after failure", async () => {
    let reject!: (reason: unknown) => void;
    const saving = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    const io = port({ savePdf: () => saving });
    const manager = new BeadToolManager(io);
    await manager.open(new File([], "good.png"));
    const pending = manager.downloadPdf();
    manager.changeSettings({ width: 4 });
    await manager.open(new File([], "other.png"));
    expect(manager.getSnapshot()).toMatchObject({
      downloading: true,
      name: "good.png",
      settings: { width: 2 },
    });
    reject(new Error("Save failed"));
    await pending;
    expect(manager.getSnapshot()).toMatchObject({ downloading: false, error: "Save failed" });
    manager.dispose();
  });
});
