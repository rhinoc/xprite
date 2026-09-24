import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-timeline", () => {
  it("editor-timeline behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      TimelineLayerDropPosition,
      advanceTimelinePlaybackWithRepeats,
      blendNormalAt,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const blank = { width: 8, height: 8, data: new Uint8ClampedArray(256) },
      red = [255, 0, 0, 255],
      blue = [0, 0, 255, 255];
    const e = new RasterEditor(blank, "Timeline");
    const paint = (color, x = 2, y = 2) => {
      e.drawing.settings.setSettings({ tool: "pencil", foreground: color });
      e.pointerDown({ x, y });
      e.pointerUp();
    };
    const pixel = () =>
      Array.from(e.canvas.composite().data.slice((2 * 8 + 2) * 4, (2 * 8 + 2) * 4 + 4));
    paint(red);
    e.history.markSaved();
    e.timeline.addLayer("Top");
    assert.equal(e.getSnapshot().document.timeline.layers.length, 2);
    paint(blue);
    assert.deepEqual(pixel(), blue);
    e.timeline.setLayerVisible(false);
    assert.deepEqual(pixel(), red);
    e.timeline.setLayerVisible(true);
    assert.deepEqual(pixel(), blue);
    e.timeline.setLayerOpacity(128);
    assert.deepEqual(pixel(), [127, 0, 128, 255]);
    e.history.undo();
    e.timeline.addFrame(true);
    assert.equal(e.getSnapshot().document.timeline.frames.length, 2);
    assert.equal(e.getSnapshot().document.timeline.activeFrame, 1);
    e.drawing.settings.setSettings({ tool: "eraser" });
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp();
    assert.deepEqual(pixel(), red);
    e.timeline.selectFrame(0);
    assert.deepEqual(pixel(), blue);
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.activeFrame, 1);
    assert.deepEqual(pixel(), blue);
    e.history.redo();
    assert.deepEqual(pixel(), red);
    e.timeline.addFrame(false);
    assert.deepEqual(pixel(), [0, 0, 0, 0]);
    paint(blue);
    assert.deepEqual(pixel(), blue);
    e.timeline.selectFrame(1);
    assert.deepEqual(pixel(), red);
    e.timeline.selectLayer(0);
    assert.equal(e.getSnapshot().document.layer.name, "Layer 1");
    e.timeline.renameLayer("Bottom");
    assert.equal(e.getSnapshot().document.timeline.layers[0].name, "Bottom");
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.layers[0].name, "Layer 1");
    e.timeline.selectFrame(0);
    e.timeline.selectLayer(1);
    e.timeline.moveLayer(-1);
    assert.deepEqual(pixel(), red);
    e.history.undo();
    assert.deepEqual(pixel(), blue);
    e.timeline.deleteLayer();
    assert.deepEqual(pixel(), red);
    e.history.undo();
    assert.deepEqual(pixel(), blue);
    e.timeline.deleteFrame();
    assert.equal(e.getSnapshot().document.timeline.frames.length, 2);
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.frames.length, 3);
    e.timeline.setFrameDuration(75);
    assert.equal(e.getSnapshot().document.timeline.frames[0].duration, 75);
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.frames[0].duration, 100);
    const frames = [
      { duration: 50, cels: [] },
      { duration: 200, cels: [] },
      { duration: 75, cels: [] },
    ];
    assert.deepEqual(advanceTimelinePlaybackWithRepeats(frames, 0, 0, 50), {
      frame: 1,
      elapsed: 0,
      cycles: 0,
      completed: false,
    });
    assert.deepEqual(advanceTimelinePlaybackWithRepeats(frames, 1, 0, 201), {
      frame: 2,
      elapsed: 1,
      cycles: 0,
      completed: false,
    });
    assert.deepEqual(advanceTimelinePlaybackWithRepeats(frames, 2, 25, 375), {
      frame: 0,
      elapsed: 0,
      cycles: 2,
      completed: false,
    });
    e.timeline.selectFrame(0);
    e.history.markSaved();
    e.timeline.setPlaying(true);
    e.timeline.advancePlayback(100);
    assert.equal(e.getSnapshot().document.timeline.activeFrame, 1);
    assert.equal(e.getSnapshot().dirty, false);
    e.timeline.setPlaying(false);
    // Independent integer normal blend oracle from the Aseprite formula.
    for (let a = 0; a < 256; a += 17)
      for (let b = 0; b < 256; b += 19) {
        const dst = new Uint8ClampedArray([180, 40, 90, a]),
          src = new Uint8ClampedArray([20, 180, 10, b]),
          mul = (x, y) => Math.floor((x * y + 128 + Math.floor((x * y + 128) / 256)) / 256),
          sa = mul(b, 137),
          alpha = sa + a - mul(a, sa);
        blendNormalAt(dst, 0, src, 0, 137);
        const expected = !a
          ? [20, 180, 10, sa]
          : !b
            ? [180, 40, 90, a]
            : [
                180 + Math.trunc((-160 * sa) / alpha),
                40 + Math.trunc((140 * sa) / alpha),
                90 + Math.trunc((-80 * sa) / alpha),
                alpha,
              ];
        assert.deepEqual([...dst], expected);
      }
    console.log(
      "Timeline: independent cel edits, empty frames, compositing, layer order/visibility/opacity, structural undo/redo, active cel restoration and duration-aware playback pass.",
    );
    // An Aseprite save changes the document format, which is not undone when frames
    // are later removed. It must never silently fall back to a flattened PNG.
    const { EditorSession } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const saved = new RasterEditor(blank, "Animation.png");
    let indexedWrites = 0,
      pngWrites = 0;
    const session = new EditorSession(saved, {
      decode: async () => blank,
      analyze: async () => ({ classification: "pixel-art" }),
      pixelate: async () => blank,
      write: async () => {
        pngWrites++;
        return { method: "download", name: "Animation.png" };
      },
      writeProject: async () => {
        indexedWrites++;
        return { method: "download", name: "Animation.aseprite" };
      },
    });
    saved.timeline.addFrame();
    await session.save("save-as");
    saved.timeline.deleteFrame();
    await session.save("save");
    assert.equal(indexedWrites, 2);
    assert.equal(pngWrites, 0);
    assert.equal(saved.getSnapshot().document.format, "aseprite");
    session.dispose();
    console.log("Aseprite save format persists after returning to a single layer/frame.");
    const flags = new RasterEditor(blank);
    flags.drawing.settings.setSettings({ foreground: red });
    flags.pointerDown({ x: 1, y: 1 });
    flags.pointerUp();
    flags.history.markSaved();
    flags.timeline.setLayerVisible(false);
    flags.timeline.setLayerLocked(true);
    assert.equal(
      flags.getSnapshot().dirty,
      false,
      "Aseprite layer visibility/lock are not undoable document edits",
    );
    flags.history.undo();
    assert.equal(flags.getSnapshot().document.layer.visible, false);
    assert.equal(flags.getSnapshot().document.layer.locked, true);
    flags.history.redo();
    assert.equal(flags.getSnapshot().document.layer.visible, false);
    assert.equal(flags.getSnapshot().document.layer.locked, true);
    flags.timeline.setLayerVisible(true);
    assert.deepEqual(Array.from(flags.canvas.composite().data.slice(36, 40)), red);
    console.log(
      "Aseprite view flags persist across pixel undo/redo without changing saved identity.",
    );
    // Timeline row-icon operations target that row without switching the active cel
    // (Timeline::onProcessMessage PART_ROW_EYE/PADLOCK/CONTINUOUS_ICON).
    const rowFlags = new RasterEditor(blank);
    rowFlags.timeline.addLayer("Top");
    const activeBefore = rowFlags.getSnapshot().document.timeline.activeLayer;
    rowFlags.history.markSaved();
    rowFlags.timeline.setLayerVisible(false, 0);
    rowFlags.timeline.setLayerLocked(true, 0);
    rowFlags.timeline.setLayerContinuous(true, 0);
    let rowState = rowFlags.getSnapshot();
    assert.equal(rowState.document.timeline.activeLayer, activeBefore);
    assert.equal(rowState.document.layer.name, "Top");
    assert.equal(rowState.document.layer.visible, true);
    assert.equal(rowState.document.layer.locked, false);
    assert.equal(rowState.document.timeline.layers[0].visible, false);
    assert.equal(rowState.document.timeline.layers[0].locked, true);
    assert.ok(rowState.document.timeline.layers[0].flags & 16);
    assert.equal(rowState.dirty, false);
    rowFlags.timeline.setLayerVisible(true, 0);
    rowFlags.timeline.setLayerLocked(false, 0);
    rowFlags.timeline.selectLayer(0);
    rowFlags.drawing.settings.setSettings({ tool: "pencil", foreground: red });
    rowFlags.pointerDown({ x: 2, y: 2 });
    rowFlags.pointerUp();
    rowFlags.history.markSaved();
    rowFlags.timeline.addFrame();
    let linked = rowFlags.getSnapshot().document.timeline;
    assert.equal(
      linked.frames[0].cels[0].pixels,
      linked.frames[1].cels[0].pixels,
      "Continuous layer new frames share image identity",
    );
    rowFlags.timeline.setLayerContinuous(false, 0);
    rowFlags.timeline.addFrame();
    linked = rowFlags.getSnapshot().document.timeline;
    assert.notEqual(
      linked.frames[1].cels[0].pixels,
      linked.frames[2].cels[0].pixels,
      "Discontinuous layer new frames copy image identity",
    );
    rowFlags.history.undo();
    assert.equal(
      rowFlags.getSnapshot().document.timeline.layers[0].flags & 16,
      0,
      "Undo preserves current continuous preference",
    );
    rowFlags.timeline.setAllLayersContinuous(true);
    assert.ok(rowFlags.getSnapshot().document.timeline.layers.every((layer) => layer.flags & 16));
    rowFlags.timeline.setAllLayersContinuous(false);
    assert.ok(
      rowFlags.getSnapshot().document.timeline.layers.every((layer) => !(layer.flags & 16)),
    );
    console.log(
      "Timeline row flags preserve the active cel; continuous toggles produce linked frames and survive undo.",
    );
    for (const position of [TimelineLayerDropPosition.Above, TimelineLayerDropPosition.Below]) {
      const copiedLayer = new RasterEditor(blank, "Copy layer at its own edge");
      copiedLayer.drawing.settings.setSettings({ tool: "pencil", foreground: red });
      copiedLayer.pointerDown({ x: 2, y: 2 });
      copiedLayer.pointerUp();
      copiedLayer.timeline.setLayerContinuous(true);
      copiedLayer.timeline.addFrame(true);
      copiedLayer.history.markSaved();
      const before = copiedLayer.getSnapshot().document.timeline;
      copiedLayer.timeline.dropTimelineLayers(
        { kind: "layers", layers: [0], frames: [0, 1] },
        0,
        position,
        true,
      );
      const after = copiedLayer.getSnapshot().document.timeline;
      const copyIndex = position === TimelineLayerDropPosition.Above ? 1 : 0;
      const sourceIndex = 1 - copyIndex;
      assert.equal(
        after.layers.length,
        2,
        "Copying onto a source layer's own edge must insert a layer",
      );
      assert.equal(after.layers[sourceIndex].id, before.layers[0].id);
      assert.notEqual(after.layers[copyIndex].id, before.layers[0].id);
      assert.equal(after.layers[copyIndex].name, `${before.layers[0].name} Copy`);
      assert.deepEqual(after.range.layers, [copyIndex]);
      assert.equal(after.activeLayer, copyIndex);
      assert.equal(after.frames[0].cels[copyIndex].pixels, after.frames[1].cels[copyIndex].pixels);
      assert.notEqual(
        after.frames[0].cels[copyIndex].pixels,
        after.frames[0].cels[sourceIndex].pixels,
      );
      assert.deepEqual(
        after.frames[0].cels[copyIndex].pixels.data,
        before.frames[0].cels[0].pixels.data,
      );
      assert.equal(copiedLayer.getSnapshot().dirty, true);
      copiedLayer.history.undo();
      const restored = copiedLayer.getSnapshot().document.timeline;
      assert.deepEqual(
        restored.layers.map((layer) => layer.id),
        before.layers.map((layer) => layer.id),
      );
      assert.deepEqual(
        restored.frames[0].cels[0].pixels.data,
        before.frames[0].cels[0].pixels.data,
      );
      assert.equal(
        copiedLayer.getSnapshot().dirty,
        false,
        "One undo restores the original saved layer tree",
      );
    }
  }, 60_000);
});
