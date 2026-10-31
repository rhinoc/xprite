import { describe, expect, test, vi } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { EditorSession } from "$/session/editor-session";
import { createBlankImage } from "$/session/recent-images";
import { SessionOutcome } from "$/session/types";
import {
  analyzePixelArt,
  defaultPixelationSettings,
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
  OutlinePrepass,
  LineGuideMode,
  PixelationDither,
  PaletteColorMode,
  type PixelationSettings,
  type PixelArtAnalysis,
} from "@xprite/pixelate";

describe("import preview with file preferences", () => {
  test("opens immediately and generates a preview without changing an option", async () => {
    const source = createBlankImage(8, 8);
    source.data.set([200, 80, 30, 255]);
    const preview = createBlankImage(2, 2);
    preview.data.set([200, 80, 30, 255]);
    type Analysis = ReturnType<typeof analyzePixelArt>;
    let finishAnalysis!: (analysis: Analysis) => void;
    const analysis = new Promise<Analysis>((resolve) => {
      finishAnalysis = resolve;
    });
    const pixelate = vi.fn(async () => preview);
    const analyze = vi.fn(() => analysis);
    const session = new EditorSession(new RasterEditor(createBlankImage(2, 2), "Original"), {
      decode: async () => source,
      analyze,
      pixelate,
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.Auto,
        colorPicker: CellColorPicker.Median,
      }),
      write: async (_pixels, name) => ({ method: "download", name }),
    });
    try {
      expect(await session.requestImport({ source: "art", name: "art.png" })).toBe(
        SessionOutcome.Pending,
      );
      expect(session.getSnapshot()).toMatchObject({
        busy: false,
        pendingImport: { pixels: source },
        pixelationPreview: null,
        pixelationPreviewing: true,
      });
      finishAnalysis(analyzePixelArt(source, { algorithm: PixelationAlgorithm.Resize }));
      await vi.waitFor(() => {
        expect(session.getSnapshot().pixelationPreview).toBe(preview);
      });
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).toHaveBeenCalledTimes(1);
      expect(pixelate).toHaveBeenCalledWith(source, expect.any(Object));
      expect(session.getSnapshot()).toMatchObject({
        pixelationPreviewing: false,
        pixelationError: null,
      });
      await session.pixelate();
      expect(session.editor.getSnapshot().document?.layer?.pixels).toEqual(preview);
    } finally {
      session.dispose();
    }
  });

  test("a silent keep-as-is import skips pixelation", async () => {
    const source = createBlankImage(8, 8);
    const pixelate = vi.fn(async () => createBlankImage(2, 2));
    const session = new EditorSession(new RasterEditor(createBlankImage(2, 2), "Original"), {
      decode: async () => source,
      analyze: async () => analyzePixelArt(source, { algorithm: PixelationAlgorithm.Resize }),
      pixelate,
      getImportPreference: () => ({
        choice: "always-import-as-is",
        algorithm: PixelationAlgorithm.Auto,
      }),
      write: async (_pixels, name) => ({ method: "download", name }),
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      expect(session.getSnapshot().pendingImport).toBeNull();
      expect(pixelate).not.toHaveBeenCalled();
      expect(session.editor.getSnapshot().document?.layer?.pixels).toEqual(source);
    } finally {
      session.dispose();
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function analysisFor(
  source: ReturnType<typeof createBlankImage>,
  algorithm: PixelationAlgorithm,
  reliable = false,
): PixelArtAnalysis {
  const analysis = analyzePixelArt(source, { algorithm: PixelationAlgorithm.Resize });
  return {
    ...analysis,
    grid: reliable
      ? {
          width: 2,
          height: 2,
          cellWidth: source.width / 2,
          cellHeight: source.height / 2,
          offsetX: 0,
          offsetY: 0,
          confidence: 1,
          reliable: true,
          algorithm,
        }
      : { ...analysis.grid, algorithm },
  };
}

const originalEditor = () => new RasterEditor(createBlankImage(2, 2), "Original");
const write = async (_pixels: unknown, name: string) => ({ method: "download" as const, name });

describe("one pending import pipeline", () => {
  test("a remembered non-Auto algorithm is analyzed once before its preview", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.UniformGrid,
      }),
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      expect(analyze).toHaveBeenCalledExactlyOnceWith(source, {
        algorithm: PixelationAlgorithm.UniformGrid,
      });
      expect(pixelate).not.toHaveBeenCalled();
      const analysis = analysisFor(source, PixelationAlgorithm.UniformGrid, true);
      detection.resolve(analysis);
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(pixelate).toHaveBeenCalledExactlyOnceWith(
        source,
        expect.objectContaining({
          grid: analysis.grid,
          mode: PixelationMode.RecoverGrid,
        }),
      );
    } finally {
      session.dispose();
    }
  });

  test("Pixelate joins the pending analysis and preview rather than starting another worker job", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>(),
      rendered = deferred<typeof preview>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(() => rendered.promise);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      const accept = session.pixelate();
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).not.toHaveBeenCalled();
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await vi.waitFor(() => expect(pixelate).toHaveBeenCalledTimes(1));
      rendered.resolve(preview);
      expect(await accept).toBe(SessionOutcome.Created);
      expect(pixelate).toHaveBeenCalledTimes(1);
      expect(session.editor.getSnapshot().document?.layer?.pixels).toEqual(preview);
    } finally {
      session.dispose();
    }
  });

  test("silent Pixelate waits for the detected grid and performs one conversion", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
      getImportPreference: () => ({
        choice: "always-pixelate",
        algorithm: PixelationAlgorithm.Auto,
        pixelation: {
          prepass: OutlinePrepass.None,
          colorPicker: CellColorPicker.Median,
          reduceColors: false,
        },
      }),
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).not.toHaveBeenCalled();
      expect(session.getSnapshot().busy).toBe(true);
      const analysis = analysisFor(source, PixelationAlgorithm.Auto, true);
      detection.resolve(analysis);
      await vi.waitFor(() => expect(session.getSnapshot().pendingImport).toBeNull());
      expect(pixelate).toHaveBeenCalledExactlyOnceWith(
        source,
        expect.objectContaining({
          grid: analysis.grid,
          prepass: OutlinePrepass.None,
          colorPicker: CellColorPicker.Median,
        }),
      );
      expect(session.editor.getSnapshot().document?.layer?.pixels).toEqual(preview);
    } finally {
      session.dispose();
    }
  });

  test("an initial analysis failure is reported in the preview without a detached rejection", async () => {
    const source = createBlankImage(8, 8),
      detection = deferred<PixelArtAnalysis>();
    const pixelate = vi.fn(async () => source);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: () => detection.promise,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      detection.reject(new Error("Analysis failed"));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationError).toBe("Analysis failed"));
      expect(session.getSnapshot().pixelationPreviewing).toBe(false);
      expect(pixelate).not.toHaveBeenCalled();
    } finally {
      session.dispose();
    }
  });

  test("late detection retains a manual mode and target chosen while it was pending", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(3, 3);
    const detection = deferred<PixelArtAnalysis>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      session.setPixelationOptions({ mode: PixelationMode.Convert, targetWidth: 3 });
      session.setPixelationOptions({ colorPicker: CellColorPicker.Average });
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).toHaveBeenCalledExactlyOnceWith(
        source,
        expect.objectContaining({
          mode: PixelationMode.Convert,
          targetWidth: 3,
          colorPicker: CellColorPicker.Average,
        }),
      );
    } finally {
      session.dispose();
    }
  });

  test("algorithm changes discard stale results and skip intermediate queued analyses", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const first = deferred<PixelArtAnalysis>();
    const analyze = vi.fn((_pixels, options) =>
      options?.algorithm === PixelationAlgorithm.Auto
        ? first.promise
        : Promise.resolve(analysisFor(source, options!.algorithm)),
    );
    const pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      const intermediate = session.setImportAlgorithm(PixelationAlgorithm.EdgeGrid);
      const latest = session.setImportAlgorithm(PixelationAlgorithm.Resize);
      first.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await Promise.all([intermediate, latest]);
      expect(analyze.mock.calls.map(([, options]) => options?.algorithm)).toEqual([
        PixelationAlgorithm.Auto,
        PixelationAlgorithm.Resize,
      ]);
      expect(session.getSnapshot().pendingImport).toMatchObject({
        algorithm: PixelationAlgorithm.Resize,
        grid: { algorithm: PixelationAlgorithm.Resize, reliable: false },
      });
      expect(session.getSnapshot().pixelationOptions.mode).toBe(PixelationMode.Convert);
      expect(pixelate).toHaveBeenCalledTimes(1);
    } finally {
      session.dispose();
    }
  });

  test("changing the algorithm while rendering prevents the old preview from being published", async () => {
    const source = createBlankImage(8, 8),
      oldPreview = createBlankImage(3, 3),
      latestPreview = createBlankImage(2, 2);
    const firstRender = deferred<typeof oldPreview>();
    const pixelate = vi
      .fn()
      .mockImplementationOnce(() => firstRender.promise)
      .mockResolvedValue(latestPreview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: async (_pixels, options) =>
        analysisFor(source, options?.algorithm ?? PixelationAlgorithm.Auto),
      pixelate,
      write,
    });
    const shown: unknown[] = [];
    const unsubscribe = session.subscribe(() =>
      shown.push(session.getSnapshot().pixelationPreview),
    );
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      await vi.waitFor(() => expect(pixelate).toHaveBeenCalledTimes(1));
      const latest = session.setImportAlgorithm(PixelationAlgorithm.UniformGrid);
      firstRender.resolve(oldPreview);
      await latest;
      expect(session.getSnapshot().pixelationPreview).toBe(latestPreview);
      expect(shown).not.toContain(oldPreview);
      expect(pixelate).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      session.dispose();
    }
  });
});

