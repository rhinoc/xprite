import { describe, expect, it } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { usedPaletteEntries } from "$/color/palette-usage";
import type { EditorDocument } from "$/document/types";
import type { SpriteTimeline } from "$/timeline/types";

const palette: readonly Rgba[] = [
  [0, 0, 0, 0],
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [255, 0, 0, 255],
  [255, 0, 0, 0],
  [255, 0, 0, 128],
];
const pixels = (...colors: readonly Rgba[]): PixelBuffer => ({
  width: colors.length,
  height: 1,
  data: new Uint8ClampedArray(colors.flat()),
});
const cel = (image: PixelBuffer) => ({ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 });
const layer = (id: string, visible = true) => ({
  id,
  name: id,
  visible,
  locked: false,
  opacity: 255,
  flags: 0,
});
const document = (image: PixelBuffer, timeline?: SpriteTimeline): EditorDocument => ({
  name: "usage",
  width: image.width,
  height: image.height,
  selection: null,
  palette,
  layer: { name: "image", pixels: image, x: 0, y: 0, visible: true, locked: false },
  timeline,
});

describe("palette usage", () => {
  it("matches RGBA exactly, selects duplicate entries, and ignores transparent hidden RGB", () => {
    const image = pixels(palette[1]!, palette[4]!, palette[5]!);
    expect(usedPaletteEntries(document(image), palette)).toEqual([0, 1, 3, 5]);
  });

  it("includes hidden layers and other frames, then respects a selected cel range", () => {
    const red = pixels(palette[1]!);
    const green = pixels(palette[2]!);
    const timeline: SpriteTimeline = {
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("visible"), layer("hidden", false)],
      frames: [
        { duration: 100, cels: [null, cel(red)] },
        { duration: 100, cels: [cel(green), null] },
      ],
    };
    expect(usedPaletteEntries(document(red, timeline), palette)).toEqual([0, 1, 2, 3]);
    expect(
      usedPaletteEntries(
        document(red, { ...timeline, range: { kind: "cels", frames: [1], layers: [0] } }),
        palette,
      ),
    ).toEqual([0, 2]);
  });

  it("preserves the used indexed slot when palette colors are duplicated", () => {
    const image = pixels(palette[3]!);
    const timeline: SpriteTimeline = {
      activeFrame: 0,
      activeLayer: 0,
      colorDepth: 8,
      layers: [layer("indexed")],
      frames: [
        {
          duration: 100,
          cels: [
            {
              ...cel(image),
              asepriteSamples: { depth: 8, width: 1, height: 1, data: new Uint8Array([3]) },
            },
          ],
        },
      ],
    };
    expect(usedPaletteEntries(document(image, timeline), palette)).toEqual([0, 3]);
  });

  it("counts only referenced tiles and ignores tile flip bits", () => {
    const image = pixels(palette[2]!);
    const timeline: SpriteTimeline = {
      activeFrame: 0,
      activeLayer: 0,
      colorDepth: 8,
      layers: [{ ...layer("tiles"), kind: "tilemap", tilesetId: 1 }],
      frames: [
        {
          duration: 100,
          cels: [
            {
              ...cel(image),
              tilemap: { width: 1, height: 1, tiles: new Uint32Array([0x80000001]) },
            },
          ],
        },
      ],
      tilesets: [
        {
          id: 1,
          flags: 2,
          name: "tiles",
          tileWidth: 1,
          tileHeight: 1,
          tileCount: 3,
          baseIndex: 0,
          pixels: new Uint8Array(palette.slice(0, 3).flat()),
          asepritePixels: new Uint8Array([0, 2, 3]),
        },
      ],
    };
    expect(usedPaletteEntries(document(image, timeline), palette)).toEqual([0, 2]);
  });
});
