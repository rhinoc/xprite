import { describe, expect, test } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { analyzePalette } from "$/color";
import { RasterEditor } from "$/editor/RasterEditor";
import { rasterAnimationProject } from "$/import-export/image";
import { EditorSession } from "$/session/editor-session";
import {
  extractPixelatedFramesPalette,
  MAX_PIXELATED_PROJECT_PALETTE_COLORS,
} from "$/session/pixelated-frames-palette";
import { createBlankImage } from "$/session/recent-images";
import { SessionOutcome } from "$/session/types";
import { analyzePixelArt, PixelationAlgorithm } from "@xprite/pixelate";

function solidFrame(width: number, height: number, color: Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return { width, height, data };
}

function multiColorFrame(width: number, height: number, colors: readonly Rgba[]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let px = 0; px < width * height; px++) {
    const color = colors[px % colors.length];
    const i = px * 4;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return { width, height, data };
}

const colorKey = (color: Rgba) => color.join(",");

describe("extractPixelatedFramesPalette", () => {
  test("includes exact colors introduced in later frames sorted by total frequency", () => {
    const frame0 = solidFrame(4, 4, [240, 120, 40, 255]); // 16 px orange
    const frame1 = multiColorFrame(4, 4, [
      [30, 140, 220, 255], // 8 px blue
      [50, 200, 90, 255], // 8 px green
    ]);
    const frame2 = multiColorFrame(4, 4, [
      [180, 40, 200, 255], // 12 px purple (if repeated) -> 8 px purple, 8 px yellow
      [250, 230, 60, 255],
    ]);

    const palette = extractPixelatedFramesPalette([frame0, frame1, frame2]);
    const keys = new Set(palette.map(colorKey));

    expect(palette).toHaveLength(5);
    expect(palette[0]).toEqual([240, 120, 40, 255]);
    expect(keys.has("30,140,220,255")).toBe(true);
    expect(keys.has("50,200,90,255")).toBe(true);
    expect(keys.has("180,40,200,255")).toBe(true);
    expect(keys.has("250,230,60,255")).toBe(true);
  });

  test("caps and quantizes across frames when unique colors exceed 256", () => {
    const frames: PixelBuffer[] = [];
    for (let f = 0; f < 4; f++) {
      const colors: Rgba[] = [];
      for (let i = 0; i < 100; i++) {
        colors.push([(f * 60 + i * 2) % 256, (i * 5 + f * 31) % 256, (f * 73 + i * 3) % 256, 255]);
      }
      frames.push(multiColorFrame(10, 10, colors));
    }

    const palette = extractPixelatedFramesPalette(frames);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.length).toBeLessThanOrEqual(MAX_PIXELATED_PROJECT_PALETTE_COLORS);
  });

  test("reserves a transparent entry when transparency first appears after the palette overflows", () => {
    const opaque = multiColorFrame(3, 1, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ]);
    const transparent = solidFrame(3, 1, [0, 0, 0, 0]);

    const palette = extractPixelatedFramesPalette([opaque, transparent], 2);

    expect(palette).toHaveLength(2);
    expect(palette).toContainEqual([0, 0, 0, 0]);
  });
});

