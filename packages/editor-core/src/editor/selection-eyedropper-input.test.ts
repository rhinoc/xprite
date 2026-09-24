import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { PointerActionModifiers } from "$/base/pointer-input";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { EyedropperChannel, EyedropperSample } from "$/drawing/types";
import { RasterEditor } from "$/editor/RasterEditor";
import { SelectionMode } from "$/selection/types";

const SIZE = 16;
const FIRST: Rgba = [200, 40, 10, 255];
const SECOND: Rgba = [20, 60, 220, 128];

function image(): PixelBuffer {
  const result = { width: SIZE, height: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4) };
  result.data.set(FIRST, (2 * SIZE + 2) * 4);
  result.data.set(SECOND, (2 * SIZE + 3) * 4);
  return result;
}

function baseSelection(): RasterEditor {
  const core = new RasterEditor(image());
  core.drawing.settings.setSettings({ tool: "marquee" });
  core.pointerDown({ x: 2, y: 2 });
  core.pointerUp({ x: 6, y: 6 });
  return core;
}

describe("selection input capture", () => {
  it("keeps the starting composition mode through modifier release and preference changes", () => {
    const cases: {
      mode: SelectionMode;
      modifiers: PointerActionModifiers;
      count: number;
      bounds: number[];
    }[] = [
      { mode: SelectionMode.Replace, modifiers: {}, count: 25, bounds: [4, 4, 5, 5] },
      {
        mode: SelectionMode.Add,
        modifiers: { addSelection: true },
        count: 41,
        bounds: [2, 2, 7, 7],
      },
      {
        mode: SelectionMode.Subtract,
        modifiers: { subtractSelection: true },
        count: 16,
        bounds: [2, 2, 5, 5],
      },
      {
        mode: SelectionMode.Intersect,
        modifiers: { intersectSelection: true },
        count: 9,
        bounds: [4, 4, 3, 3],
      },
    ];
    for (const { mode, modifiers, count, bounds } of cases) {
      const core = baseSelection();
      const before = core.getSnapshot().document!.selection;
      core.pointerDown({ x: 8, y: 8, actionModifiers: modifiers });
      core.drawing.settings.setSettings({
        selectionMode: mode === SelectionMode.Add ? SelectionMode.Replace : SelectionMode.Add,
      });
      core.pointerMove({
        x: 4,
        y: 4,
        actionModifiers: {
          addSelection: false,
          subtractSelection: false,
          intersectSelection: false,
        },
      });
      core.pointerUp({ x: 4, y: 4 });
      const mask = core.getSnapshot().document!.selection!;
      assert.equal(
        mask.data.reduce((sum, selected) => sum + Number(!!selected), 0),
        count,
        mode,
      );
      assert.deepEqual([mask.x, mask.y, mask.width, mask.height], bounds, mode);
      core.history.undo();
      assert.deepEqual(core.getSnapshot().document!.selection, before, `${mode} undo`);
    }
  });

  it("still applies shape modifiers pressed after the selection starts", () => {
    const core = new RasterEditor(image());
    core.drawing.settings.setSettings({ tool: "marquee" });
    core.pointerDown({ x: 2, y: 2 });
    core.pointerMove({ x: 8, y: 5, shift: true });
    const preview = core.selection.preview()!;
    assert.equal(preview.width, preview.height);
    core.pointerUp({ x: 8, y: 5, shift: true });
    assert.deepEqual(core.getSnapshot().document!.selection, preview);
  });

  it("keeps Add on Shift release and allows release/repress to constrain geometry", () => {
    const core = baseSelection();
    core.pointerDown({ x: 10, y: 8, shift: true });
    core.pointerMove({ x: 14, y: 10, shift: true });
    core.pointerMove({ x: 14, y: 10, shift: false });
    core.pointerMove({ x: 14, y: 10, shift: true });
    core.pointerUp({ x: 14, y: 10, shift: true });
    const mask = core.getSnapshot().document!.selection!;
    assert.equal(
      mask.data.reduce((sum, selected) => sum + Number(!!selected), 0),
      34,
    );
    assert.deepEqual([mask.x, mask.y, mask.width, mask.height], [2, 2, 11, 9]);
  });
});

