import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import {
  AsepriteCelType,
  AsepriteLayerType,
  asepriteFromProject,
  projectFromDocument,
} from "$/import-export/aseprite";
import {
  prepareShareProjectSource,
  type ShareProjectSource,
} from "$/import-export/sharing/share-project";
import { FULL_PROJECT_SHARE } from "$/import-export/sharing/share-scope";

const WIDTH = 8;
const HEIGHT = 8;
const PIXEL_BYTES = WIDTH * HEIGHT * 4;

function source(): ShareProjectSource {
  const editor = new RasterEditor({
    width: WIDTH,
    height: HEIGHT,
    data: new Uint8ClampedArray(PIXEL_BYTES).fill(255),
  });
  return {
    name: "test.aseprite",
    sprite: asepriteFromProject(projectFromDocument(editor.getSnapshot().document!)),
    currentFrame: 0,
    composeGroups: false,
  };
}

describe("sharing source preparation", () => {
  it("allows a small selected frame from an original exceeding the decoded budget", () => {
    const original = source();
    const first = original.sprite.frames[0];
    original.sprite.frames.push({ ...first, index: 1 });
    assert.throws(() => prepareShareProjectSource(original, FULL_PROJECT_SHARE, PIXEL_BYTES));
    const selected = prepareShareProjectSource(
      original,
      { ...FULL_PROJECT_SHARE, currentFrame: true },
      PIXEL_BYTES,
    );
    assert.equal(selected.sprite.frames.length, 1);
    assert.equal(selected.sprite.frames[0].cels[0].pixels, first.cels[0].pixels);
    assert.equal(original.sprite.frames.length, 2);
  });

  it("checks lazy cel dimensions without decoding pixels and defers pixel normalization", () => {
    const original = source();
    const cel = original.sprite.frames[0].cels[0];
    Object.defineProperty(cel, "pixels", {
      get: () => {
        throw new Error("Unexpected main-thread pixel decode");
      },
    });
    const selected = prepareShareProjectSource(
      original,
      { ...FULL_PROJECT_SHARE, cleanTransparentRgb: true },
      PIXEL_BYTES,
    );
    assert.equal(selected.sprite.frames[0].cels[0], cel);
    assert.equal(selected.reductions?.cleanTransparentRgb, true);
    assert.throws(() => prepareShareProjectSource(original, FULL_PROJECT_SHARE, PIXEL_BYTES - 1));
  });

  it("defers flattening until after the selected source reaches the background runtime", () => {
    const original = source();
    const pixels = original.sprite.frames[0].cels[0].pixels;
    const selected = prepareShareProjectSource(
      original,
      { ...FULL_PROJECT_SHARE, flattenVisibleLayers: true },
      PIXEL_BYTES,
    );
    assert.equal(selected.reductions?.flattenVisibleLayers, true);
    assert.equal(selected.sprite.frames[0].cels[0].pixels, pixels);
  });

  it("materializes linked current frames for budgeting without changing the original link", () => {
    const original = source();
    const first = original.sprite.frames[0];
    original.sprite.frames.push({
      ...first,
      index: 1,
      cels: first.cels.map((cel) => ({
        ...cel,
        type: AsepriteCelType.Linked,
        linkedFrame: 0,
        pixels: undefined,
      })),
    });
    original.currentFrame = 1;
    const selected = prepareShareProjectSource(
      original,
      { ...FULL_PROJECT_SHARE, currentFrame: true },
      PIXEL_BYTES,
    );
    assert.equal(selected.currentFrame, 0);
    assert.equal(selected.sprite.frames[0].cels[0].pixels, first.cels[0].pixels);
    assert.equal(original.sprite.frames[1].cels[0].type, AsepriteCelType.Linked);
    assert.throws(() =>
      prepareShareProjectSource(
        original,
        { ...FULL_PROJECT_SHARE, currentFrame: true },
        PIXEL_BYTES - 1,
      ),
    );
  });

  it("counts tilemap expansion, tileset pixels and retained indexed samples", () => {
    const original = source();
    original.sprite.layers[0].type = AsepriteLayerType.Tilemap;
    original.sprite.layers[0].tilesetIndex = 0;
    original.sprite.tilesets = [
      {
        id: 0,
        flags: 6,
        name: "Tiles",
        tileWidth: 2,
        tileHeight: 2,
        tileCount: 1,
        baseIndex: 0,
        pixels: new Uint8Array(16),
        asepritePixels: new Uint8Array(4),
      },
    ];
    const budget = WIDTH * HEIGHT * 2 * 2 * 4 + 16 + 4;
    assert.doesNotThrow(() => prepareShareProjectSource(original, FULL_PROJECT_SHARE, budget));
    assert.throws(() => prepareShareProjectSource(original, FULL_PROJECT_SHARE, budget - 1));
  });
});
