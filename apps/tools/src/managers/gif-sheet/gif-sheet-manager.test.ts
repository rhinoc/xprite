import { describe, expect, it, vi } from "vitest";

import { GifSheetManager, GifSheetStatus } from "$/managers/gif-sheet/gif-sheet-manager";
import type { GifSheetPort } from "$/managers/ports/gif-sheet";
import { AppearanceMode } from "@xprite/editor-ui/appearance";

const frame = (red: number) => ({
  pixels: { width: 1, height: 1, data: new Uint8ClampedArray([red, 0, 0, 255]) },
  durationMs: 100,
});
function port(patch: Partial<GifSheetPort> = {}): GifSheetPort {
  return {
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    readAppearance: () => AppearanceMode.Light,
    watchAppearance: () => () => {},
    read: async () => ({ width: 1, height: 1, frames: [frame(10), frame(20)] }),
    example: async () => new File([], "example.gif"),
    savePng: async () => {},
    saveJson: async () => {},
    edit: vi.fn(async () => {}),
    ...patch,
  };
}

describe("GIF sprite sheet editor hand-off", () => {
  it("opens the original GIF, whose frames become the editor timeline", async () => {
    const io = port();
    const manager = new GifSheetManager(io);
    const file = new File([new Uint8Array([71, 73, 70])], "walk.gif");
    await manager.open(file);
    expect(manager.getSnapshot().status).toBe(GifSheetStatus.Ready);
    await manager.openEditor();
    expect(io.edit).toHaveBeenCalledWith(file);
    manager.dispose();
  });
  it("does nothing before a GIF is open", async () => {
    const io = port();
    const manager = new GifSheetManager(io);
    await manager.openEditor();
    expect(io.edit).not.toHaveBeenCalled();
    manager.dispose();
  });
  it("reports a failed hand-off and allows trying again", async () => {
    const edit = vi
      .fn<GifSheetPort["edit"]>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    const manager = new GifSheetManager(port({ edit }));
    await manager.open(new File([], "walk.gif"));
    await manager.openEditor();
    expect(manager.getSnapshot()).toMatchObject({
      openingEditor: false,
      error: "The editor could not be opened. Please try again.",
    });
    await manager.openEditor();
    expect(edit).toHaveBeenCalledTimes(2);
    manager.dispose();
  });
});
