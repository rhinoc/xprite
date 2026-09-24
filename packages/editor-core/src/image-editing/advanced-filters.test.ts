import { describe, expect, it } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import { RasterEditor } from "$/editor/RasterEditor";
import {
  ConvolutionPreset,
  colorCurveMap,
  convolutionSamples,
  medianSamples,
  normalizeColorCurve,
} from "$/image-editing/advanced-filters";
import {
  EffectKind,
  EffectTarget,
  applyDocumentEffect,
  applyEffectPixels,
  defaultEffect,
} from "$/image-editing/effects";

const rgba = (values: readonly Rgba[]): PixelBuffer => ({
  width: values.length,
  height: 1,
  data: new Uint8ClampedArray(values.flat()),
});
const red = (value: number): Rgba => [value, 0, 0, 255];
const reds = (pixels: PixelBuffer) => Array.from(pixels.data).filter((_, index) => index % 4 === 0);

describe("advanced image filters", () => {
  it("uses bounded, unique, piecewise-linear LUTs with integer interpolation", () => {
    expect(
      Array.from(
        colorCurveMap([
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ]),
      ),
    ).toEqual(Array.from({ length: 256 }, (_, index) => index));
    expect(
      Array.from(
        colorCurveMap([
          { x: 10, y: 10 },
          { x: 13, y: 5 },
        ]).slice(9, 15),
      ),
    ).toEqual([10, 10, 9, 7, 5, 5]);
    expect(
      normalizeColorCurve([
        { x: 255, y: -1 },
        { x: 0, y: 12 },
        { x: 0, y: 24 },
      ]),
    ).toEqual([
      { x: 0, y: 24 },
      { x: 255, y: 0 },
    ]);
    expect(() => colorCurveMap([])).toThrow();
    expect(() => colorCurveMap([{ x: Number.NaN, y: 0 }])).toThrow();
  });

  it("matches independent sorted neighborhoods for all wrap axes, even sizes and masks", () => {
    const width = 5,
      height = 4;
    const source = Uint8Array.from(
      { length: width * height * 4 },
      (_, index) => (index * 73 + index * index * 19) % 256,
    );
    const writable = (x: number, y: number) => (x + y) % 2 === 0;
    for (const tiled of [0, 1, 2, 3])
      for (const [kw, kh] of [
        [1, 1],
        [2, 3],
        [3, 3],
        [7, 6],
      ]) {
        const expected = new Uint8ClampedArray(source);
        const coord = (value: number, size: number, wrap: boolean) =>
          wrap ? ((value % size) + size) % size : Math.max(0, Math.min(size - 1, value));
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            if (writable(x, y))
              for (const channel of [0, 3]) {
                const values: number[] = [];
                for (let ky = 0; ky < kh; ky++)
                  for (let kx = 0; kx < kw; kx++) {
                    const sx = coord(x + kx - Math.floor(kw / 2), width, !!(tiled & 1));
                    const sy = coord(y + ky - Math.floor(kh / 2), height, !!(tiled & 2));
                    values.push(source[(sy * width + sx) * 4 + channel]);
                  }
                expected[(y * width + x) * 4 + channel] = values.sort((a, b) => a - b)[
                  Math.floor(values.length / 2)
                ];
              }
        expect(medianSamples(source, width, height, 4, [0, 3], kw, kh, tiled, writable)).toEqual(
          expected,
        );
      }
    expect(() => medianSamples(source, width, height, 4, [0], 101, 1, 0, writable)).toThrow();
  });

  it("limits median writes to a mask and preserves grayscale/alpha channel rules", () => {
    const source = rgba([
      [10, 10, 10, 255],
      [200, 200, 200, 0],
      [20, 20, 20, 255],
    ]);
    const before = source.data.slice();
    const spec = { kind: EffectKind.MedianBlur, width: 3, height: 1, channels: 16 } as const;
    const mask = { x: 1, y: 0, width: 1, height: 1, data: new Uint8Array([1]) };
    expect(Array.from(applyEffectPixels(source, spec, mask, false, 16).data.slice(4, 8))).toEqual([
      20, 20, 20, 0,
    ]);
    expect(
      Array.from(
        applyEffectPixels(source, { ...spec, channels: 8 }, null, false, 16).data.slice(4, 8),
      ),
    ).toEqual([200, 200, 200, 255]);
    expect(applyEffectPixels(source, { ...spec, channels: 8 }, null, true, 16).data).toEqual(
      before,
    );
    expect(source.data).toEqual(before);
  });

  it("convolves clamped/wrapped neighbors without mixing hidden transparent RGB", () => {
    const source = rgba([red(0), red(90), red(180)]);
    const spec = { kind: EffectKind.ConvolutionMatrix, preset: ConvolutionPreset.BoxBlur } as const;
    expect(reds(applyEffectPixels(source, spec))).toEqual([30, 90, 150]);
    expect(reds(applyEffectPixels(source, { ...spec, tiledMode: 1 }))).toEqual([90, 90, 90]);
    expect(
      Array.from(
        applyEffectPixels(
          rgba([
            [255, 0, 0, 255],
            [0, 255, 255, 0],
          ]),
          spec,
        ).data,
      ),
    ).toEqual([255, 0, 0, 170, 255, 0, 0, 85]);
    const empty = rgba([[123, 45, 67, 0]]);
    expect(applyEffectPixels(empty, spec).data).toEqual(empty.data);
    const indices = new Uint8Array([0, 0, 2]);
    expect(
      Array.from(
        convolutionSamples(
          indices,
          3,
          1,
          1,
          [0],
          ConvolutionPreset.BoxBlur,
          0,
          () => true,
          (pixel) => indices[pixel] === 0,
          { includeTransparentSamples: true, kernelDivisorChannel: 0 },
        ),
      ),
    ).toEqual([0, 0, 1]);
  });

  it("retains duplicate palette indices for RGB no-ops and supports direct index edits", () => {
    const palette: Rgba[] = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ];
    const image = rgba([palette[2], palette[1], palette[2]]);
    const samples = { depth: 8 as const, width: 3, height: 1, data: new Uint8Array([2, 1, 2]) };
    const cel = { pixels: image, asepriteSamples: samples, x: 0, y: 0, opacity: 255, zIndex: 0 };
    const doc: EditorDocument = {
      name: "indexed",
      width: 3,
      height: 1,
      palette,
      selection: null,
      layer: { name: "Background", pixels: image, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        colorDepth: 8,
        transparentIndex: 0,
        layers: [
          {
            id: "background",
            name: "Background",
            visible: true,
            locked: false,
            flags: 11,
            opacity: 255,
          },
        ],
        frames: [
          { duration: 100, cels: [cel] },
          { duration: 100, cels: [cel] },
        ],
      },
    };
    const median = { kind: EffectKind.MedianBlur, width: 3, height: 1 } as const;
    expect(applyDocumentEffect(doc, median)).toBe(doc);
    expect(
      applyDocumentEffect(doc, {
        kind: EffectKind.ConvolutionMatrix,
        preset: ConvolutionPreset.Identity,
      }),
    ).toBe(doc);
    const filtered = applyDocumentEffect(doc, { ...median, channels: 32 }, EffectTarget.All);
    const first = filtered.timeline!.frames[0].cels[0]!;
    expect(Array.from(first.asepriteSamples!.data)).toEqual([2, 2, 2]);
    expect(filtered.timeline!.frames[1].cels[0]!.asepriteSamples).toBe(first.asepriteSamples);
    const curve = applyDocumentEffect(doc, {
      kind: EffectKind.ColorCurve,
      channels: 32,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 1 },
        { x: 255, y: 255 },
      ],
    });
    expect(Array.from(curve.timeline!.frames[0].cels[0]!.asepriteSamples!.data)).toEqual([1, 2, 1]);
    expect(samples.data).toEqual(new Uint8Array([2, 1, 2]));
  });

  it.each([EffectKind.MedianBlur, EffectKind.ConvolutionMatrix, EffectKind.ColorCurve])(
    "isolates preview and keeps Apply/Cancel/undo for %s",
    (kind) => {
      const editor = new RasterEditor(rgba([red(10), red(255), red(20)]));
      editor.history.markSaved();
      const initial = defaultEffect(kind, red(0), red(255));
      const spec =
        initial.kind === EffectKind.ColorCurve
          ? {
              ...initial,
              points: [
                { x: 0, y: 255 },
                { x: 255, y: 0 },
              ],
            }
          : initial;
      const before = editor.canvas.composite().data.slice();
      editor.imageEditing.previewEffect(spec);
      expect(editor.canvas.composite().data).toEqual(before);
      expect(editor.getSnapshot().dirty).toBe(false);
      editor.imageEditing.previewEffect(null);
      editor.imageEditing.applyEffect(spec);
      const committed = editor.canvas.composite().data.slice();
      expect(committed).not.toEqual(before);
      editor.imageEditing.previewEffect(spec);
      editor.imageEditing.previewEffect(null);
      expect(editor.canvas.composite().data).toEqual(committed);
      editor.history.undo();
      expect(editor.canvas.composite().data).toEqual(before);
      expect(editor.getSnapshot().canUndo).toBe(false);
      editor.history.redo();
      expect(editor.canvas.composite().data).toEqual(committed);
    },
  );
});
