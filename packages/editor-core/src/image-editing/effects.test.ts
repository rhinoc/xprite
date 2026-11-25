import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import { activateTimelineCel } from "$/document/document";
import {
  EffectKind,
  HueSaturationMode,
  OUTLINE_MATRICES,
  applyEffectPixels,
  effectChannels,
  effectPixel,
  type EffectSpec,
} from "$/image-editing/effects";
import { selectionContains } from "$/selection/operations";

describe("effects-document [feature-7-12]", () => {
  it("effects-document behavior", async () => {
    Error.stackTraceLimit = 0;
    const { outputFiles } = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/image-editing/effects.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const pixel = (c) => ({ width: 1, height: 1, data: new Uint8ClampedArray(c) });
    const red = pixel([255, 0, 0, 255]),
      blue = pixel([0, 0, 255, 255]);
    const layer = (id, extra = {}) => ({
      id,
      name: id,
      flags: 3,
      visible: true,
      locked: false,
      opacity: 255,
      ...extra,
    });
    const cel = (pixels, x = 0, y = 0) => ({ pixels, x, y, opacity: 255, zIndex: 0 });
    function doc(timeline) {
      const d = {
        name: "effects",
        width: 4,
        height: 4,
        selection: null,
        timeline,
        layer: { name: "a", pixels: red, x: 0, y: 0, visible: true, locked: false },
      };
      activateTimelineCel(d, timeline.activeFrame, timeline.activeLayer);
      return d;
    }
    let d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("a"), layer("b")],
      frames: [
        { duration: 100, cels: [cel(red, 1, 1), cel(blue, 0, 0)] },
        { duration: 100, cels: [cel(red, 2, 2), cel(blue, 3, 3)] },
      ],
    });
    let out = m.applyDocumentEffect(d, { kind: "invert" });
    assert.notEqual(out, d);
    assert.deepEqual([...out.timeline.frames[0].cels[0].pixels.data], [0, 255, 255, 255]);
    assert.equal(
      out.timeline.frames[0].cels[0].pixels,
      out.timeline.frames[1].cels[0].pixels,
      "Linked images processed once and retained as links",
    );
    assert.equal(out.timeline.frames[1].cels[0].x, 2);
    assert.equal(out.timeline.frames[0].cels[1], d.timeline.frames[0].cels[1]);
    assert.equal(d.timeline.frames[0].cels[0].pixels, red);
    out = m.applyDocumentEffect(d, { kind: "brightness-contrast", brightness: 0, contrast: 0 });
    assert.equal(out, d, "Aseprite no-op filter yields no document/history change");
    const all = m.applyDocumentEffect(d, { kind: "invert" }, "all");
    assert.deepEqual([...all.timeline.frames[0].cels[1].pixels.data], [255, 255, 0, 255]);
    d.timeline = { ...d.timeline, layers: [layer("a"), layer("b", { locked: true })] };
    out = m.applyDocumentEffect(d, { kind: "invert" }, "all");
    assert.equal(
      out.timeline.frames[0].cels[1],
      d.timeline.frames[0].cels[1],
      "Locked layer remains unchanged",
    );
    d.timeline = {
      ...d.timeline,
      layers: [layer("a", { visible: false }), layer("b", { flags: 67 })],
    };
    assert.equal(
      m.applyDocumentEffect(d, { kind: "invert" }, "all"),
      d,
      "Invisible and reference layers are not writable filter targets",
    );
    d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("background", { flags: 11 })],
      frames: [{ duration: 100, cels: [cel(red)] }],
    });
    out = m.applyDocumentEffect(d, {
      kind: "replace-color",
      from: [255, 0, 0, 255],
      to: [4, 5, 6, 0],
      tolerance: 0,
    });
    assert.deepEqual(
      [...out.timeline.frames[0].cels[0].pixels.data],
      [4, 5, 6, 255],
      "Background ignores alpha channel edits",
    );
    d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("a")],
      frames: [
        {
          duration: 100,
          cels: [
            cel(
              {
                width: 3,
                height: 1,
                data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
              },
              -1,
              0,
            ),
          ],
        },
      ],
    });
    out = m.applyDocumentEffect(d, { kind: "invert" });
    assert.equal(out.timeline.frames[0].cels[0].x, -1);
    assert.deepEqual(
      [...out.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 0, 255, 255, 255, 0, 255, 255, 255],
      "Aseprite patch preserves cel pixels outside sprite",
    );
    const selected = {
      ...d,
      selection: { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([1]) },
    };
    const p = m.previewDocumentEffect(selected, { kind: "invert" });
    assert.equal(selected.timeline, d.timeline);
    assert.deepEqual(
      [...selected.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255],
    );
    assert.equal(p.selection, selected.selection);
    console.log(
      "Document effects: immutable/no-op, selected/all targets, linked identity, locked/reference visibility, background alpha, offcanvas preservation and preview isolation passed",
    );
  }, 60_000);
});

