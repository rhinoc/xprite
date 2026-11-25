import { describe, expect, it, vi } from "vitest";

import { useSpriteSheetDialogModel } from "$/managers/dialogs/sprite-sheet-dialog-model";
import type { ExporterContext } from "$/managers/files/exporter-registry";
import { sheetExporterDefinition, SheetExporterId } from "$/managers/files/exporters/sheet";
import {
  hasExportableTileset,
  resolveTilesetExportLayerIndex,
  tilesetExportSource,
} from "$/managers/files/tileset-export-source";
import type { EditorDocument } from "@xprite/editor-core/document";
import { defaultSpriteSheetOptions, renderSpriteSheet } from "@xprite/editor-core/import-export";

const dialogSourceMock = vi.hoisted(() => ({
  current: {
    document: null as EditorDocument | null,
    exportPreferences: {} as { options?: Record<string, unknown> },
  },
}));

vi.mock("react", () => ({
  useRef: <T>(initial: T) => ({ current: initial }),
}));

vi.mock("$/managers/dialogs/internal-editor-source", () => ({
  useDialogEditorSource: () => dialogSourceMock.current,
}));

function makeDocument(activeLayer: number, withTilemap: boolean): EditorDocument {
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };
  const layers = withTilemap
    ? [
        {
          id: "normal",
          name: "Normal",
          kind: "image" as const,
          visible: true,
          locked: false,
          flags: 1,
          opacity: 255,
        },
        {
          id: "ground",
          name: "MeadowTiles",
          kind: "tilemap" as const,
          tilesetId: 1,
          visible: true,
          locked: false,
          flags: 1,
          opacity: 255,
        },
        {
          id: "props",
          name: "PropTiles",
          kind: "tilemap" as const,
          tilesetId: 2,
          visible: true,
          locked: false,
          flags: 1,
          opacity: 255,
        },
      ]
    : [
        {
          id: "normal",
          name: "Normal",
          kind: "image" as const,
          visible: true,
          locked: false,
          flags: 1,
          opacity: 255,
        },
      ];
  return {
    name: "snoopy-feast.aseprite",
    width: 2,
    height: 2,
    selection: null,
    layer: { name: "Normal", pixels, x: 0, y: 0, visible: true, locked: false },
    timeline: {
      activeLayer,
      activeFrame: 0,
      layers,
      frames: [
        {
          duration: 100,
          cels: layers.map((layer) => ({
            pixels,
            x: 0,
            y: 0,
            opacity: 255,
            zIndex: 0,
            ...(layer.kind === "tilemap"
              ? { tilemap: { width: 1, height: 1, tiles: new Uint32Array([1]) } }
              : {}),
          })),
        },
      ],
      tilesets: withTilemap
        ? [
            {
              id: 1,
              name: "Meadow",
              flags: 2,
              tileWidth: 2,
              tileHeight: 2,
              tileCount: 2,
              baseIndex: 1,
              pixels: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 120, 40, 255, 20, 120, 40, 255,
                20, 120, 40, 255, 20, 120, 40, 255,
              ]),
            },
            {
              id: 2,
              name: "Props",
              flags: 2,
              tileWidth: 2,
              tileHeight: 2,
              tileCount: 2,
              baseIndex: 1,
              pixels: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 80, 10, 255, 200, 80, 10, 255,
                200, 80, 10, 255, 200, 80, 10, 255,
              ]),
            },
          ]
        : [],
    },
  };
}

describe("sprite sheet and tileset export UX", () => {
  it("defaults Output File to checked with <basename>.png on first open and preserves saved preferences", () => {
    const doc = makeDocument(0, false);
    dialogSourceMock.current = { document: doc, exportPreferences: {} };
    const firstOpen = useSpriteSheetDialogModel("slot").createInitialOptions("sprite");
    expect(firstOpen.imageEnabled).toBe(true);
    expect(firstOpen.name).toBe("snoopy-feast.png");
    expect(firstOpen.dataEnabled).toBe(false);
    expect(firstOpen.openGenerated).toBe(false);

    // Empty/extension-only document name falls back cleanly to untitled.png.
    dialogSourceMock.current = {
      document: { ...doc, name: "   " },
      exportPreferences: {},
    };
    const untitled = useSpriteSheetDialogModel("slot").createInitialOptions("sprite");
    expect(untitled.imageEnabled).toBe(true);
    expect(untitled.name).toBe("untitled.png");

    // Existing saved preferences are preserved verbatim (including unchecked imageEnabled).
    const saved = {
      ...defaultSpriteSheetOptions(doc),
      imageEnabled: false,
      openGenerated: true,
      name: "custom-atlas.webp",
    };
    dialogSourceMock.current = {
      document: doc,
      exportPreferences: { options: { [SheetExporterId.SpriteSheet]: saved } },
    };
    const remembered = useSpriteSheetDialogModel("slot").createInitialOptions("sprite");
    expect(remembered.imageEnabled).toBe(false);
    expect(remembered.openGenerated).toBe(true);
    expect(remembered.name).toBe("custom-atlas.webp");
  });

  it("enables Tileset export whenever any tilemap layer exists and auto-selects the first tilemap layer", () => {
    const tilesetExporter = sheetExporterDefinition(SheetExporterId.Tileset);
    const noTilemap = makeDocument(0, false);
    expect(hasExportableTileset(noTilemap)).toBe(false);
    expect(tilesetExporter.available({ document: noTilemap } as ExporterContext)).toBe(false);

    // Image layer (index 0) is active, while tilemap layers exist at indices 1 and 2.
    const imageActive = makeDocument(0, true);
    expect(hasExportableTileset(imageActive)).toBe(true);
    expect(resolveTilesetExportLayerIndex(imageActive)).toBe(1);
    expect(tilesetExporter.available({ document: imageActive } as ExporterContext)).toBe(true);
    expect(
      tilesetExporter.canRepeat!({ document: imageActive } as ExporterContext, {
        ...defaultSpriteSheetOptions(imageActive),
        source: "tilesets",
      }),
    ).toBe(true);

    const autoSelectedSource = tilesetExportSource(imageActive);
    expect(autoSelectedSource.timeline?.activeLayer).toBe(1);
    expect(autoSelectedSource.timeline?.range?.layers).toEqual([1]);
    const autoRendered = renderSpriteSheet(autoSelectedSource, {
      ...defaultSpriteSheetOptions(imageActive),
      source: "tilesets",
      layers: "selected",
      frames: "current",
      imageEnabled: true,
    });
    expect((autoRendered.data.meta.tilesets as { id: number }[]).map((set) => set.id)).toEqual([1]);

    // When a specific tilemap layer (index 2) is already active, keep exporting that layer's tileset.
    const secondTilemapActive = makeDocument(2, true);
    expect(resolveTilesetExportLayerIndex(secondTilemapActive)).toBe(2);
    const activeSource = tilesetExportSource(secondTilemapActive);
    expect(activeSource.timeline?.range?.layers).toEqual([2]);
    const activeRendered = renderSpriteSheet(activeSource, {
      ...defaultSpriteSheetOptions(secondTilemapActive),
      source: "tilesets",
      layers: "selected",
      frames: "current",
      imageEnabled: true,
    });
    expect((activeRendered.data.meta.tilesets as { id: number }[]).map((set) => set.id)).toEqual([
      2,
    ]);
  });
});
