import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";

describe("raster presentation changes", () => {
  it("retains detached committed graphs while owned snapshot callers can mutate their copies", () => {
    const core = new RasterEditor({
      width: 32,
      height: 32,
      data: new Uint8ClampedArray(32 * 32 * 4),
    });
    const committed = core.getCommittedPersistenceSnapshot()!;
    assert.equal(core.getCommittedPersistenceSnapshot(), committed);
    const owned = core.getPersistenceSnapshot()!;
    owned.document.layer.pixels.data.fill(123);
    assert.ok(committed.document.layer.pixels.data.every((value) => value === 0));
    core.pointerDown({ x: 3, y: 4 });
    assert.equal(core.getCommittedPersistenceSnapshot(), committed);
    core.pointerUp({ x: 3, y: 4 });
    assert.notEqual(core.getCommittedPersistenceSnapshot(), committed);
    assert.ok(committed.document.layer.pixels.data.every((value) => value === 0));
  });

  it("accumulates skipped pointer updates and discards the region after undo", () => {
    const core = new RasterEditor({
      width: 32,
      height: 32,
      data: new Uint8ClampedArray(32 * 32 * 4),
    });
    const revision = core.getSnapshot().pixelRevision;
    core.pointerDown({ x: 3, y: 4 });
    core.pointerMove({ x: 6, y: 4 });
    core.pointerMove({ x: 9, y: 4 });
    const snapshot = core.getSnapshot();
    const change = snapshot.rasterChange!;
    assert.ok(change);
    assert.equal(change.pixels, snapshot.document!.layer.pixels);
    assert.ok(change.fromRevision >= revision);
    assert.equal(change.revision, snapshot.pixelRevision);
    assert.ok(change.bounds.x <= 3 && change.bounds.x + change.bounds.width > 9);
    core.pointerUp({ x: 9, y: 4 });
    core.history.undo();
    assert.equal(core.getSnapshot().rasterChange, null);
  });

  it("borrows a plain cel while retaining the compositor for translucent layers", () => {
    const image = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
    image.data.fill(255);
    const core = new RasterEditor(image);
    const source = core.getSnapshot().document!.layer.pixels;
    assert.equal(core.canvas.previewRaster().pixels, source);
    core.timeline.setLayerProperties({ opacity: 128 });
    assert.notEqual(core.canvas.previewRaster().pixels, core.getSnapshot().document!.layer.pixels);
    assert.deepEqual(core.canvas.previewRaster().pixels.data, core.canvas.previewComposite().data);
  });
});