describe("EditorSession multi-frame GIF pixelation palette", () => {
  test("builds the document palette across all pixelated frames so later-frame colors are on-palette", async () => {
    const act1Color: Rgba = [235, 130, 45, 255];
    const act2Color: Rgba = [45, 155, 235, 255];
    const act3Color: Rgba = [90, 205, 95, 255];
    const accentColor: Rgba = [210, 55, 165, 255];

    const act3Frame = solidFrame(8, 8, act3Color);
    // Paint bottom half with accentColor so both colors survive 2x downsampling.
    for (let y = 4; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        act3Frame.data.set(accentColor, i);
      }
    }

    const sourceProject = rasterAnimationProject({
      width: 8,
      height: 8,
      frames: [
        { pixels: solidFrame(8, 8, act1Color), durationMs: 100 },
        { pixels: solidFrame(8, 8, act2Color), durationMs: 100 },
        { pixels: act3Frame, durationMs: 100 },
      ],
    });

    // Simulate pixelation downscaling 8x8 -> 4x4 while preserving each frame's colors.
    const pixelate = async (image: PixelBuffer): Promise<PixelBuffer> => {
      const out = new Uint8ClampedArray(4 * 4 * 4);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const src = (y * 2 * image.width + x * 2) * 4;
          const dst = (y * 4 + x) * 4;
          out[dst] = image.data[src];
          out[dst + 1] = image.data[src + 1];
          out[dst + 2] = image.data[src + 2];
          out[dst + 3] = image.data[src + 3];
        }
      }
      return { width: 4, height: 4, data: out };
    };

    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => sourceProject.image,
      decodeProject: async () => sourceProject,
      analyze: async (image) => analyzePixelArt(image, { algorithm: PixelationAlgorithm.Resize }),
      pixelate,
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.Auto,
      }),
      write: async (_pixels, name) => ({ method: "download", name }),
    });

    try {
      expect(await session.requestImport({ source: "doodle", name: "friendsgiving.gif" })).toBe(
        SessionOutcome.Pending,
      );
      expect(await session.pixelate()).toBe(SessionOutcome.Created);

      const snapshot = editor.getSnapshot();
      const doc = snapshot.document!;
      expect(doc.timeline?.frames).toHaveLength(3);

      const paletteKeys = new Set(snapshot.palette.map(colorKey));
      expect(paletteKeys.has(colorKey(act1Color))).toBe(true);
      expect(paletteKeys.has(colorKey(act2Color))).toBe(true);
      expect(paletteKeys.has(colorKey(act3Color))).toBe(true);
      expect(paletteKeys.has(colorKey(accentColor))).toBe(true);

      // Zero off-palette colors across all 3 frames.
      const analysis = analyzePalette(doc, snapshot.palette);
      expect(analysis.offPaletteColors).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  test("caps the resulting document palette at 256 entries when pixelated frames exceed 256 unique colors", async () => {
    const frames = Array.from({ length: 4 }, (_, frameIndex) => {
      const colors: Rgba[] = Array.from({ length: 80 }, (_, idx) => [
        (frameIndex * 64 + idx * 3) % 256,
        (idx * 7 + frameIndex * 19) % 256,
        (frameIndex * 53 + idx * 5) % 256,
        255,
      ]);
      return { pixels: multiColorFrame(10, 8, colors), durationMs: 80 };
    });
    const sourceProject = rasterAnimationProject({ width: 10, height: 8, frames });

    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => sourceProject.image,
      decodeProject: async () => sourceProject,
      analyze: async (image) => analyzePixelArt(image, { algorithm: PixelationAlgorithm.Resize }),
      pixelate: async (image) => image,
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.Auto,
      }),
      write: async (_pixels, name) => ({ method: "download", name }),
    });

    try {
      expect(await session.requestImport({ source: "many", name: "many-colors.gif" })).toBe(
        SessionOutcome.Pending,
      );
      expect(await session.pixelate()).toBe(SessionOutcome.Created);

      const snapshot = editor.getSnapshot();
      expect(snapshot.palette.length).toBeGreaterThan(0);
      expect(snapshot.palette.length).toBeLessThanOrEqual(MAX_PIXELATED_PROJECT_PALETTE_COLORS);
    } finally {
      session.dispose();
    }
  });

  test("uses the chosen target palette when reduceColors + palette are specified", async () => {
    const targetPalette: Rgba[] = [
      [10, 20, 30, 255],
      [240, 230, 220, 255],
    ];
    const sourceProject = {
      ...rasterAnimationProject({
        width: 4,
        height: 4,
        frames: [
          { pixels: solidFrame(4, 4, [255, 0, 0, 255]), durationMs: 100 },
          { pixels: solidFrame(4, 4, [0, 255, 0, 255]), durationMs: 100 },
        ],
      }),
      // Stale source palette that must not override the explicit pixelation target palette.
      palette: [[255, 0, 0, 255] as Rgba],
    };

    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => sourceProject.image,
      decodeProject: async () => sourceProject,
      analyze: async (image) => analyzePixelArt(image, { algorithm: PixelationAlgorithm.Resize }),
      pixelate: async () => solidFrame(4, 4, targetPalette[0]),
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.Auto,
      }),
      write: async (_pixels, name) => ({ method: "download", name }),
    });

    try {
      expect(await session.requestImport({ source: "preset", name: "preset.gif" })).toBe(
        SessionOutcome.Pending,
      );
      expect(await session.pixelate({ reduceColors: true, palette: targetPalette })).toBe(
        SessionOutcome.Created,
      );

      expect(editor.getSnapshot().palette).toEqual(targetPalette);
    } finally {
      session.dispose();
    }
  });
});