describe("held eyedropper input", () => {
  it("samples foreground and background continuously without document edits or history", () => {
    for (const button of [0, 2]) {
      const core = new RasterEditor(image());
      core.drawing.settings.setSettings({
        tool: "eyedropper",
        eyedropperSample: EyedropperSample.CurrentLayer,
        eyedropperChannel: EyedropperChannel.ColorAlpha,
      });
      const before = core.getSnapshot();
      const history = core.history.getSnapshot().states.length;
      const pixels = new Uint8ClampedArray(before.document!.layer.pixels.data);
      const target = button === 2 ? "background" : "foreground";
      const otherTarget = button === 2 ? "foreground" : "background";
      core.pointerDown({ x: 2, y: 2, button });
      assert.deepEqual(core.getSnapshot().settings[target], FIRST);
      core.pointerMove({ x: 3, y: 2, button: -1 });
      assert.deepEqual(core.getSnapshot().settings[target], SECOND);
      assert.deepEqual(core.getSnapshot().settings[otherTarget], before.settings[otherTarget]);
      core.pointerUp({ x: 2, y: 2, button });
      core.pointerMove({ x: 2, y: 2, button: -1 });
      assert.deepEqual(
        core.getSnapshot().settings[target],
        SECOND,
        "release and hover do not sample",
      );
      assert.deepEqual(core.getSnapshot().document!.layer.pixels.data, pixels);
      assert.equal(core.getSnapshot().dirty, before.dirty);
      assert.equal(core.getSnapshot().pixelRevision, before.pixelRevision);
      assert.equal(core.history.getSnapshot().states.length, history);
    }
  });

  it("supports Option picking, channels, brush discard, and capture cancellation", () => {
    const core = new RasterEditor(image());
    const foreground: Rgba = [1, 2, 3, 77];
    core.drawing.settings.setSettings({ brush: { shape: "square", size: 7, angle: 20 } });
    core.drawing.settings.setSettings({
      tool: "pencil",
      foreground,
      eyedropperChannel: EyedropperChannel.Rgb,
      eyedropperSample: EyedropperSample.CurrentLayer,
      discardBrushOnEyedropper: true,
      brush: {
        shape: "image",
        size: 1,
        angle: 0,
        image: { width: 1, height: 1, data: Uint8ClampedArray.of(...FIRST) },
      },
    });
    core.pointerDown({ x: 2, y: 2, alt: true });
    core.pointerMove({ x: 3, y: 2, alt: true, button: -1 });
    assert.deepEqual(core.getSnapshot().settings.foreground, [20, 60, 220, 77]);
    assert.equal(core.getSnapshot().settings.brush.image, undefined);
    assert.deepEqual(core.getSnapshot().settings.brush, { shape: "square", size: 7, angle: 20 });
    core.cancelPointerGesture();
    core.pointerMove({ x: 2, y: 2, alt: true });
    assert.deepEqual(core.getSnapshot().settings.foreground, [20, 60, 220, 77]);
    assert.equal(core.getSnapshot().canUndo, false);
    assert.equal(core.getSnapshot().dirty, false);
  });

  it("samples with a rebound temporary tool and respects removed physical Option bindings", () => {
    const core = new RasterEditor(image());
    core.drawing.settings.setQuickTool("eyedropper");
    core.pointerDown({ x: 2, y: 2, actionModifiers: {} });
    core.pointerMove({ x: 3, y: 2, actionModifiers: {} });
    core.pointerUp();
    core.drawing.settings.setQuickTool(null);
    assert.deepEqual(core.getSnapshot().settings.foreground, SECOND);
    assert.equal(core.getSnapshot().settings.tool, "pencil");
    assert.equal(core.getSnapshot().canUndo, false);
    core.drawing.settings.setSettings({ foreground: FIRST });
    core.pointerDown({ x: 7, y: 7, alt: true, actionModifiers: {} });
    core.pointerUp();
    assert.deepEqual(core.getSnapshot().settings.foreground, FIRST);
    assert.deepEqual(
      Array.from(
        core
          .getSnapshot()
          .document!.layer.pixels.data.slice((7 * SIZE + 7) * 4, (7 * SIZE + 7) * 4 + 4),
      ),
      FIRST,
    );
    assert.equal(core.getSnapshot().canUndo, true);
  });

  it("uses every new position for the index channel and stops on document replacement", () => {
    const palette: readonly Rgba[] = [[0, 0, 0, 0], FIRST, SECOND];
    const core = new RasterEditor();
    core.document.loadImage(image(), "Indexed choices", palette);
    core.drawing.settings.setSettings({
      tool: "eyedropper",
      eyedropperChannel: EyedropperChannel.Index,
    });
    core.pointerDown({ x: 2, y: 2, button: 2 });
    assert.equal(core.getSnapshot().settings.backgroundIndex, 1);
    core.pointerMove({ x: 3, y: 2, button: -1 });
    assert.equal(core.getSnapshot().settings.backgroundIndex, 2);
    assert.deepEqual(core.getSnapshot().settings.background, SECOND);
    core.document.loadImage(image());
    const beforeHover = core.getSnapshot().settings.background;
    core.pointerMove({ x: 2, y: 2 });
    assert.deepEqual(core.getSnapshot().settings.background, beforeHover);
    assert.equal(core.getSnapshot().canUndo, false);
  });

  it("picks the pointed pixel even when drawing snaps to a grid", () => {
    const core = new RasterEditor(image());
    core.canvas.setView({ snapToGrid: true, gridWidth: 8, gridHeight: 8 });
    core.drawing.settings.setSettings({ tool: "eyedropper" });
    core.pointerDown({ x: 2, y: 2 });
    assert.deepEqual(core.getSnapshot().settings.foreground, FIRST);
    core.pointerMove({ x: 3, y: 2 });
    assert.deepEqual(core.getSnapshot().settings.foreground, SECOND);
    core.pointerUp();
    assert.equal(core.getSnapshot().canUndo, false);
  });

  it("preserves staged paste and transformed selection drafts through picking, release, and cancel", () => {
    for (const kind of ["paste", "transform"] as const) {
      for (const button of [0, 2]) {
        const core = kind === "paste" ? new RasterEditor(image()) : baseSelection();
        if (kind === "paste") {
          assert(
            core.clipboard.beginImagePaste(
              {
                pixels: { width: 1, height: 1, data: Uint8ClampedArray.of(...FIRST) },
                mask: null,
              },
              { x: 10, y: 10 },
            ),
          );
        } else {
          assert(core.selection.beginTransform("move", { x: 2, y: 2 }));
          core.pointerUp({ x: 7, y: 7 });
        }
        const before = core.getSnapshot();
        const history = core.history.getSnapshot().states.length;
        const pixels = new Uint8ClampedArray(before.document!.layer.pixels.data);
        core.drawing.settings.setQuickTool("eyedropper");
        core.pointerDown({ x: 9, y: 2, button, actionModifiers: {} });
        core.pointerMove({ x: 9, y: 3, button: -1, actionModifiers: {} });
        core.pointerUp({ x: 9, y: 3, button, actionModifiers: {} });
        assert.deepEqual(core.getSnapshot().floatingPaste, before.floatingPaste);
        assert.deepEqual(core.getSnapshot().selectionTransform, before.selectionTransform);
        core.pointerDown({ x: 9, y: 2, button, actionModifiers: {} });
        core.cancelPointerGesture();
        core.drawing.settings.setQuickTool(null);
        const after = core.getSnapshot();
        assert.deepEqual(after.floatingPaste, before.floatingPaste);
        assert.deepEqual(after.selectionTransform, before.selectionTransform);
        assert.deepEqual(after.document!.selection, before.document!.selection);
        assert.deepEqual(after.document!.layer.pixels.data, pixels);
        assert.equal(after.dirty, before.dirty);
        assert.equal(core.history.getSnapshot().states.length, history);
      }
    }
  });

  it("preserves duplicate source palette indices while sampling successive indexed pixels", () => {
    const palette: readonly Rgba[] = [[0, 0, 0, 0], FIRST, FIRST, SECOND];
    const core = new RasterEditor();
    core.document.loadTimeline(
      {
        colorDepth: 8,
        transparentIndex: 0,
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          {
            id: "artwork",
            name: "Artwork",
            kind: "image",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
          },
        ],
        frames: [
          {
            duration: 100,
            palette,
            cels: [
              {
                pixels: { width: 2, height: 1, data: Uint8ClampedArray.of(...FIRST, ...SECOND) },
                asepriteSamples: { depth: 8, width: 2, height: 1, data: Uint8Array.of(2, 3) },
                x: 2,
                y: 2,
                opacity: 255,
                zIndex: 0,
              },
            ],
          },
        ],
      },
      SIZE,
      SIZE,
      "Indexed samples",
      palette,
    );
    core.drawing.settings.setSettings({
      tool: "eyedropper",
      eyedropperChannel: EyedropperChannel.Index,
      eyedropperSample: EyedropperSample.CurrentLayer,
    });
    core.pointerDown({ x: 2, y: 2 });
    assert.equal(core.getSnapshot().settings.foregroundIndex, 2);
    core.pointerMove({ x: 3, y: 2, button: -1 });
    assert.equal(core.getSnapshot().settings.foregroundIndex, 3);
    core.cancelGesture();
    core.pointerMove({ x: 2, y: 2 });
    assert.equal(core.getSnapshot().settings.foregroundIndex, 3);
  });
});
