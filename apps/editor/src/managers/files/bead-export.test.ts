import { afterEach, describe, expect, it, vi } from "vitest";

import { changeUiLanguage, tUi } from "$/i18n";
import {
  beadDocumentLabels,
  beadErrorMessage,
  beadExportBlocker,
  beadExporterDefinition,
  BeadOutputFormat,
  type BeadExportOptions,
} from "$/managers/files/bead-export";
import type { ExporterContext } from "$/managers/files/exporter-registry";
import type { EditorDocument } from "@xprite/editor-core/document";
import { BeadErrorCode, mapBeadGrid } from "@xprite/editor-core/import-export";
import { BeadBrand } from "@xprite/palette-assets/beads";

function documentOf(width: number, height: number, name = "hero.aseprite"): EditorDocument {
  return {
    name,
    width,
    height,
    selection: null,
    layer: {
      name: "Image",
      pixels: { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) },
      x: 0,
      y: 0,
      visible: true,
      locked: false,
    },
  };
}
const options = (patch: Partial<BeadExportOptions> = {}): BeadExportOptions => ({
  brand: BeadBrand.Hama,
  boardSize: { width: 29, height: 29 },
  showCodes: true,
  format: BeadOutputFormat.Pdf,
  name: "hero-beads",
  ...patch,
});
function contextFor(document: EditorDocument) {
  const output = {
    encodePng: vi.fn(async () => new Blob(["png"])),
    readAttribution: vi.fn(async () => ({
      name: "Xprite",
      url: "https://xprite.cc/tools/fuse-beads/",
      signature: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) },
    })),
    rasterText: {
      measure: () => ({ width: 1, height: 1 }),
      draw: () => {},
    },
    save: vi.fn(async () => {}),
  };
  const context = {
    document,
    documentKey: "doc",
    platform: { files: { exportOutput: output } },
    preferences: {},
    preview: () => {},
  } as unknown as ExporterContext;
  return { context, output };
}

afterEach(async () => {
  await changeUiLanguage("en");
});

describe("bead exporter", () => {
  it("rejects unusable remembered settings, including names that sanitize to nothing", () => {
    expect(beadExporterDefinition.normalizeOptions(options())).not.toBeNull();
    expect(beadExporterDefinition.normalizeOptions(options({ name: "///" }))).toBeNull();
    expect(
      beadExporterDefinition.normalizeOptions(options({ boardSize: { width: 0, height: 29 } })),
    ).toBeNull();
    expect(
      beadExporterDefinition.normalizeOptions({ ...options(), format: "svg" as BeadOutputFormat }),
    ).toBeNull();
  });
  it("derives a clean default file stem from the sprite name", () => {
    const { context } = contextFor(documentOf(2, 2, "my:hero?.aseprite"));
    expect(beadExporterDefinition.createSource(context, null).settings.name).toBe("my-hero-beads");
  });
  it("blocks too many boards and oversize PNG sheets before rendering, with translated text", () => {
    const pixels = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) };
    const grid = mapBeadGrid(pixels, [{ code: "A", name: "White", rgb: [255, 255, 255] }]);
    expect(beadExportBlocker(grid, options({ boardSize: { width: 1, height: 1 } }))).toBe(
      tUi("ui.export.beads.boards.limit", { count: 4096, max: 1024 }),
    );
    expect(beadExportBlocker(grid, options())).toBeNull();
    const wide = mapBeadGrid(
      { width: 512, height: 1, data: new Uint8ClampedArray(512 * 4).fill(255) },
      grid.colors,
    );
    expect(beadExportBlocker(wide, options({ format: BeadOutputFormat.Png }))).toBe(
      tUi("ui.export.beads.png.limit"),
    );
    expect(beadExportBlocker(wide, options({ format: BeadOutputFormat.Pdf }))).toBeNull();
  });
  it("maps every core error code to a translation key with its values", () => {
    for (const code of Object.values(BeadErrorCode)) expect(beadErrorMessage(code)).not.toBe("");
    expect(beadErrorMessage(BeadErrorCode.InvalidBoardSize)).toBe(
      "Board size must be a whole number from 1 to 512.",
    );
  });
  it("prints document labels in the current UI language", async () => {
    await changeUiLanguage("ru");
    const labels = beadDocumentLabels();
    expect(labels.overview({ brand: "Hama" })).toBe("Hama - обзор");
    expect(labels.quantity).toBe(tUi("ui.export.beads.quantity"));
    expect(labels.quantity).not.toBe("Quantity");
  });
  it("exports a sanitized PDF and never fetches artwork when boards exceed the limit", async () => {
    const { context, output } = contextFor(documentOf(40, 30));
    await expect(
      beadExporterDefinition.execute(context, options({ boardSize: { width: 1, height: 1 } }), {}),
    ).rejects.toThrow(tUi("ui.export.beads.boards.limit", { count: 1200, max: 1024 }));
    expect(output.readAttribution).not.toHaveBeenCalled();
    const result = await beadExporterDefinition.execute(
      context,
      options({ name: "  ../hero.pdf " }),
      {},
    );
    expect(result).toEqual({ names: ["hero.pdf"] });
    const artifact = vi.mocked(output.save).mock.calls[0][0] as { name: string; blob: Blob };
    expect(artifact.name).toBe("hero.pdf");
    expect(artifact.blob.type).toBe("application/pdf");
  });
});
