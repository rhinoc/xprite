import { describe, expect, it } from "vitest";

import {
  isPsdData,
  isPsdFileName,
  projectFromPsd,
  PsdCodecError,
  PsdColorMode,
  PsdIssueCode,
  type PsdDocument,
  type PsdLayer,
} from "$/import-export/psd";
import { renderTimelineFrame } from "$/timeline";

function solidPixels(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

function baseLayer(overrides: Partial<PsdLayer> = {}): PsdLayer {
  return {
    name: "Layer",
    left: 0,
    top: 0,
    right: 2,
    bottom: 2,
    hidden: false,
    opacity: 255,
    fillOpacity: 255,
    blendMode: "normal",
    clipping: false,
    locked: false,
    positionLocked: false,
    ...overrides,
  };
}

describe("PSD signature helpers", () => {
  it("recognizes 8BPS magic bytes and PSD/PSB extensions", () => {
    expect(isPsdData(new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1]))).toBe(true);
    expect(isPsdData(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isPsdData(new Uint8Array([0x38, 0x42]))).toBe(false);
    expect(isPsdFileName("sprite.psd")).toBe(true);
    expect(isPsdFileName("LARGE.PSB")).toBe(true);
    expect(isPsdFileName("sprite.png")).toBe(false);
  });
});