describe("pending import analysis lifetime", () => {
  test("selecting the same algorithm joins an active preview and leaves a finished preview intact", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      const same = session.setImportAlgorithm(PixelationAlgorithm.Auto);
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await same;
      await session.setImportAlgorithm(PixelationAlgorithm.Auto);
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().pixelationPreview).toBe(preview);
    } finally {
      session.dispose();
    }
  });

  test("a failed initial analysis can be retried with the same algorithm", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const analyze = vi
      .fn()
      .mockRejectedValueOnce(new Error("Try again"))
      .mockResolvedValue(analysisFor(source, PixelationAlgorithm.Auto, true));
    const pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationError).toBe("Try again"));
      await session.setImportAlgorithm(PixelationAlgorithm.Auto);
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(pixelate).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().pixelationError).toBeNull();
      expect(session.getSnapshot().pixelationPreview).toBe(preview);
    } finally {
      session.dispose();
    }
  });

  test("returning to the initial algorithm reuses its running analysis", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>();
    const analyze = vi.fn(() => detection.promise),
      pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      const intermediate = session.setImportAlgorithm(PixelationAlgorithm.EdgeGrid);
      const restored = session.setImportAlgorithm(PixelationAlgorithm.Auto);
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await Promise.all([intermediate, restored]);
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(pixelate).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().pendingImport?.algorithm).toBe(PixelationAlgorithm.Auto);
    } finally {
      session.dispose();
    }
  });

  test("a cancelled import cannot supply analysis or preview pixels to its replacement", async () => {
    const firstSource = createBlankImage(8, 8),
      nextSource = createBlankImage(16, 16);
    const preview = createBlankImage(4, 4),
      first = deferred<PixelArtAnalysis>();
    const analyze = vi.fn((pixels) =>
      pixels === firstSource
        ? first.promise
        : Promise.resolve(analysisFor(nextSource, PixelationAlgorithm.Auto, true)),
    );
    const pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async (token: string) => (token === "first" ? firstSource : nextSource),
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "first", name: "first.png" });
      session.cancelImport();
      await session.requestImport({ source: "next", name: "next.png" });
      first.resolve(analysisFor(firstSource, PixelationAlgorithm.Auto, true));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(pixelate).toHaveBeenCalledExactlyOnceWith(nextSource, expect.any(Object));
      expect(session.getSnapshot().pendingImport).toMatchObject({
        name: "next.png",
        pixels: nextSource,
        grid: { cellWidth: 8, cellHeight: 8 },
      });
      expect(session.getSnapshot().pixelationError).toBeNull();
    } finally {
      session.dispose();
    }
  });
});