describe("applyEffectPixels LUT and scalar fast paths", () => {
  function referenceApplyEffectPixels(
    source: PixelBuffer,
    spec: EffectSpec,
    selection: PixelMask | null = null,
    background = false,
    depth: 8 | 16 | 32 = 32,
  ): PixelBuffer {
    const channels = effectChannels(spec, background, depth);
    const gray = (c: Rgba): Rgba => {
      const v = Math.trunc((Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2);
      return [v, v, v, c[3]];
    };
    const mapped = (channels & 16 ? 7 : 0) | (channels & 8);
    const pixelSpec: EffectSpec =
      depth !== 16
        ? spec
        : spec.kind === EffectKind.ReplaceColor
          ? { ...spec, channels: mapped, from: gray(spec.from), to: gray(spec.to) }
          : spec.kind === EffectKind.Outline
            ? { ...spec, channels: mapped, color: gray(spec.color), bgColor: gray(spec.bgColor) }
            : { ...spec, channels: mapped };
    const result = { ...source, data: source.data.slice() };
    const colorAt = (x: number, y: number): Rgba => {
      const at = (y * source.width + x) * 4;
      return [source.data[at], source.data[at + 1], source.data[at + 2], source.data[at + 3]];
    };
    const transparent = (c: Rgba, bg: Rgba) => !c[3] || c.every((v, i) => v === bg[i]);
    const offsets: [number, number][] = [];
    if (pixelSpec.kind === EffectKind.Outline) {
      let bit = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++, bit <<= 1) {
          if (pixelSpec.matrix & bit) offsets.push([dx, dy]);
        }
      }
    }
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        if (selection && !selectionContains(selection, x, y)) continue;
        const color = colorAt(x, y);
        let out: Rgba = color;
        if (pixelSpec.kind === EffectKind.Outline) {
          const outlineChannels = depth === 16 ? (pixelSpec.channels ?? 15) : channels;
          const tiled = pixelSpec.tiledMode ?? 0;
          let hasNeighbor = false;
          for (const [dx, dy] of offsets) {
            const nx =
              tiled & 1
                ? (((x + dx) % source.width) + source.width) % source.width
                : Math.max(0, Math.min(source.width - 1, x + dx));
            const ny =
              tiled & 2
                ? (((y + dy) % source.height) + source.height) % source.height
                : Math.max(0, Math.min(source.height - 1, y + dy));
            const neighborEmpty = transparent(colorAt(nx, ny), pixelSpec.bgColor);
            if (pixelSpec.place === "outside" ? !neighborEmpty : neighborEmpty) {
              hasNeighbor = true;
              break;
            }
          }
          if (
            hasNeighbor &&
            (pixelSpec.place === "outside"
              ? transparent(color, pixelSpec.bgColor)
              : !transparent(color, pixelSpec.bgColor))
          ) {
            out = color.map((v, c) =>
              outlineChannels & (1 << c) ? pixelSpec.color[c] : v,
            ) as unknown as Rgba;
          }
        } else if (depth === 16 && spec.kind === EffectKind.HueSaturation) {
          const lightness = Math.max(-100, Math.min(100, spec.lightness)) / 100;
          const alphaDelta = Math.max(-100, Math.min(100, spec.alpha)) / 100;
          const k =
            channels & 16
              ? Math.trunc(Math.max(0, Math.min(1, (color[0] / 255) * (1 + lightness))) * 255 + 0.5)
              : color[0];
          const a =
            color[3] && channels & 8
              ? Math.trunc(Math.max(0, Math.min(255, color[3] * (1 + alphaDelta))))
              : color[3];
          out = [k, k, k, a];
        } else {
          out = effectPixel(color, pixelSpec, background);
        }
        result.data.set(out, (y * source.width + x) * 4);
      }
    }
    return result;
  }

  it("matches reference pixel-by-pixel output across all effects, depths, channels, selections, and tiled modes", () => {
    const width = 17;
    const height = 13;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        if ((x + y) % 5 === 0) {
          data[at] = 10;
          data[at + 1] = 20;
          data[at + 2] = 30;
          data[at + 3] = 0;
        } else if (x === 0 || y === height - 1) {
          data[at] = 40;
          data[at + 1] = 50;
          data[at + 2] = 60;
          data[at + 3] = 255;
        } else {
          data[at] = (x * 17 + y * 11) & 255;
          data[at + 1] = (x * 29 + y * 7) & 255;
          data[at + 2] = (x * 5 + y * 31) & 255;
          data[at + 3] = (x + y) % 3 === 0 ? 128 : 255;
        }
      }
    }
    const source: PixelBuffer = { width, height, data };
    const grayData = data.slice();
    for (let at = 0; at < grayData.length; at += 4) {
      const g = grayData[at];
      grayData[at + 1] = g;
      grayData[at + 2] = g;
    }
    const graySource: PixelBuffer = { width, height, data: grayData };
    const selection: PixelMask = {
      x: 2,
      y: 1,
      width: 11,
      height: 9,
      data: Uint8Array.from({ length: 11 * 9 }, (_, i) => ((i * 7) % 3 === 0 ? 0 : 255)),
    };

    const specs: EffectSpec[] = [
      { kind: EffectKind.Invert },
      { kind: EffectKind.Invert, channels: 15 },
      { kind: EffectKind.Invert, channels: 5 },
      {
        kind: EffectKind.ColorCurve,
        points: [
          { x: 0, y: 12 },
          { x: 80, y: 210 },
          { x: 190, y: 64 },
          { x: 255, y: 245 },
        ],
      },
      {
        kind: EffectKind.ColorCurve,
        channels: 10,
        points: [
          { x: 0, y: 255 },
          { x: 255, y: 0 },
        ],
      },
      { kind: EffectKind.BrightnessContrast, brightness: 35, contrast: -40 },
      { kind: EffectKind.BrightnessContrast, brightness: -25, contrast: 60, channels: 13 },
      {
        kind: EffectKind.HueSaturation,
        mode: HueSaturationMode.HslMul,
        hue: 75,
        saturation: 30,
        lightness: -20,
        alpha: -50,
      },
      {
        kind: EffectKind.HueSaturation,
        mode: HueSaturationMode.HslAdd,
        hue: -120,
        saturation: -40,
        lightness: 25,
        alpha: 20,
        channels: 7,
      },
      {
        kind: EffectKind.HueSaturation,
        mode: HueSaturationMode.HsvMul,
        hue: 160,
        saturation: -30,
        lightness: 15,
        alpha: -100,
      },
      {
        kind: EffectKind.HueSaturation,
        mode: HueSaturationMode.HsvAdd,
        hue: -45,
        saturation: 40,
        lightness: -35,
        alpha: 0,
        channels: 8,
      },
      {
        kind: EffectKind.ReplaceColor,
        from: [40, 50, 60, 255],
        to: [200, 100, 50, 180],
        tolerance: 0,
      },
      {
        kind: EffectKind.ReplaceColor,
        from: [120, 120, 120, 255],
        to: [10, 240, 90, 200],
        tolerance: 70,
        channels: 7,
      },
      {
        kind: EffectKind.Outline,
        color: [255, 200, 100, 255],
        bgColor: [0, 0, 0, 0],
        place: "outside",
        matrix: OUTLINE_MATRICES.circle,
        tiledMode: 0,
      },
      {
        kind: EffectKind.Outline,
        color: [10, 20, 240, 255],
        bgColor: [40, 50, 60, 255],
        place: "inside",
        matrix: OUTLINE_MATRICES.square,
        tiledMode: 3,
      },
      {
        kind: EffectKind.Outline,
        color: [220, 10, 80, 128],
        bgColor: [0, 0, 0, 0],
        place: "outside",
        matrix: OUTLINE_MATRICES.horizontal,
        tiledMode: 1,
        channels: 11,
      },
      {
        kind: EffectKind.Outline,
        color: [0, 255, 128, 255],
        bgColor: [0, 0, 0, 0],
        place: "inside",
        matrix: OUTLINE_MATRICES.vertical,
        tiledMode: 2,
      },
    ];

    for (const spec of specs) {
      for (const mask of [null, selection]) {
        for (const background of [false, true]) {
          for (const depth of [32, 16, 8] as const) {
            const input = depth === 16 ? graySource : source;
            const actual = applyEffectPixels(input, spec, mask, background, depth);
            const expected = referenceApplyEffectPixels(input, spec, mask, background, depth);
            assert.deepEqual(
              actual.data,
              expected.data,
              `Mismatch for ${spec.kind} depth=${depth} bg=${background} mask=${Boolean(mask)}`,
            );
          }
        }
      }
    }

    // 1x1 tiled outline edge case.
    const onePixel: PixelBuffer = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    };
    const tiledOutline: EffectSpec = {
      kind: EffectKind.Outline,
      color: [0, 255, 0, 255],
      bgColor: [0, 0, 0, 0],
      place: "inside",
      matrix: OUTLINE_MATRICES.square,
      tiledMode: 3,
    };
    assert.deepEqual(
      applyEffectPixels(onePixel, tiledOutline).data,
      referenceApplyEffectPixels(onePixel, tiledOutline).data,
    );
  });

  it("processes large images cleanly across LUT and scalar filters", () => {
    const size = 256;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = (i * 13) & 255;
      data[i * 4 + 1] = (i * 29) & 255;
      data[i * 4 + 2] = (i * 53) & 255;
      data[i * 4 + 3] = i % 7 === 0 ? 0 : 255;
    }
    const image: PixelBuffer = { width: size, height: size, data };
    const inverted = applyEffectPixels(image, { kind: EffectKind.Invert });
    assert.equal(inverted.data[4], 255 - data[4]);
    const bc = applyEffectPixels(image, {
      kind: EffectKind.BrightnessContrast,
      brightness: 15,
      contrast: 25,
    });
    assert.equal(bc.data.length, data.length);
    const hs = applyEffectPixels(image, {
      kind: EffectKind.HueSaturation,
      mode: HueSaturationMode.HslMul,
      hue: 45,
      saturation: 20,
      lightness: 10,
      alpha: 0,
    });
    assert.equal(hs.data[3], 0);
    const outlined = applyEffectPixels(image, {
      kind: EffectKind.Outline,
      color: [255, 255, 255, 255],
      bgColor: [0, 0, 0, 0],
      place: "outside",
      matrix: OUTLINE_MATRICES.circle,
      tiledMode: 0,
    });
    assert.equal(outlined.data[3], 255);
  });
});
