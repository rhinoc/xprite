import { describe, expect, test, vi } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import {
  analyzePixelArt,
  CellColorPicker,
  PixelationAlgorithm,
} from "$/import-export/image/import";
import { EditorSession } from "$/session/editor-session";
import { createBlankImage } from "$/session/recent-images";
import { SessionOutcome } from "$/session/types";

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
    const session = new EditorSession(new RasterEditor(createBlankImage(2, 2), "Original"), {
      decode: async () => source,
      analyze: () => analysis,
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
