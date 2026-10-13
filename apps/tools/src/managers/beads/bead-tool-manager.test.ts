import { afterEach, describe, expect, it, vi } from "vitest";

import { BeadToolManager, BeadPreviewMode } from "$/managers/beads/bead-tool-manager";
import type { BeadInput, BeadToolPort } from "$/managers/ports/beads";
import { BEAD_CHART_CELL_SIZE } from "@xprite/editor-core/import-export";

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
    manager.changeSettings({ targetWidth: 4 });
    expect(manager.getSnapshot().pending).toBe(true);
    await vi.runAllTimersAsync();
    expect(manager.getSnapshot().settings).toMatchObject({ targetWidth: 4, targetHeight: 2 });
    expect(manager.getSnapshot().grid!.total).toBe(4);
    expect(pixels.data).toEqual(before);
    manager.setMode(BeadPreviewMode.Overview);
    expect(manager.getSnapshot().preview!.width).toBeGreaterThan(4);
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
    manager.changeSettings({ targetWidth: 4 });
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
    expect(io.savePng).toHaveBeenCalledWith(
      manager.getSnapshot().grid,
      "MARD 221",
      true,
      { width: 29, height: 29 },
      "good-beads.png",
    );
    manager.dispose();
  });
  it("selects and exports rectangular custom boards without resizing the pattern", async () => {
    vi.useFakeTimers();
    const io = port();
    const manager = new BeadToolManager(io);
    await manager.open(new File([], "custom.png"));
    manager.changeSettings({ targetWidth: 4 });
    await vi.runAllTimersAsync();
    const grid = manager.getSnapshot().grid;
    manager.changeSettings({ boardSize: { width: 3, height: 1 } });
    expect(manager.getSnapshot().grid).toBe(grid);
    expect(manager.getSnapshot().boards).toHaveLength(4);
    manager.setMode(BeadPreviewMode.Overview);
    manager.selectAt({ x: 3 * BEAD_CHART_CELL_SIZE + 1, y: BEAD_CHART_CELL_SIZE + 1 });
    expect(manager.getSnapshot().selected).toBe(3);
    manager.changeSettings({ boardSize: { width: 0, height: 1 } });
    expect(manager.getSnapshot().settings.boardSize).toEqual({ width: 3, height: 1 });
    await manager.downloadPdf();
    expect(io.savePdf).toHaveBeenCalledWith(
      grid,
      "MARD 221",
      true,
      { width: 3, height: 1 },
      "custom-beads.pdf",
    );
    manager.dispose();
  });
  it("keeps highlights out of exports and rematches excluded colors without changing the source", async () => {
    vi.useFakeTimers();
    const pixels = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 0]),
    };
    const before = pixels.data.slice();
    const io = port({ read: async () => ({ pixels }) });
    const manager = new BeadToolManager(io);
    await manager.open(new File([], "colors.png"));
    const original = manager.getSnapshot().grid!;
    const code = original.usage[0].color.code;
    expect(manager.getSnapshot().mode).toBe(BeadPreviewMode.Overview);
    manager.highlightColor(code);
    expect(manager.getSnapshot().grid).toBe(original);
    await manager.downloadPng();
    expect(io.savePng).toHaveBeenCalledWith(
      original,
      "MARD 221",
      true,
      { width: 29, height: 29 },
      "colors-beads.png",
    );
    manager.excludeColor(code);
    expect(manager.getSnapshot().pending).toBe(true);
    await vi.runAllTimersAsync();
    const filtered = manager.getSnapshot().grid!;
    expect(filtered.usage.some(({ color }) => color.code === code)).toBe(false);
    expect(filtered.total).toBe(2);
    expect(filtered.cells[2]).toBe(-1);
    expect(manager.getSnapshot().highlight).toBe(null);
    manager.restoreColor(code);
    await vi.runAllTimersAsync();
    expect(manager.getSnapshot().grid!.cells).toEqual(original.cells);
    expect(manager.getSnapshot().excludedColors).toEqual([]);
    expect(pixels.data).toEqual(before);
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
    manager.changeSettings({ targetWidth: 4 });
    await manager.open(new File([], "other.png"));
    expect(manager.getSnapshot()).toMatchObject({
      downloading: true,
      name: "good.png",
      settings: { targetWidth: 2 },
    });
    reject(new Error("Save failed"));
    await pending;
    expect(manager.getSnapshot()).toMatchObject({ downloading: false, error: "Save failed" });
    manager.dispose();
  });
});
