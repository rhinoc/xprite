import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import type { TimelineCel } from "$/timeline/types";

function editor(activeLayer = 1) {
  const cel = (x: number): TimelineCel => ({
    x,
    y: 1,
    pixels: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) },
    opacity: 255,
    zIndex: 0,
  });
  const linked = cel(2);
  const core = new RasterEditor();
  core.document.loadTimeline(
    {
      activeLayer,
      activeFrame: 0,
      composeGroups: true,
      layers: [
        {
          id: "group",
          name: "Group",
          kind: "group",
          visible: true,
          locked: false,
          flags: 3,
          opacity: 255,
        },
        {
          id: "art",
          name: "Art",
          parentId: "group",
          kind: "image",
          visible: true,
          locked: false,
          flags: 3,
          opacity: 255,
        },
        {
          id: "locked",
          name: "Locked",
          parentId: "group",
          kind: "image",
          visible: true,
          locked: true,
          flags: 1,
          opacity: 255,
        },
      ],
      frames: [
        { duration: 100, cels: [null, linked, cel(6)] },
        { duration: 100, cels: [null, cel(4), null] },
        { duration: 100, cels: [null, { ...linked }, null] },
      ],
    },
    16,
    16,
    "Move range",
  );
  core.drawing.settings.setSettings({ tool: "move", autoSelectLayer: false });
  core.timeline.setTimelineRange({ kind: "cels", frames: [0, 1], layers: [0] });
  return core;
}

describe("multi-cel Move integration", () => {
  it("clears the timeline range after a no-motion quick Move click without adding undo", () => {
    const core = editor();
    const before = core.getSnapshot();
    core.pointerDown({ x: 2, y: 1, quickMove: true });
    core.pointerUp({ x: 2, y: 1, quickMove: true });
    assert.equal(core.getSnapshot().document!.timeline!.range, undefined);
    assert.equal(core.getSnapshot().canUndo, before.canUndo);
    assert.equal(core.getSnapshot().dirty, before.dirty);
  });

  it("retains the timeline range when an auto-select drag returns to its starting point", () => {
    const core = editor();
    core.pointerDown({ x: 2, y: 1, quickMove: true });
    core.pointerMove({ x: 5, y: 1, quickMove: true });
    core.pointerUp({ x: 2, y: 1, quickMove: true });
    assert(core.getSnapshot().document!.timeline!.range);
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [2, 4, 2],
    );
  });

  it("does not add history or dirty the document for an unmoved group click", () => {
    const core = editor(0);
    const before = core.getSnapshot();
    core.pointerDown({ x: 2, y: 1 });
    core.pointerUp({ x: 2, y: 1 });
    assert.equal(core.getSnapshot().canUndo, before.canUndo);
    assert.equal(core.getSnapshot().dirty, before.dirty);
    assert(core.getSnapshot().document!.timeline!.range);
  });

  it("commits a group/range drag with mask movement in one undo and redo", () => {
    const core = editor(0);
    core.selection.selectAll();
    const before = core.getSnapshot().document!;
    const mask = before.selection!;
    core.pointerDown({ x: 2, y: 1 });
    core.pointerMove({ x: 5, y: 3 });
    core.pointerUp({ x: 5, y: 3 });
    const moved = core.getSnapshot().document!;
    assert.deepEqual(
      moved.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [5, 7, 5],
    );
    assert.equal(moved.timeline!.frames[0].cels[2]!.x, 6);
    assert.equal(moved.selection!.x, mask.x + 3);
    assert.equal(moved.selection!.y, mask.y + 2);
    core.history.undo();
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [2, 4, 2],
    );
    assert.equal(core.getSnapshot().document!.selection!.x, mask.x);
    core.history.redo();
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [5, 7, 5],
    );
  });

  it("restores every target and leaves history unchanged when cancelled", () => {
    const core = editor();
    const before = core.getSnapshot();
    core.pointerDown({ x: 2, y: 1 });
    core.pointerMove({ x: 8, y: 5 });
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [8, 10, 8],
    );
    core.cancelGesture();
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [2, 4, 2],
    );
    assert.equal(core.getSnapshot().canUndo, before.canUndo);
    assert.equal(core.getSnapshot().dirty, before.dirty);
  });

  it("ignores a hidden timeline range and retains fractional reference-independent rounding", () => {
    const core = editor();
    core.pointerDown({ x: 2.25, y: 1, timelineRangeVisible: false });
    core.pointerUp({ x: 1.75, y: 1 });
    assert.deepEqual(
      core.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[1]!.x),
      [1, 4, 1],
    );
  });
});
