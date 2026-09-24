import { describe, expect, it, vi } from "vitest";

import { EditorAllocationError } from "$/base/errors";
import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import type { AsepriteIndexWriter } from "$/color/types";
import {
  DrawingRasterizer,
  type DrawingRasterPaintTarget,
  type DrawingRasterSettings,
} from "$/drawing/rasterizer";
import { AsepriteInk } from "$/drawing/tool-settings";

const red: Rgba = [240, 30, 20, 255];
const transparent: Rgba = [0, 0, 0, 0];
const blue: Rgba = [10, 40, 230, 255];

function makeTarget(overrides: Partial<DrawingRasterPaintTarget> = {}): DrawingRasterPaintTarget {
  return {
    image: { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) },
    documentWidth: 8,
    documentHeight: 6,
    layerOffset: { x: 1, y: 0 },
    selection: null,
    colorDepth: 32,
    palette: undefined,
    framePalette: undefined,
    transparentIndex: 0,
    backgroundLayer: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<DrawingRasterSettings> = {}): DrawingRasterSettings {
  return {
    tool: "pencil",
    brush: { shape: "square", size: 1, angle: 0 },
    foreground: red,
    background: blue,
    opacity: 255,
    pixelPerfect: false,
    sprayWidth: 16,
    spraySpeed: 32,
    tolerance: 0,
    contiguous: true,
    text: "",
    font: null,
    textScale: 1,
    ...overrides,
  };
}

function makeHarness(
  options: {
    target?: DrawingRasterPaintTarget;
    prepare?: () => DrawingRasterPaintTarget | null;
    createWriter?: (
      preferredIndex?: number,
      mode?: "bestfit" | "octree",
    ) => AsepriteIndexWriter | undefined;
  } = {},
) {
  const current = options.target ?? makeTarget();
  const captures: Array<{
    image: PixelBuffer;
    rect: { x: number; y: number; width: number; height: number };
  }> = [];
  const capture = vi.fn(
    (image: PixelBuffer, rect: { x: number; y: number; width: number; height: number }) => {
      captures.push({ image, rect });
    },
  );
  const reportAllocationFailure = vi.fn();
  const writerCalls: Array<{ preferredIndex?: number; mode?: "bestfit" | "octree" }> = [];
  const rasterizer = new DrawingRasterizer({
    target: {
      getPaintTarget: () => current,
      preparePaintTarget: options.prepare ?? (() => current),
      reportAllocationFailure,
    },
    capture: { capture },
    asepriteIndexWriter: {
      create: (preferredIndex, mode) => {
        writerCalls.push({ preferredIndex, mode });
        return (
          options.createWriter?.(preferredIndex, mode) ?? {
            read: () => undefined,
            write: () => false,
          }
        );
      },
      createShading: () => undefined,
    },
  });
  return { rasterizer, current, captures, capture, reportAllocationFailure, writerCalls };
}

function gesture(overrides: Record<string, unknown> = {}) {
  return {
    pressure: 1,
    previousPressure: 1,
    speed: { x: 0, y: 0 },
    sprayRemainder: 0,
    dynamics: null,
    points: [],
    tool: "pencil" as const,
    coverage: new Set<number>(),
    pixelPerfect: null,
    fillPixelPerfect: null,
    ...overrides,
  } as Parameters<DrawingRasterizer["draw"]>[0];
}

