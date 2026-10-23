import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { RasterEditor } from "$/editor/RasterEditor";
import {
  jitterWithMargin,
  sprite,
  upscaleNearest,
} from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelArtClassification,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";
import { EditorSession } from "$/session/editor-session";
import { createBlankImage } from "$/session/recent-images";
import type { EditorSessionPorts, ImportPixelationMemory } from "$/session/types";

const { Auto, EdgeGrid, UniformGrid, Resize } = PixelationAlgorithm;
const jittered = jitterWithMargin(sprite(64));

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
      grid: detectWithAlgorithm(pixels, options?.algorithm),
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

describe("registry algorithms on one jittered sprite", () => {
  test("different algorithms give different detections and outputs", () => {
    const outputs = [Auto, UniformGrid, EdgeGrid, Resize].map((algorithm) => {
      const grid = detectWithAlgorithm(jittered, algorithm);
      const mode = grid.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert;
      const out = pixelateImage(jittered, {
        mode,
        grid: grid.reliable ? grid : undefined,
        targetWidth: 40,
        targetHeight: 40,
      });
      return { algorithm, reliable: grid.reliable, size: `${out.width}x${out.height}`, out };
    });
    const distinct = new Set(outputs.map((o) => `${o.reliable}:${o.size}`));
    expect(distinct.size).toBeGreaterThan(1);
    const resize = outputs.find((o) => o.algorithm === Resize);
    expect(resize?.reliable).toBe(false);
    expect(resize?.size).toBe("40x40");
  });
});

describe("import dialog colour pick", () => {
  test("changing the picker re-renders the preview on the same grid", async () => {
    const session = openSession(jittered);
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await settle(session);
    expect(session.getSnapshot().pixelationOptions.colorPicker).toBe(CellColorPicker.Median);
    const before = session.getSnapshot().pixelationPreview;
    session.setPixelationOptions({ colorPicker: CellColorPicker.Average });
    await settle(session);
    const after = session.getSnapshot();
    expect(after.pixelationOptions.colorPicker).toBe(CellColorPicker.Average);
    expect(after.pendingImport?.algorithm).toBe(session.getSnapshot().pendingImport?.algorithm);
    expect(after.pixelationPreview?.width).toBe(before?.width);
    session.dispose();
  });
  test("pixel art opens on PixelOE + lines with Median and Limit colors; None brings back the remembered rule", async () => {
    const session = openSession(
      jittered,
      PixelArtClassification.LikelyPixelArt,
      CellColorPicker.Median,
    );
    await session.requestImport({ source: "jitter", name: "jitter.png" });
    await settle(session);
    const opened = session.getSnapshot();
    // Recover Grid opens on Median with Limit colors (16).
    expect(opened.pendingImport?.grid?.reliable).toBe(true);
    expect(opened.pixelationOptions).toMatchObject({
      mode: PixelationMode.RecoverGrid,
      prepass: OutlinePrepass.PixeloeLines,
      colorPicker: CellColorPicker.Median,
      reduceColors: true,
    });
    session.setPixelationOptions({ prepass: OutlinePrepass.None });
    await settle(session);
    const plain = session.getSnapshot();
    expect(plain.pixelationOptions.colorPicker).toBe(CellColorPicker.Median);
    // The old exact recovery is one choice away.
    expect(plain.pixelationPreview).toEqual(
      pixelateImage(jittered, {
        mode: PixelationMode.RecoverGrid,
        grid: opened.pendingImport!.grid!,
        colorPicker: CellColorPicker.Median,
      }),
    );
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
    expect(resized.pixelationOptions.mode).toBe(PixelationMode.Convert);
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
        grid: detectWithAlgorithm(pixels, options?.algorithm),
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
  test("with nothing saved the silent import uses PixelOE + lines with Median and Limit colors", async () => {
    const { session, imported } = await importSilently(null);
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.PixeloeLines,
      lineGuide: LineGuideMode.Replace,
      colorPicker: CellColorPicker.Median,
      reduceColors: true,
    });
    const grid = detectWithAlgorithm(upscaled, Auto);
    expect(imported).toEqual(
      pixelateImage(upscaled, {
        mode: PixelationMode.RecoverGrid,
        grid,
        prepass: OutlinePrepass.PixeloeLines,
        lineGuide: LineGuideMode.Replace,
        colorPicker: CellColorPicker.Median,
        paletteSnap: { colors: 16 },
      }),
    );
    expect(imported).not.toEqual(art);
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
  test("the dialog still opens on PixelOE + lines with Median after a None import was saved", async () => {
    const { session } = silentSession("always-ask", {
      prepass: OutlinePrepass.None,
      colorPicker: CellColorPicker.MostCommon,
      reduceColors: false,
    });
    await session.requestImport({ source: "art", name: "art.png" });
    await settle(session);
    expect(session.getSnapshot().pendingImport).not.toBeNull();
    expect(session.getSnapshot().pixelationOptions).toMatchObject({
      prepass: OutlinePrepass.PixeloeLines,
      lineGuide: LineGuideMode.Replace,
      colorPicker: CellColorPicker.Median,
      reduceColors: true,
    });
    session.dispose();
  });
});