describe("projectFromPsd", () => {
  it("maps nested groups, blend modes, fill opacity, solid color fills, masks, and clipping", () => {
    // 2x2 mask: left column opaque (255), right column transparent (0)
    const maskData = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    const doc: PsdDocument = {
      width: 2,
      height: 2,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Texture Group",
          blendMode: "pass through",
          opened: false,
          children: [
            baseLayer({
              name: "Base Solid",
              solidColor: [200, 100, 50, 255],
              mask: {
                left: 0,
                top: 0,
                right: 2,
                bottom: 2,
                defaultColor: 0,
                disabled: false,
                pixels: { width: 2, height: 2, data: maskData },
              },
            }),
            baseLayer({
              name: "Clipped Tint",
              clipping: true,
              blendMode: "multiply",
              opacity: 255,
              fillOpacity: 128,
              solidColor: [0, 255, 0, 255],
            }),
          ],
        }),
        baseLayer({
          name: "Value Check",
          adjustment: {
            type: "hue/saturation",
            colorize: false,
            master: { hue: 0, saturation: -100, lightness: 0 },
          },
          hidden: true,
        }),
      ],
    };

    const project = projectFromPsd(doc);
    // Adjustment layer is skipped; group + 2 image layers remain.
    expect(project.timeline.layers.map((layer) => layer.name)).toEqual([
      "Texture Group",
      "Base Solid",
      "Clipped Tint",
    ]);
    expect(project.timeline.layers[0].kind).toBe("group");
    expect(project.timeline.layers[1].parentId).toBe(project.timeline.layers[0].id);
    expect(project.timeline.layers[2].blendMode).toBe(1); // Multiply
    expect(project.timeline.layers[2].opacity).toBe(128);

    const baseCel = project.timeline.frames[0].cels[1]!;
    const clippedCel = project.timeline.frames[0].cels[2]!;
    // Masked layer compacts to the opaque left column (1×2); right column stays transparent on canvas.
    expect(baseCel.pixels.width).toBe(1);
    expect(baseCel.pixels.height).toBe(2);
    expect(clippedCel.pixels.width).toBe(1);
    expect(clippedCel.pixels.height).toBe(2);
    expect(project.image.data[3]).toBe(255);
    expect(project.image.data[7]).toBe(0);
  });

  it("resolves multi-frame Photoshop Frame Animation with inherited mlst states and offsets", () => {
    const red = solidPixels(1, 1, [255, 0, 0, 255]);
    const blue = solidPixels(1, 1, [0, 0, 255, 255]);
    const doc: PsdDocument = {
      width: 4,
      height: 4,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      animations: {
        activeAnimation: 0,
        frames: [
          { id: 10, delaySeconds: 0.1 },
          { id: 20, delaySeconds: 0.25 },
        ],
        sequences: [{ id: 0, frameIds: [10, 20], repeats: 0, activeFrame: 1 }],
      },
      children: [
        baseLayer({
          name: "Frame 1",
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          hidden: true, // Saved while frame 2 was active
          pixels: red,
          animationFrames: [
            { frameIds: [10], enabled: true },
            { frameIds: [20], enabled: false },
          ],
        }),
        baseLayer({
          name: "Mover",
          left: 2,
          top: 1,
          right: 3,
          bottom: 2,
          hidden: false,
          pixels: blue,
          animationFrames: [
            { frameIds: [10], enabled: true, offsetX: 0, offsetY: 0 },
            { frameIds: [20], offsetX: 2, offsetY: 1 }, // inherits enabled: true
          ],
        }),
      ],
    };

    const project = projectFromPsd(doc);
    expect(project.timeline.frames).toHaveLength(2);
    expect(project.timeline.frames.map((frame) => frame.duration)).toEqual([100, 250]);
    expect(project.timeline.loopCount).toBe(0);
    // Frame 1 layer is marked visible because it appears on frame 0.
    expect(project.timeline.layers[0].visible).toBe(true);
    expect(project.timeline.frames[0].cels[0]).not.toBeNull();
    expect(project.timeline.frames[1].cels[0]).toBeNull();
    // Mover active frame is frame 1 (offset 2,1) at (2,1), so frame 0 (offset 0,0) shifts to (0,0).
    expect(project.timeline.frames[0].cels[1]).toMatchObject({ x: 0, y: 0 });
    expect(project.timeline.frames[1].cels[1]).toMatchObject({ x: 2, y: 1 });
    // PixelBuffer instance is shared across frames for the same layer.
    expect(project.timeline.frames[0].cels[1]!.pixels).toBe(
      project.timeline.frames[1].cels[1]!.pixels,
    );

    const frame1 = renderTimelineFrame(project.timeline, 4, 4, 1);
    const blueOffset = (1 * 4 + 2) * 4;
    expect(Array.from(frame1.data.subarray(blueOffset, blueOffset + 4))).toEqual([0, 0, 255, 255]);
  });

  it("falls back to composite pixels when a PSD has no layer records and enforces limits", () => {
    const composite = solidPixels(2, 2, [10, 20, 30, 255]);
    const project = projectFromPsd({
      width: 2,
      height: 2,
      colorMode: PsdColorMode.Indexed,
      bitsPerChannel: 8,
      palette: [[10, 20, 30, 255]],
      composite,
    });
    expect(project.timeline.layers[0].name).toBe("Background");
    expect(project.palette).toEqual([[10, 20, 30, 255]]);
    expect(Array.from(project.image.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);

    expect(() =>
      projectFromPsd(
        {
          width: 10,
          height: 10,
          colorMode: PsdColorMode.Rgb,
          bitsPerChannel: 8,
        },
        { limits: { maxWidth: 4 } },
      ),
    ).toThrow(PsdCodecError);
    try {
      projectFromPsd(
        { width: 10, height: 10, colorMode: PsdColorMode.Rgb, bitsPerChannel: 8 },
        { limits: { maxWidth: 4 } },
      );
    } catch (error) {
      expect((error as PsdCodecError).code).toBe(PsdIssueCode.ResourceLimit);
    }
  });

  it("rasterizes vector masks with combine/subtract subpaths and invert", () => {
    const rectKnots = (x0: number, y0: number, x1: number, y1: number) => [
      { points: [x0, y0, x0, y0, x0, y0] as [number, number, number, number, number, number] },
      { points: [x1, y0, x1, y0, x1, y0] as [number, number, number, number, number, number] },
      { points: [x1, y1, x1, y1, x1, y1] as [number, number, number, number, number, number] },
      { points: [x0, y1, x0, y1, x0, y1] as [number, number, number, number, number, number] },
    ];
    const project = projectFromPsd({
      width: 10,
      height: 10,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Donut",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          solidColor: [255, 0, 0, 255],
          vectorMask: {
            invert: false,
            disabled: false,
            paths: [
              { open: false, operation: "combine", knots: rectKnots(1, 1, 9, 9) },
              { open: false, operation: "subtract", knots: rectKnots(3, 3, 7, 7) },
            ],
          },
        }),
      ],
    });
    const at = (x: number, y: number) => {
      const i = (y * 10 + x) * 4;
      return Array.from(project.image.data.subarray(i, i + 4));
    };
    expect(at(0, 0)[3]).toBe(0); // Outside outer box
    expect(at(2, 2)).toEqual([255, 0, 0, 255]); // Inside ring
    expect(at(5, 5)[3]).toBe(0); // Subtracted inner hole
  });

  it("rasterizes gradient fills and tiled pattern fills", () => {
    const checker = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255,
    ]);
    const project = projectFromPsd({
      width: 4,
      height: 4,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      patterns: [{ id: "pat-1", name: "Checker", pixels: { width: 2, height: 2, data: checker } }],
      children: [
        baseLayer({
          name: "Gradient",
          left: 0,
          top: 0,
          right: 4,
          bottom: 4,
          gradientFill: {
            style: "linear",
            angle: 0,
            scale: 1,
            reverse: false,
            offsetX: 0,
            offsetY: 0,
            colorStops: [
              { location: 0, midpoint: 0.5, color: [0, 0, 0, 255] },
              { location: 1, midpoint: 0.5, color: [255, 255, 255, 255] },
            ],
            opacityStops: [{ location: 0, midpoint: 0.5, opacity: 1 }],
          },
        }),
        baseLayer({
          name: "Pattern",
          left: 0,
          top: 0,
          right: 4,
          bottom: 4,
          patternFill: { patternId: "pat-1", scale: 1, phaseX: 0, phaseY: 0 },
        }),
      ],
    });
    const gradCel = project.timeline.frames[0].cels[0]!;
    // Left edge darker than right edge along horizontal gradient.
    expect(gradCel.pixels.data[0]).toBeLessThan(gradCel.pixels.data[3 * 4]);
    // Pattern tiles red/blue checkerboard across 4x4.
    const patCel = project.timeline.frames[0].cels[1]!;
    expect(Array.from(patCel.pixels.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(patCel.pixels.data.subarray(4, 8))).toEqual([0, 0, 255, 255]);
    expect(Array.from(patCel.pixels.data.subarray(8, 12))).toEqual([255, 0, 0, 255]);
  });

  it("bakes layer effects (color overlay, outside stroke, drop shadow) with fillOpacity isolation", () => {
    const project = projectFromPsd({
      width: 10,
      height: 10,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Styled",
          left: 3,
          top: 3,
          right: 7,
          bottom: 7,
          opacity: 255,
          fillOpacity: 0, // Fill hidden; effects must still render
          pixels: solidPixels(4, 4, [255, 0, 0, 255]),
          effects: {
            solidFills: [
              { enabled: true, blendMode: "normal", color: [0, 255, 0, 255], opacity: 255 },
            ],
            strokes: [
              {
                enabled: true,
                position: "outside",
                size: 1,
                blendMode: "normal",
                opacity: 255,
                color: [0, 0, 255, 255],
              },
            ],
          },
        }),
      ],
    });
    const at = (x: number, y: number) => {
      const i = (y * 10 + x) * 4;
      return Array.from(project.image.data.subarray(i, i + 4));
    };
    expect(at(4, 4)).toEqual([0, 255, 0, 255]); // Green color overlay even with fillOpacity=0
    expect(at(2, 4)).toEqual([0, 0, 255, 255]); // Blue 1px outside stroke
    expect(at(0, 0)[3]).toBe(0); // Transparent outside stroke
  });

  it("applies clipped and unclipped visible adjustment layers", () => {
    const project = projectFromPsd({
      width: 2,
      height: 1,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Base",
          left: 0,
          top: 0,
          right: 2,
          bottom: 1,
          pixels: {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([100, 150, 200, 255, 10, 20, 30, 255]),
          },
        }),
        baseLayer({
          name: "Invert Clipped",
          clipping: true,
          adjustment: { type: "invert" },
        }),
        baseLayer({
          name: "Threshold All",
          adjustment: { type: "threshold", level: 128 },
        }),
      ],
    });
    // First pixel [100,150,200] -> inverted [155,105,55] -> luma ~109 < 128 -> black [0,0,0,255]
    // Second pixel [10,20,30] -> inverted [245,235,225] -> luma ~237 >= 128 -> white [255,255,255,255]
    expect(Array.from(project.image.data.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(project.image.data.subarray(4, 8))).toEqual([255, 255, 255, 255]);
  });

  it("samples Photoshop video timeline keyframes and in/out visibility windows", () => {
    const project = projectFromPsd({
      width: 10,
      height: 10,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      videoTimeline: {
        enabled: true,
        frameRate: 10,
        durationSeconds: 0.4,
        workInSeconds: 0,
        workOutSeconds: 0.4,
        currentTimeSeconds: 0,
        repeats: 0,
      },
      children: [
        baseLayer({
          name: "Animated",
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          pixels: solidPixels(1, 1, [255, 255, 255, 255]),
          videoTimeline: {
            inSeconds: 0.1,
            outSeconds: 0.4,
            opacityKeys: [
              { timeSeconds: 0.1, interpolation: "linear", opacity: 0 },
              { timeSeconds: 0.3, interpolation: "linear", opacity: 255 },
            ],
            positionKeys: [
              { timeSeconds: 0.1, interpolation: "linear", x: 0, y: 0 },
              { timeSeconds: 0.3, interpolation: "linear", x: 4, y: 2 },
            ],
          },
        }),
      ],
    });
    expect(project.timeline.frames).toHaveLength(4);
    expect(project.timeline.frames[0].duration).toBe(100);
    // Frame 0 (t=0.0s) is before inSeconds=0.1s -> hidden
    expect(project.timeline.frames[0].cels[0]).toBeNull();
    // Frame 1 (t=0.1s) -> opacity 0, offset (0,0)
    expect(project.timeline.frames[1].cels[0]).toMatchObject({ x: 0, y: 0, opacity: 0 });
    // Frame 2 (t=0.2s) -> midpoint opacity ~128, offset (2,1)
    expect(project.timeline.frames[2].cels[0]).toMatchObject({ x: 2, y: 1, opacity: 128 });
    // Frame 3 (t=0.3s) -> opacity 255, offset (4,2)
    expect(project.timeline.frames[3].cels[0]).toMatchObject({ x: 4, y: 2, opacity: 255 });
  });

  it("clips children to Artboard rect, renders Artboard background, and supports blendInteriorElements", () => {
    const project = projectFromPsd({
      width: 10,
      height: 10,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Artboard 1",
          artboard: { left: 2, top: 2, right: 8, bottom: 8, backgroundColor: [255, 255, 255, 255] },
          children: [
            baseLayer({
              name: "Overflow",
              left: 0,
              top: 0,
              right: 10,
              bottom: 10,
              fillOpacity: 128,
              blendInteriorElements: true,
              pixels: solidPixels(10, 10, [0, 0, 0, 255]),
              effects: {
                solidFills: [
                  { enabled: true, blendMode: "normal", color: [0, 0, 255, 255], opacity: 255 },
                ],
              },
            }),
          ],
        }),
      ],
    });
    const at = (x: number, y: number) => {
      const i = (y * 10 + x) * 4;
      return Array.from(project.image.data.subarray(i, i + 4));
    };
    // Outside artboard must remain transparent
    expect(at(0, 0)[3]).toBe(0);
    // Inside artboard: blue solidFill scaled by fillOpacity=128 (~50%) over white artboard background -> ~[127,127,255,255]
    const inside = at(4, 4);
    expect(inside[0]).toBeGreaterThan(120);
    expect(inside[0]).toBeLessThan(135);
    expect(inside[2]).toBe(255);
  });

  it("bakes extra Photoshop-only blend modes (Linear Burn, Hard Mix) and Selective Color", () => {
    const project = projectFromPsd({
      width: 2,
      height: 1,
      colorMode: PsdColorMode.Rgb,
      bitsPerChannel: 8,
      children: [
        baseLayer({
          name: "Backdrop",
          left: 0,
          top: 0,
          right: 2,
          bottom: 1,
          pixels: {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255]),
          },
        }),
        baseLayer({
          name: "Linear Burn",
          left: 0,
          top: 0,
          right: 2,
          bottom: 1,
          blendMode: "linear burn",
          pixels: {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255]),
          },
        }),
        baseLayer({
          name: "Selective",
          adjustment: {
            type: "selective color",
            mode: "absolute",
            reds: { cyan: 50, magenta: 0, yellow: 0, black: 0 },
          },
        }),
      ],
    });
    // Linear Burn of [200,100,50] and [200,200,200] -> [145, 45, 0], then Selective Color adds cyan on reds -> lowers R
    expect(project.image.data[0]).toBeLessThan(145);
    expect(project.image.data[2]).toBe(0);
  });
});