describe("editor import coloring defaults", () => {
  test.each([undefined, CellColorPicker.Median])(
    "plain import retains its color rule through detection (%s)",
    async (remembered) => {
      const source = createBlankImage(8, 8),
        preview = createBlankImage(2, 2);
      const detection = deferred<PixelArtAnalysis>();
      const pixelate = vi.fn(async () => preview);
      const session = new EditorSession(originalEditor(), {
        decode: async () => source,
        analyze: () => detection.promise,
        pixelate,
        write,
        getImportPreference: () => ({
          choice: "always-ask",
          algorithm: PixelationAlgorithm.Auto,
          ...(remembered ? { colorPicker: remembered } : {}),
        }),
      });
      try {
        await session.requestImport({ source: "art", name: "art.png" });
        const defaults = {
          prepass: OutlinePrepass.None,
          colorPicker: remembered ?? CellColorPicker.MostCommon,
          reduceColors: false,
        };
        expect(session.getSnapshot().pixelationOptions).toMatchObject(defaults);
        const analysis = analysisFor(source, PixelationAlgorithm.Auto, true);
        detection.resolve(analysis);
        await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
        expect(session.getSnapshot().pixelationOptions).toMatchObject({
          ...defaults,
          mode: PixelationMode.RecoverGrid,
        });
        expect(pixelate).toHaveBeenCalledExactlyOnceWith(
          source,
          expect.objectContaining({
            grid: analysis.grid,
            prepass: OutlinePrepass.None,
            colorPicker: defaults.colorPicker,
            paletteSnap: undefined,
          }),
        );
        // The shared tool policy remains separate from the editor session's import defaults.
        expect(defaultPixelationSettings(source, analysis.grid)).toMatchObject({
          prepass: OutlinePrepass.PixeloeLines,
          colorPicker: CellColorPicker.TwoStage,
          reduceColors: true,
        });
      } finally {
        session.dispose();
      }
    },
  );

  test("explicit outlines, color rule and color limit survive detection and algorithm switches", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const first = deferred<PixelArtAnalysis>();
    const analyze = vi.fn((_pixels, options) =>
      options?.algorithm === PixelationAlgorithm.Auto
        ? first.promise
        : Promise.resolve(
            analysisFor(
              source,
              options!.algorithm,
              options?.algorithm !== PixelationAlgorithm.Resize,
            ),
          ),
    );
    const pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      session.setPixelationOptions({
        prepass: OutlinePrepass.PixeloeLines,
        colorPicker: CellColorPicker.KMeans,
        reduceColors: true,
        maxColors: 7,
      });
      first.resolve(analysisFor(source, PixelationAlgorithm.Auto, true));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      await session.setImportAlgorithm(PixelationAlgorithm.Resize);
      await session.setImportAlgorithm(PixelationAlgorithm.UniformGrid);
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        prepass: OutlinePrepass.PixeloeLines,
        colorPicker: CellColorPicker.KMeans,
        reduceColors: true,
        maxColors: 7,
      });
      expect(pixelate).toHaveBeenLastCalledWith(
        source,
        expect.objectContaining({
          prepass: OutlinePrepass.PixeloeLines,
          colorPicker: CellColorPicker.KMeans,
          paletteSnap: expect.objectContaining({ colors: 7 }),
        }),
      );
    } finally {
      session.dispose();
    }
  });

  test("changing modes leaves the plain color and palette defaults intact", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: async () => analysisFor(source, PixelationAlgorithm.Auto, true),
      pixelate: async () => preview,
      write,
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      for (const mode of [PixelationMode.Convert, PixelationMode.RecoverGrid]) {
        session.setPixelationOptions({ mode });
        await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
        expect(session.getSnapshot().pixelationOptions).toMatchObject({
          mode,
          prepass: OutlinePrepass.None,
          colorPicker: CellColorPicker.MostCommon,
          reduceColors: false,
        });
      }
    } finally {
      session.dispose();
    }
  });
});

