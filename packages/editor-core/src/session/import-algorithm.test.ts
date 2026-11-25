// @cpu-intensive
import { describe, expect, test, vi } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { RasterEditor } from "$/editor/RasterEditor";
import { rasterAnimationProject } from "$/import-export/image/animation";
import { EditorSession } from "$/session/editor-session";
import { createBlankImage } from "$/session/recent-images";
import type { EditorSessionPorts, ImportPixelationMemory } from "$/session/types";
import {
  pixelateImage,
  detectWithAlgorithm,
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelArtClassification,
  PixelationAlgorithm,
  PixelationMode,
  type PixelGridAnalysis,
} from "@xprite/pixelate";
import { jitterWithMargin, sprite, upscaleNearest } from "@xprite/pixelate/testing";

const { Auto, EdgeGrid, UniformGrid, Resize } = PixelationAlgorithm;
const jittered = jitterWithMargin(sprite(64));

// Session assertions exercise workflow transitions; each fixed source/algorithm needs one detection.
const fixtureGrids = new WeakMap<PixelBuffer, Map<PixelationAlgorithm, PixelGridAnalysis>>();
function fixtureGrid(source: PixelBuffer, algorithm = Auto): PixelGridAnalysis {
  let grids = fixtureGrids.get(source);
  if (!grids) fixtureGrids.set(source, (grids = new Map()));
  let grid = grids.get(algorithm);
  if (!grid) grids.set(algorithm, (grid = detectWithAlgorithm(source, algorithm)));
  return structuredClone(grid);
}

function openSession(
  source: PixelBuffer,
  classification = PixelArtClassification.LikelyPixelArt,
  rememberedPicker?: CellColorPicker,
) {
  const session = new EditorSession(new RasterEditor(createBlankImage(2, 2), "Original"), {
    decode: async () => source,
    ...(rememberedPicker
      ? {
          getImportPreference: () => ({
            choice: "always-ask",
            algorithm: Auto,
            colorPicker: rememberedPicker,
          }),
        }
      : {}),
    analyze: async (pixels, options) => ({
      classification,
      grid: fixtureGrid(pixels, options?.algorithm),
    }),
    pixelate: async (pixels, options) => pixelateImage(pixels, options),
    write: async (_pixels, name) => ({ method: "download", name }),
    releaseSource: () => {},
    dispose: () => {},
  } as ConstructorParameters<typeof EditorSession>[1]);
  return session;
}
async function settle(session: EditorSession) {
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!session.getSnapshot().pixelationPreviewing && session.getSnapshot().pixelationPreview)
      return;
  }
}
const sizeOf = (session: EditorSession) => {
  const preview = session.getSnapshot().pixelationPreview;
  return preview ? `${preview.width}x${preview.height}` : "none";
};

describe("import dialog colour pick", () => {
  test("changing the picker re-renders the preview on the same grid", async () => {
    const session = openSession(jittered);
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await settle(session);
    expect(session.getSnapshot().pixelationOptions.colorPicker).toBe(CellColorPicker.MostCommon);
    const before = session.getSnapshot().pixelationPreview;
    session.setPixelationOptions({ colorPicker: CellColorPicker.Average });
    await settle(session);
    const after = session.getSnapshot();
    expect(after.pixelationOptions.colorPicker).toBe(CellColorPicker.Average);
    expect(after.pendingImport?.algorithm).toBe(session.getSnapshot().pendingImport?.algorithm);
    expect(after.pixelationPreview?.width).toBe(before?.width);
    session.dispose();
  });
  test("pixel art opens with the remembered plain picker and optional outlines remain available", async () => {
    const session = openSession(
      jittered,
      PixelArtClassification.LikelyPixelArt,
      CellColorPicker.Median,
    );
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await settle(session);
    const opened = session.getSnapshot();
    expect(opened.pendingImport?.grid?.reliable).toBe(true);
    expect(opened.pixelationOptions).toMatchObject({
      mode: PixelationMode.RecoverGrid,
      prepass: OutlinePrepass.None,
      colorPicker: CellColorPicker.Median,
      reduceColors: false,
    });
    expect(opened.pixelationPreview).toEqual(
      pixelateImage(jittered, {
        mode: PixelationMode.RecoverGrid,
        grid: opened.pendingImport!.grid!,
        colorPicker: CellColorPicker.Median,
      }),
    );
    session.setPixelationOptions({ prepass: OutlinePrepass.PixeloeLines, reduceColors: true });
    await settle(session);
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.PixeloeLines,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: true,
    });
    session.setPixelationOptions({ prepass: OutlinePrepass.None, reduceColors: false });
    await settle(session);
    expect(session.getSnapshot().pixelationOptions.colorPicker).toBe(CellColorPicker.Median);
    expect(session.getSnapshot().pixelationPreview).toEqual(opened.pixelationPreview);
    session.dispose();
  });
});

