import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";

function editor() {
  const pixels = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) };
  pixels.data.set([255, 0, 0, 255], (3 * 20 + 2) * 4);
  return new RasterEditor(pixels);
}

describe("quick Move gestures", () => {
  it("does not imply auto-select when only the quick Move binding is pressed", () => {
    const core = editor();
    core.timeline.addLayer("Top");
    core.pointerDown({ x: 12, y: 9 });
    core.pointerUp({ x: 12, y: 9 });
    core.timeline.selectLayer(0);
    core.drawing.settings.setQuickTool("move");
    core.pointerDown({ x: 12, y: 9, quickMove: true, actionModifiers: { autoSelectLayer: false } });
    assert.equal(core.getSnapshot().document!.timeline!.activeLayer, 0);
    core.pointerUp({ x: 13, y: 10, quickMove: true });
  });
  it("routes temporary movement through Move even when a slice or selection tool is selected", () => {
    for (const tool of ["slice", "marquee", "zoom", "text"] as const) {
      const core = editor();
      core.drawing.settings.setSettings({ tool });
      core.drawing.settings.setQuickTool("move");
      core.pointerDown({ x: 2, y: 3, quickMove: true, actionModifiers: { autoSelectLayer: true } });
      core.pointerUp({ x: 4, y: 6, quickMove: true });
      core.drawing.settings.setQuickTool(null);
      assert.equal(core.getSnapshot().settings.tool, tool);
      assert.equal(core.getSnapshot().document!.layer.x, 2);
      assert.equal(core.getSnapshot().document!.layer.y, 3);
      assert.equal(core.getSnapshot().document!.timeline!.slices?.length ?? 0, 0);
    }
  });

  it("does not persist hover tools or add history, and retains Move until mouse release", () => {
    const core = editor();
    const before = core.getSnapshot();
    const persisted = core.getCommittedPersistenceSnapshot();
    core.drawing.settings.setQuickTool("move");
    assert.equal(core.getSnapshot().settings.tool, "pencil");
    assert.equal(core.drawing.settings.getInputSettings().tool, "move");
    assert.equal(core.getSnapshot().persistenceRevision, before.persistenceRevision);
    assert.equal(core.getCommittedPersistenceSnapshot(), persisted);
    assert.equal(core.getSnapshot().canUndo, before.canUndo);
    core.pointerDown({ x: 2, y: 3, quickMove: true, actionModifiers: { autoSelectLayer: true } });
    core.drawing.settings.setQuickTool(null);
    core.pointerMove({ x: 5, y: 7 });
    assert.equal(core.drawing.settings.getInputSettings().tool, "move");
    core.pointerUp({ x: 5, y: 7 });
    assert.equal(core.drawing.settings.getInputSettings().tool, "pencil");
    assert.equal(core.getSnapshot().document!.layer.x, 3);
    assert.equal(core.getSnapshot().document!.layer.y, 4);
    core.history.undo();
    assert.equal(core.getSnapshot().document!.layer.x, 0);
    assert.equal(core.getSnapshot().document!.layer.y, 0);
  });

  it("selects the visible cel under the pointer before moving it", () => {
    const core = editor();
    core.timeline.addLayer("Top");
    core.pointerDown({ x: 12, y: 9 });
    core.pointerUp({ x: 12, y: 9 });
    core.timeline.selectLayer(0);
    const before = core.getSnapshot().document!.timeline!;
    const top = before.frames[0].cels[1]!;
    core.drawing.settings.setQuickTool("move");
    core.pointerDown({ x: 12, y: 9, quickMove: true, actionModifiers: { autoSelectLayer: true } });
    assert.equal(core.getSnapshot().document!.timeline!.activeLayer, 1);
    core.pointerUp({ x: 15, y: 11, quickMove: true });
    const moved = core.getSnapshot().document!.timeline!;
    assert.equal(moved.frames[0].cels[1]!.x, top.x + 3);
    assert.equal(moved.frames[0].cels[1]!.y, top.y + 2);
    assert.equal(moved.frames[0].cels[0]!.x, before.frames[0].cels[0]!.x);
    core.history.undo();
    assert.equal(core.getSnapshot().document!.timeline!.frames[0].cels[1]!.x, top.x);
  });
});