describe("DrawingRasterizer", () => {
  it("routes ordinary paint through symmetry and the selection mask, capturing before writes", () => {
    const selection: PixelMask = { x: 3, y: 2, width: 1, height: 1, data: new Uint8Array([1]) };
    const target = makeTarget({ selection });
    const { rasterizer, captures } = makeHarness({ target });
    const state = gesture();

    expect(
      rasterizer.draw(
        state,
        [{ x: 3, y: 2 }],
        "pencil",
        1,
        makeSettings({
          symmetryEnabled: true,
          symmetryMode: 1,
          symmetryX: 4,
        }),
      ),
    ).toBe(true);

    const pixelOffset = (2 * target.image.width + 2) * 4;
    expect(Array.from(target.image.data.slice(pixelOffset, pixelOffset + 4))).toEqual(red);
    expect(captures).toHaveLength(1);
    expect(captures[0].rect).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    expect(state.wrotePixels).toBe(true);
  });

  it("combines mirrored selection geometry in document coordinates", () => {
    const { rasterizer } = makeHarness();
    const mask = rasterizer.incomingSelection(
      { points: [{ x: 2, y: 1 }], tool: "marquee" },
      makeSettings({ tool: "marquee", symmetryEnabled: true, symmetryMode: 1, symmetryX: 4 }),
    );

    expect(mask).not.toBeNull();
    const contains = (x: number, y: number) =>
      !!mask &&
      x >= mask.x &&
      y >= mask.y &&
      x < mask.x + mask.width &&
      y < mask.y + mask.height &&
      !!mask.data[(y - mask.y) * mask.width + x - mask.x];
    expect(contains(2, 1)).toBe(true);
    expect(contains(5, 1)).toBe(true);
  });

  it("uses the tilemap adapter to expand a marquee to tile bounds", () => {
    const target = makeTarget();
    const rasterizer = new DrawingRasterizer({
      target: {
        getPaintTarget: () => target,
        preparePaintTarget: () => target,
        reportAllocationFailure: () => {},
      },
      capture: { capture: () => {} },
      asepriteIndexWriter: { create: () => undefined, createShading: () => undefined },
      tilemap: {
        getContext: () => ({
          active: true,
          tileSelectionMode: true,
          pixelMode: false,
          manualTileset: false,
          tileWidth: 2,
          tileHeight: 2,
        }),
        createAsepriteIndexWriter: () => ({ read: () => undefined, write: () => false }),
      },
    });

    const mask = rasterizer.incomingSelection(
      {
        points: [{ x: 2, y: 1 }],
        tool: "marquee",
      },
      makeSettings({ tool: "marquee", symmetryEnabled: true, symmetryMode: 1, symmetryX: 4 }),
    );

    expect(mask).not.toBeNull();
    expect(mask).toMatchObject({ x: 2, y: 1, width: 2, height: 2 });
    expect(Array.from(mask?.data ?? [])).toEqual([1, 1, 1, 1]);
  });

  it("selects a direct indexed writer from the active color profile", () => {
    const target = makeTarget({
      colorDepth: 8,
      palette: [transparent, red, blue],
      framePalette: [transparent, red, blue],
      transparentIndex: 0,
    });
    const { rasterizer, writerCalls } = makeHarness({ target });

    const writer = rasterizer.createAsepriteIndexWriter(
      1,
      makeSettings({ ink: AsepriteInk.Simple, foreground: red }),
    );

    expect(writer).toBeDefined();
    expect(writerCalls).toEqual([{ preferredIndex: 1, mode: "octree" }]);
  });

  it("does not allocate an indexed writer for the transparent alpha-compositing color", () => {
    const target = makeTarget({
      colorDepth: 8,
      palette: [transparent, red],
      framePalette: [transparent, red],
      transparentIndex: 0,
    });
    const { rasterizer, writerCalls } = makeHarness({ target });

    expect(
      rasterizer.createAsepriteIndexWriter(
        1,
        makeSettings({ ink: AsepriteInk.AlphaCompositing, foreground: transparent }),
      ),
    ).toBeUndefined();
    expect(writerCalls).toHaveLength(0);
  });

  it("reports cel allocation failure and declines the stroke without swallowing other errors", () => {
    const allocationError = new EditorAllocationError(100_000, 1);
    const failed = makeHarness({
      prepare: () => {
        throw allocationError;
      },
    });

    expect(failed.rasterizer.draw(gesture(), [{ x: 2, y: 2 }], "pencil", 1, makeSettings())).toBe(
      false,
    );
    expect(failed.reportAllocationFailure).toHaveBeenCalledWith(allocationError);

    const unexpected = new Error("unexpected");
    const broken = makeHarness({
      prepare: () => {
        throw unexpected;
      },
    });
    expect(() =>
      broken.rasterizer.draw(gesture(), [{ x: 2, y: 2 }], "pencil", 1, makeSettings()),
    ).toThrow(unexpected);
  });
});