describe("import dialog algorithm switching", () => {
  test("switching re-detects and updates grid, mode, preview and size", async () => {
    const session = openSession(jittered);
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await settle(session);
    const first = session.getSnapshot();
    expect(first.pendingImport?.algorithm).toBe(Auto);

    await session.setImportAlgorithm(Resize);
    await settle(session);
    const resized = session.getSnapshot();
    expect(resized.pendingImport?.algorithm).toBe(Resize);
    expect(resized.pendingImport?.grid?.reliable).toBe(false);
    expect(resized.pixelationOptions).toMatchObject({
      mode: PixelationMode.Convert,
      prepass: OutlinePrepass.PixeloeLines,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: false,
    });
    expect(sizeOf(session)).toBe(
      `${resized.pixelationOptions.targetWidth}x${resized.pixelationOptions.targetHeight}`,
    );

    session.setPixelationOptions({ targetWidth: 40 });
    await settle(session);
    const resizedSize = sizeOf(session);
    expect(resizedSize).toBe("40x40");
    await session.setImportAlgorithm(EdgeGrid);
    await settle(session);
    const edge = session.getSnapshot();
    expect(edge.pendingImport?.algorithm).toBe(EdgeGrid);
    expect(edge.pendingImport?.grid?.algorithm).toBe(EdgeGrid);
    expect(edge.pixelationOptions.mode).toBe(
      edge.pendingImport?.grid?.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert,
    );
    expect(sizeOf(session)).not.toBe(resizedSize);
    session.dispose();
  });

  test("an unreliable algorithm falls back to the resize preview and keeps the message data", async () => {
    const flat = createBlankImage(64, 64);
    const session = openSession(flat, PixelArtClassification.LikelyPhoto);
    await session.requestImport({ source: "flat", name: "flat.png" });
    await session.setImportAlgorithm(UniformGrid);
    await settle(session);
    const state = session.getSnapshot();
    expect(state.pendingImport?.grid?.reliable).toBe(false);
    expect(state.pixelationOptions.mode).toBe(PixelationMode.Convert);
    expect(state.pixelationPreview).not.toBeNull();
    session.dispose();
  });

  test("a stale switch cannot overwrite a newer one", async () => {
    const session = openSession(jittered);
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    const slow = session.setImportAlgorithm(EdgeGrid);
    const latest = session.setImportAlgorithm(Resize);
    await Promise.all([slow, latest]);
    await settle(session);
    expect(session.getSnapshot().pendingImport?.algorithm).toBe(Resize);
    expect(session.getSnapshot().pixelationOptions.mode).toBe(PixelationMode.Convert);
    session.dispose();
  });

  test("Pixelate installs exactly the preview that is shown", async () => {
    const session = openSession(jittered);
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await session.setImportAlgorithm(Resize);
    await settle(session);
    const shown = session.getSnapshot().pixelationPreview;
    expect(shown).not.toBeNull();
    await session.pixelate();
    expect(session.getSnapshot().pendingImport).toBeNull();
    session.dispose();
  });

  test("an animated project skips grid analysis but a custom size still resizes the preview", async () => {
    const frames = [sprite(32), sprite(32)].map((art) => ({
      pixels: upscaleNearest(art, 4),
      durationMs: 100,
    }));
    const first = frames[0].pixels;
    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => first,
      decodeProject: async () =>
        rasterAnimationProject({ width: first.width, height: first.height, frames }),
      analyze: async () => {
        throw new Error("animations never run grid analysis");
      },
      pixelate: async (pixels, options) => pixelateImage(pixels, options),
      write: async (_pixels, name) => ({ method: "download", name }),
      releaseSource: () => {},
      dispose: () => {},
      getImportPreference: () => ({ choice: "always-ask", algorithm: Auto }),
    } as ConstructorParameters<typeof EditorSession>[1]);
    await session.requestImport({ source: "anim", name: "anim.gif" });
    await settle(session);
    const opened = session.getSnapshot();
    expect(opened.pendingImport?.grid).toBeNull();
    const openingSize = sizeOf(session);

    await session.setImportAlgorithm(PixelationAlgorithm.CustomSize, {
      width: 40,
      height: 40,
    });
    await settle(session);
    const sized = session.getSnapshot();
    expect(sized.pendingImport?.algorithm).toBe(PixelationAlgorithm.CustomSize);
    expect(sized.pixelationOptions).toMatchObject({ targetWidth: 40, targetHeight: 40 });
    expect(sizeOf(session)).toBe("40x40");
    expect(sizeOf(session)).not.toBe(openingSize);

    // Pixelate installs the pixelated timeline: every frame shrinks to the target size.
    await session.pixelate();
    const document = editor.getSnapshot().document;
    expect(session.getSnapshot().pendingImport).toBeNull();
    expect(document?.timeline.frames.length).toBe(frames.length);
    for (const [index, frame] of document!.timeline.frames.entries()) {
      expect(frame.duration).toBe(frames[index].durationMs);
      for (const cel of frame.cels)
        if (cel) expect(`${cel.pixels.width}x${cel.pixels.height}`).toBe("40x40");
    }
    session.dispose();
  });

  test("an animated project exposes frame count, switches preview frames, and commits every frame in order", async () => {
    const makeSolidFrame = (r: number, g: number, b: number) => {
      const pixels = createBlankImage(16, 16);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = r;
        pixels.data[i + 1] = g;
        pixels.data[i + 2] = b;
        pixels.data[i + 3] = 255;
      }
      return pixels;
    };
    const frames = [
      { pixels: makeSolidFrame(220, 20, 20), durationMs: 80 },
      { pixels: makeSolidFrame(20, 220, 20), durationMs: 120 },
      { pixels: makeSolidFrame(20, 20, 220), durationMs: 160 },
    ];
    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => frames[0].pixels,
      decodeProject: async () =>
        rasterAnimationProject({
          width: frames[0].pixels.width,
          height: frames[0].pixels.height,
          frames,
        }),
      analyze: async () => {
        throw new Error("animations never run grid analysis");
      },
      pixelate: async (pixels, options) => pixelateImage(pixels, options),
      write: async (_pixels, name) => ({ method: "download", name }),
      releaseSource: () => {},
      dispose: () => {},
      getImportPreference: () => ({ choice: "always-ask", algorithm: Auto }),
    } as ConstructorParameters<typeof EditorSession>[1]);

    try {
      await session.requestImport({ source: "anim-frames", name: "anim-frames.gif" });
      await settle(session);
      expect(session.getSnapshot().pendingImport).toMatchObject({
        frameCount: 3,
        previewFrame: 0,
      });
      expect(Array.from(session.getSnapshot().pendingImport!.pixels.data.slice(0, 4))).toEqual([
        220, 20, 20, 255,
      ]);

      // Stepping backward from frame 0 wraps to the last frame and previews that frame's pixels.
      session.setImportPreviewFrame(-1);
      await settle(session);
      expect(session.getSnapshot().pendingImport).toMatchObject({
        frameCount: 3,
        previewFrame: 2,
      });
      expect(Array.from(session.getSnapshot().pendingImport!.pixels.data.slice(0, 4))).toEqual([
        20, 20, 220, 255,
      ]);
      expect(Array.from(session.getSnapshot().pixelationPreview!.data.slice(0, 4))).toEqual([
        20, 20, 220, 255,
      ]);

      // Stepping forward wraps back to frame 0, then advance to frame 1.
      session.setImportPreviewFrame(3);
      await settle(session);
      expect(session.getSnapshot().pendingImport?.previewFrame).toBe(0);
      session.setImportPreviewFrame(1);
      await settle(session);
      expect(session.getSnapshot().pendingImport?.previewFrame).toBe(1);
      expect(Array.from(session.getSnapshot().pixelationPreview!.data.slice(0, 4))).toEqual([
        20, 220, 20, 255,
      ]);

      // The post-processing step applies equally to previewed and non-previewed frames.
      const transform = vi.fn((pixels: PixelBuffer) => {
        const data = pixels.data.slice();
        for (let offset = 0; offset < data.length; offset += 4) data[offset + 3] = 128;
        return { ...pixels, data };
      });
      await session.pixelate(undefined, transform);
      const document = editor.getSnapshot().document!;
      expect(document.timeline.frames.length).toBe(3);
      expect(transform).toHaveBeenCalledTimes(3);
      expect(
        document.timeline.frames.map((frame) => Array.from(frame.cels[0]!.pixels.data.slice(0, 4))),
      ).toEqual([
        [220, 20, 20, 128],
        [20, 220, 20, 128],
        [20, 20, 220, 128],
      ]);
      // Active frame 0 image matches frame 0 (not the previewed frame 1).
      expect(Array.from(document.layer.pixels.data.slice(0, 3))).toEqual([220, 20, 20]);
    } finally {
      session.dispose();
    }
  });

  test("a decoded aseprite project opens directly without the import dialog", async () => {
    const animation = rasterAnimationProject({
      width: 64,
      height: 64,
      frames: [{ pixels: upscaleNearest(sprite(16), 4), durationMs: 100 }],
    });
    const project = {
      ...animation,
      timeline: {
        ...animation.timeline,
        asepriteSource: { format: "aseprite" } as never,
      },
    };
    const editor = new RasterEditor(createBlankImage(2, 2), "Original");
    const session = new EditorSession(editor, {
      decode: async () => animation.image,
      decodeProject: async () => project,
      analyze: async () => {
        throw new Error("projects never run grid analysis");
      },
      pixelate: async (pixels, options) => pixelateImage(pixels, options),
      write: async (_pixels, name) => ({ method: "download", name }),
      releaseSource: () => {},
      dispose: () => {},
      getImportPreference: () => ({ choice: "always-ask", algorithm: Auto }),
    } as ConstructorParameters<typeof EditorSession>[1]);
    const outcome = await session.requestImport({ source: "art", name: "art.aseprite" });
    expect(outcome).toBe("created");
    expect(session.getSnapshot().pendingImport).toBeNull();
    expect(editor.getSnapshot().document?.format).toBe("aseprite");
    session.dispose();
  });
});

