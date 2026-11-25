import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { RasterEditor } from "$/editor/RasterEditor";
import {
  canStoreNormalMapLayer,
  createNormalMapProject,
  normalMapSourcePixels,
} from "$/image-editing/normal-map-document";

const pixel = (rgba: number[]): PixelBuffer => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(rgba),
});

describe("normal map document transactions", () => {
  it("prepares a standalone RGB project across multiple frames with editable originals and raw channels", () => {
    const source0 = pixel([80, 120, 160, 128]);
    const normals0 = pixel([128, 128, 255, 128]);
    const source1 = pixel([0, 0, 0, 0]);
    const project = createNormalMapProject(
      [
        { source: source0, pixels: normals0, duration: 90 },
        { source: source1, pixels: null, duration: 120 },
      ],
      "Original",
    );
    assert.equal(project.timeline.colorDepth, 32);
    assert.deepEqual(project.timeline.colorProfile, { type: "srgb" });
    assert.equal(project.timeline.frames.length, 2);
    assert.equal(project.timeline.frames[0].duration, 90);
    assert.equal(project.timeline.frames[1].duration, 120);
    assert.equal(project.timeline.layers.length, 2);
    assert.deepEqual(project.timeline.frames[0].cels[0]!.pixels.data, source0.data);
    assert.deepEqual(project.timeline.frames[0].cels[1]!.pixels.data, normals0.data);
    assert.notEqual(project.timeline.frames[0].cels[0]!.pixels.data, source0.data);
    assert.equal(project.timeline.frames[1].cels[1], null);
  });
  it("adds a separate layer, updates partial frame ranges and empty cels, and undoes atomically", () => {
    const source = pixel([80, 120, 160, 255]);
    const core = new RasterEditor(source);
    core.timeline.addFrame();
    const first0 = pixel([128, 128, 255, 255]);
    const first1 = pixel([200, 128, 255, 255]);
    const second0 = pixel([128, 255, 128, 255]);
    const id = core.imageEditing.applyNormalMap([
      { frame: 0, pixels: first0 },
      { frame: 1, pixels: first1 },
    ])!;
    assert.equal(core.getSnapshot().document!.timeline!.layers.length, 2);
    core.imageEditing.applyNormalMap(
      [
        { frame: 0, pixels: second0 },
        { frame: 1, pixels: null },
      ],
      "Normal",
      id,
    );
    const document = core.getSnapshot().document!;
    assert.equal(document.timeline!.layers.length, 2);
    assert.deepEqual(normalMapSourcePixels(document, 0, null, [id]).data, source.data);
    assert.deepEqual(normalMapSourcePixels(document, 0, id, [], false).data, second0.data);
    assert.equal(document.timeline!.frames[1].cels[1], null);
    core.history.undo();
    assert.deepEqual(
      normalMapSourcePixels(core.getSnapshot().document!, 0, id, [], false).data,
      first0.data,
    );
    assert.deepEqual(
      normalMapSourcePixels(core.getSnapshot().document!, 1, id, [], false).data,
      first1.data,
    );
    core.history.undo();
    assert.equal(core.getSnapshot().document!.timeline!.layers.length, 1);
    core.history.redo();
    assert.equal(core.getSnapshot().document!.timeline!.layers.length, 2);
    assert.deepEqual(source.data, new Uint8ClampedArray([80, 120, 160, 255]));
  });

  it("preserves the document when a result targets a locked layer or a wrong-sized frame", () => {
    const core = new RasterEditor(pixel([80, 120, 160, 255]));
    const output = pixel([128, 128, 255, 255]);
    const id = core.imageEditing.applyNormalMap([{ frame: 0, pixels: output }])!;
    core.timeline.setLayerLocked(true);
    assert.throws(
      () => core.imageEditing.applyNormalMap([{ frame: 0, pixels: output }], "Normal", id),
      /locked/,
    );
    assert.throws(
      () => core.imageEditing.applyNormalMap([{ frame: 1, pixels: output }]),
      /dimensions/,
    );
    assert.equal(core.getSnapshot().document!.timeline!.layers.length, 2);
  });

  it("requires an RGB document whose profile preserves vector channel bytes", () => {
    const document = new RasterEditor(pixel([0, 0, 0, 255])).getSnapshot().document!;
    assert.equal(canStoreNormalMapLayer(document), true);
    for (const colorDepth of [8, 16] as const)
      assert.equal(
        canStoreNormalMapLayer({ ...document, timeline: { ...document.timeline!, colorDepth } }),
        false,
      );
    assert.equal(
      canStoreNormalMapLayer({
        ...document,
        timeline: { ...document.timeline!, colorProfile: { type: "srgb", gamma: 2.2 } },
      }),
      false,
    );
  });
});