describe("adaptive import processing", () => {
  test("a photo enables the shared line guide only after grid analysis finishes", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const detection = deferred<PixelArtAnalysis>();
    const pixelate = vi.fn(async () => preview);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: () => detection.promise,
      pixelate,
      write,
    });
    try {
      await session.requestImport({ source: "photo", name: "photo.png" });
      expect(session.getSnapshot().pixelationOptions.prepass).toBe(OutlinePrepass.None);
      expect(pixelate).not.toHaveBeenCalled();
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        mode: PixelationMode.Convert,
        prepass: OutlinePrepass.PixeloeLines,
        lineGuide: defaultPixelationSettings(source).lineGuide,
        colorPicker: CellColorPicker.Contrast,
        reduceColors: false,
      });
      expect(pixelate).toHaveBeenCalledTimes(1);
    } finally {
      session.dispose();
    }
  });

  test("default processing follows algorithm results until the user edits it", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: async (_pixels, options) =>
        analysisFor(source, options!.algorithm, options?.algorithm !== PixelationAlgorithm.Resize),
      pixelate: async () => preview,
      write,
      getImportPreference: () => ({
        choice: "always-ask",
        algorithm: PixelationAlgorithm.Auto,
        colorPicker: CellColorPicker.Median,
      }),
    });
    try {
      await session.requestImport({ source: "art", name: "art.png" });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        prepass: OutlinePrepass.None,
        colorPicker: CellColorPicker.Median,
        reduceColors: false,
      });
      await session.setImportAlgorithm(PixelationAlgorithm.Resize);
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        prepass: OutlinePrepass.PixeloeLines,
        colorPicker: CellColorPicker.Contrast,
        reduceColors: false,
      });
      await session.setImportAlgorithm(PixelationAlgorithm.UniformGrid);
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        prepass: OutlinePrepass.None,
        colorPicker: CellColorPicker.Median,
        reduceColors: false,
      });
    } finally {
      session.dispose();
    }
  });

  test.each([
    { prepass: OutlinePrepass.None },
    { lineGuide: LineGuideMode.Union },
    { colorPicker: CellColorPicker.Median },
    { reduceColors: false },
    { maxColors: 7 },
    { palette: [[3, 4, 5, 255]] },
    { dither: PixelationDither.Ordered },
    { paletteColorMode: PaletteColorMode.Adaptive },
  ] as Partial<PixelationSettings>[])(
    "explicit processing survives late analysis and algorithm changes: %j",
    async (patch) => {
      const source = createBlankImage(8, 8),
        preview = createBlankImage(2, 2);
      const detection = deferred<PixelArtAnalysis>();
      const session = new EditorSession(originalEditor(), {
        decode: async () => source,
        analyze: (_pixels, options) =>
          options?.algorithm === PixelationAlgorithm.Auto
            ? detection.promise
            : Promise.resolve(analysisFor(source, options!.algorithm)),
        pixelate: async () => preview,
        write,
      });
      try {
        await session.requestImport({ source: "photo", name: "photo.png" });
        session.setPixelationOptions(patch);
        detection.resolve(analysisFor(source, PixelationAlgorithm.Auto));
        await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
        expect(session.getSnapshot().pixelationOptions).toMatchObject({
          ...patch,
          prepass: OutlinePrepass.None,
        });
        await session.setImportAlgorithm(PixelationAlgorithm.Resize);
        expect(session.getSnapshot().pixelationOptions).toMatchObject({
          ...patch,
          prepass: OutlinePrepass.None,
        });
      } finally {
        session.dispose();
      }
    },
  );

  test("editing only dimensions preserves the size while a photo still receives line processing", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(3, 3);
    const detection = deferred<PixelArtAnalysis>();
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: () => detection.promise,
      pixelate: async () => preview,
      write,
    });
    try {
      await session.requestImport({ source: "photo", name: "photo.png" });
      session.setPixelationOptions({ targetWidth: 3 });
      detection.resolve(analysisFor(source, PixelationAlgorithm.Auto));
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(session.getSnapshot().pixelationOptions).toMatchObject({
        targetWidth: 3,
        targetHeight: 3,
        mode: PixelationMode.Convert,
        prepass: OutlinePrepass.PixeloeLines,
        colorPicker: CellColorPicker.Contrast,
        reduceColors: false,
      });
    } finally {
      session.dispose();
    }
  });

  test.each([
    {
      reliable: false,
      saved: null,
      prepass: OutlinePrepass.PixeloeLines,
      picker: CellColorPicker.Contrast,
    },
    {
      reliable: false,
      saved: { prepass: OutlinePrepass.None, colorPicker: CellColorPicker.Median },
      prepass: OutlinePrepass.None,
      picker: CellColorPicker.Median,
    },
    {
      reliable: true,
      saved: { prepass: OutlinePrepass.PixeloeLines, colorPicker: CellColorPicker.Contrast },
      prepass: OutlinePrepass.PixeloeLines,
      picker: CellColorPicker.Contrast,
    },
  ])(
    "silent imports choose adaptive defaults unless saved settings override them: %j",
    async ({ reliable, saved, prepass, picker }) => {
      const source = createBlankImage(8, 8),
        preview = createBlankImage(2, 2);
      const pixelate = vi.fn(async () => preview);
      const session = new EditorSession(originalEditor(), {
        decode: async () => source,
        analyze: async () => analysisFor(source, PixelationAlgorithm.Auto, reliable),
        pixelate,
        write,
        getImportPreference: () => ({
          choice: "always-pixelate",
          algorithm: PixelationAlgorithm.Auto,
          pixelation: saved,
        }),
      });
      try {
        await session.requestImport({ source: "image", name: "image.png" });
        await vi.waitFor(() => expect(session.getSnapshot().pendingImport).toBeNull());
        expect(pixelate).toHaveBeenCalledExactlyOnceWith(
          source,
          expect.objectContaining({ prepass, colorPicker: picker, paletteSnap: undefined }),
        );
      } finally {
        session.dispose();
      }
    },
  );

  test("processing overrides are scoped to one import", async () => {
    const source = createBlankImage(8, 8),
      preview = createBlankImage(2, 2);
    const session = new EditorSession(originalEditor(), {
      decode: async () => source,
      analyze: async () => analysisFor(source, PixelationAlgorithm.Auto),
      pixelate: async () => preview,
      write,
    });
    try {
      await session.requestImport({ source: "first", name: "first.png" });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      session.setPixelationOptions({ prepass: OutlinePrepass.None });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(session.getSnapshot().pixelationOptions.prepass).toBe(OutlinePrepass.None);
      session.cancelImport();
      await session.requestImport({ source: "next", name: "next.png" });
      await vi.waitFor(() => expect(session.getSnapshot().pixelationPreview).toBe(preview));
      expect(session.getSnapshot().pixelationOptions.prepass).toBe(OutlinePrepass.PixeloeLines);
    } finally {
      session.dispose();
    }
  });
});