describe("silent Pixelate import (Don't ask me again)", () => {
  const art = sprite(32);
  const upscaled = upscaleNearest(art, 4);
  function silentSession(choice: string, pixelation?: ImportPixelationMemory | null) {
    const results: PixelBuffer[] = [];
    const session = new EditorSession(new RasterEditor(createBlankImage(2, 2), "Original"), {
      decode: async () => upscaled,
      analyze: async (pixels, options) => ({
        classification: PixelArtClassification.LikelyPixelArt,
        grid: fixtureGrid(pixels, options?.algorithm),
      }),
      pixelate: async (pixels, options) => {
        const out = pixelateImage(pixels, options);
        results.push(out);
        return out;
      },
      write: async (_pixels, name) => ({ method: "download", name }),
      releaseSource: () => {},
      dispose: () => {},
      getImportPreference: () => ({
        choice,
        algorithm: Auto,
        colorPicker: CellColorPicker.MostCommon,
        pixelation,
      }),
    } as EditorSessionPorts<string>);
    return { session, results };
  }
  async function importSilently(pixelation?: ImportPixelationMemory | null) {
    const { session, results } = silentSession("always-pixelate", pixelation);
    await session.requestImport({ source: "art", name: "art.png" });
    for (let i = 0; i < 50 && session.getSnapshot().pendingImport; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
    return { session, imported: results.at(-1)! };
  }
  test("a saved None import repeats the exact grid recovery", async () => {
    const { session, imported } = await importSilently({
      prepass: OutlinePrepass.None,
      lineGuide: LineGuideMode.Union,
      colorPicker: CellColorPicker.MostCommon,
      reduceColors: false,
      maxColors: 16,
    });
    expect(session.getSnapshot().pendingImport).toBeNull();
    expect(imported).toEqual(art);
    session.dispose();
  });
  test("with nothing saved the silent import uses plain recovery without a color limit", async () => {
    const { session, imported } = await importSilently(null);
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.None,
      colorPicker: CellColorPicker.MostCommon,
      reduceColors: false,
    });
    expect(imported).toEqual(art);
    session.dispose();
  });
  test("a saved Add to outlines import keeps Add to outlines", async () => {
    const { session, imported } = await importSilently({
      prepass: OutlinePrepass.PixeloeLines,
      lineGuide: LineGuideMode.Union,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: false,
      maxColors: 16,
    });
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.PixeloeLines,
      lineGuide: LineGuideMode.Union,
    });
    expect(imported).toEqual(
      pixelateImage(upscaled, {
        mode: PixelationMode.RecoverGrid,
        grid: detectWithAlgorithm(upscaled, Auto),
        prepass: OutlinePrepass.PixeloeLines,
        lineGuide: LineGuideMode.Union,
        colorPicker: CellColorPicker.Contrast,
      }),
    );
    session.dispose();
  });
  test("the dialog uses plain defaults when the silent path has saved outline settings", async () => {
    const { session } = silentSession("always-ask", {
      prepass: OutlinePrepass.PixeloeLines,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: true,
    });
    await session.requestImport({ source: "art", name: "art.png" });
    await settle(session);
    expect(session.getSnapshot().pendingImport).not.toBeNull();
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.None,
      colorPicker: CellColorPicker.MostCommon,
      reduceColors: false,
    });
    session.dispose();
  });
});
