import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { updateAsepriteFramePalette } from "$/color/operations/color-mode";
import type { EditorDocument } from "$/document/types";

const red: readonly Rgba[] = [[255, 0, 0, 255]];
const blue: readonly Rgba[] = [[0, 0, 255, 255]];
const green: readonly Rgba[] = [[0, 255, 0, 255]];

function documentWithPalettes(palettes: (readonly Rgba[] | undefined)[], activeFrame: number) {
  const pixels = { width: 1, height: 1, data: new Uint8ClampedArray(red[0]) };
  const samples = { depth: 8 as const, width: 1, height: 1, data: new Uint8Array([0]) };
  const document: EditorDocument = {
    name: "Palette animation",
    width: 1,
    height: 1,
    selection: null,
    palette: palettes[activeFrame] ?? red,
    layer: { name: "Background", pixels, x: 0, y: 0, visible: true, locked: false },
    timeline: {
      colorDepth: 8,
      activeFrame,
      activeLayer: 0,
      layers: [
        {
          id: "background",
          name: "Background",
          opacity: 255,
          flags: 11,
          visible: true,
          locked: false,
        },
      ],
      frames: palettes.map((palette) => ({
        duration: 100,
        palette,
        cels: [{ pixels, asepriteSamples: samples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      })),
    },
  };
  return document;
}

describe("shared frame palette editing", () => {
  it("updates earlier and later frames sharing the current palette, including linked indexed projections", () => {
    const document = documentWithPalettes([red, red, red], 1);
    const before = document.timeline!;

    updateAsepriteFramePalette(document, green);

    const frames = document.timeline!.frames;
    for (const frame of frames) {
      assert.deepEqual(frame.palette, green);
      assert.equal(frame.palette, document.palette);
      assert.deepEqual([...frame.cels[0]!.pixels.data], green[0]);
      assert.equal(frame.cels[0]!.asepriteSamples, before.frames[0].cels[0]!.asepriteSamples);
      assert.equal(frame.cels[0]!.pixels, document.layer.pixels);
    }
    assert.equal(before.frames[0].palette, red);
    assert.deepEqual([...before.frames[0].cels[0]!.pixels.data], red[0]);
  });

  it("stops at palette changes on both sides, even when the old palette reappears later", () => {
    const document = documentWithPalettes([red, blue, red, red, red, blue, red], 3);
    const before = document.timeline!;

    updateAsepriteFramePalette(document, green);

    const frames = document.timeline!.frames;
    for (const index of [2, 3, 4]) assert.deepEqual(frames[index].palette, green);
    for (const index of [0, 1, 5, 6]) assert.equal(frames[index], before.frames[index]);
  });

  it("keeps one shared palette when frames originally use the document palette", () => {
    const document = documentWithPalettes([undefined, undefined, undefined], 1);

    updateAsepriteFramePalette(document, green);

    for (const frame of document.timeline!.frames) {
      assert.equal(frame.palette, document.palette);
      assert.deepEqual(frame.palette, green);
    }
  });
});
