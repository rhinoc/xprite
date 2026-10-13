import { useMemo, useState } from "react";

import { tUiSource } from "$/i18n";
import type { FormLayout } from "$/managers/dialogs/form-layout";
import { ExporterGroup, type ExporterDefinition } from "$/managers/files/exporter-registry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  renderExport,
  mapBeadGrid,
  beadBoards,
  renderBeadPatternSheet,
  renderBeadBoardPreview,
  beadPatternSheetSize,
  encodeBeadPdf,
  DEFAULT_BEAD_BOARD_SIZE,
  isValidBeadBoardSize,
  type BeadBoardSize,
  BEAD_CHART_CELL_SIZE,
} from "@xprite/editor-core/import-export";
import { BEAD_ARTIFACT_ATTRIBUTION } from "@xprite/growth-content/tools";
import { BEAD_PALETTES, BeadBrand } from "@xprite/palette-assets/beads";
import logoUrl from "@xprite/site-assets/menu-icon.svg?url";

enum BeadExporterId {
  Beads = "beads",
}
export enum BeadOutputFormat {
  Png = "png",
  Pdf = "pdf",
}
export { MIN_BEAD_BOARD_EDGE, MAX_BEAD_BOARD_EDGE } from "@xprite/editor-core/import-export";
const MAX_SOURCE_CELLS = 512 * 512;
const PREVIEW_WIDTH = 424;
const PREVIEW_HEIGHT = 288;
const PANEL_WIDTH = 768;
const PANEL_HEIGHT = 520;
const PREVIEW_X = 328;
const PREVIEW_TOP = 28;
export const BEAD_PREVIEW_BOUNDS = {
  x: PREVIEW_X,
  y: PREVIEW_TOP,
  width: PREVIEW_WIDTH,
  height: PREVIEW_HEIGHT,
};
export const BEAD_EXPORT_SIZE = { width: PANEL_WIDTH, height: PANEL_HEIGHT };
export const BEAD_EXPORT_LAYOUT: FormLayout = {
  height: PANEL_HEIGHT + 46,
  fields: {
    brand: { x: 0, y: 28, width: 308, labelWidth: 96, height: 30 },
    boardWidth: { x: 0, y: 66, width: 308, labelWidth: 132, height: 30 },
    boardHeight: { x: 0, y: 104, width: 308, labelWidth: 132, height: 30 },
    showCodes: { x: 0, y: 142, width: 308, height: 30 },
    format: { x: 0, y: 180, width: 308, labelWidth: 96, height: 30 },
    name: { x: 0, y: 218, width: 308, labelWidth: 96, height: 30 },
    board: { x: 0, y: 276, width: 308, labelWidth: 96, height: 30 },
    zoom: { x: 0, y: 314, width: 308, labelWidth: 96, height: 30 },
  },
  separators: [
    { x: 0, y: 0, width: 308, height: 22, text: "Bead pattern" },
    { x: PREVIEW_X, y: 0, width: PREVIEW_WIDTH, height: 22, text: "Board preview" },
    { x: 0, y: 376, width: 308, height: 22, text: "Materials" },
  ],
  actions: {
    Export: { x: PANEL_WIDTH - 248, y: PANEL_HEIGHT - 34, width: 120, height: 34 },
    "Exporting…": { x: PANEL_WIDTH - 248, y: PANEL_HEIGHT - 34, width: 120, height: 34 },
    Cancel: { x: PANEL_WIDTH - 120, y: PANEL_HEIGHT - 34, width: 120, height: 34 },
  },
};

export interface BeadExportOptions {
  brand: BeadBrand;
  boardSize: BeadBoardSize;
  showCodes: boolean;
  format: BeadOutputFormat;
  name: string;
}
export interface BeadExportSource {
  pixels: PixelBuffer;
  settings: BeadExportOptions;
}

function normalizeOptions(value: unknown): BeadExportOptions | null {
  if (!value || typeof value !== "object") return null;
  const options = value as BeadExportOptions;
  return Object.values(BeadBrand).includes(options.brand) &&
    isValidBeadBoardSize(options.boardSize) &&
    typeof options.showCodes === "boolean" &&
    Object.values(BeadOutputFormat).includes(options.format) &&
    typeof options.name === "string" &&
    !!options.name.trim()
    ? options
    : null;
}

export const beadExporterDefinition: ExporterDefinition<BeadExportSource, BeadExportOptions> = {
  id: BeadExporterId.Beads,
  label: () => tUiSource("Fuse beads"),
  group: ExporterGroup.Crafts,
  initialSize: BEAD_EXPORT_SIZE,
  available: ({ platform, document }) =>
    !!platform.files.exportOutput && document.width * document.height <= MAX_SOURCE_CELLS,
  normalizeOptions,
  createSource({ document }, remembered) {
    if (document.width * document.height > MAX_SOURCE_CELLS)
      throw new Error(
        tUiSource("The bead pattern is too large. Resize a copy of the sprite before exporting."),
      );
    const pixels = renderExport(document, {
      name: "beads.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame: document.timeline?.activeFrame ?? 0,
      frames: "current",
    });
    return {
      pixels,
      settings: remembered ?? {
        brand: BeadBrand.Mard,
        boardSize: DEFAULT_BEAD_BOARD_SIZE,
        showCodes: true,
        format: BeadOutputFormat.Png,
        name: `${document.name.replace(/\.[^.]+$/, "")}-beads`,
      },
    };
  },
  async execute(context, options, ports) {
    const source = beadExporterDefinition.createSource(context, options);
    const palette = BEAD_PALETTES.find((item) => item.id === options.brand)!;
    const grid = mapBeadGrid(source.pixels, palette.colors);
    const output = context.platform.files.exportOutput!;
    const attribution = await output.readAttribution(
      BEAD_ARTIFACT_ATTRIBUTION.name,
      BEAD_ARTIFACT_ATTRIBUTION.url,
      logoUrl,
      options.format === BeadOutputFormat.Pdf,
    );
    const name = `${options.name.trim().replace(/\.(png|pdf)$/i, "")}.${options.format}`;
    const blob =
      options.format === BeadOutputFormat.Pdf
        ? new Blob(
            [
              new Uint8Array(
                encodeBeadPdf(
                  grid,
                  palette.name,
                  options.boardSize,
                  options.showCodes,
                  attribution,
                ),
              ).buffer,
            ],
            { type: "application/pdf" },
          )
        : await output.encodePng(
            renderBeadPatternSheet(
              grid,
              palette.name,
              options.showCodes,
              options.boardSize,
              attribution,
              output.rasterText,
            ),
          );
    await (ports.save ?? output.save)({ name, blob });
    return { names: [name] };
  },
};

export function useBeadExport(source: BeadExportSource) {
  const [settings, setSettings] = useState(source.settings);
  const [selected, setSelected] = useState(0);
  const palette = BEAD_PALETTES.find((item) => item.id === settings.brand)!;
  const grid = useMemo(() => mapBeadGrid(source.pixels, palette.colors), [source, palette]);
  const boards = useMemo(() => beadBoards(grid, settings.boardSize), [grid, settings.boardSize]);
  const boardIndex = Math.min(selected, boards.length - 1);
  const chart = useMemo(
    () => renderBeadBoardPreview(grid, settings.showCodes, settings.boardSize, boards[boardIndex]),
    [grid, settings.showCodes, settings.boardSize, boards, boardIndex],
  );
  const pngError = useMemo(() => {
    try {
      beadPatternSheetSize(grid, BEAD_CHART_CELL_SIZE, BEAD_ARTIFACT_ATTRIBUTION);
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }, [grid]);
  return {
    settings,
    grid,
    chart,
    boards,
    boardIndex,
    pngError,
    palettes: BEAD_PALETTES.map(({ id, name }) => ({ id, name })),
    changeSettings: (patch: Partial<BeadExportOptions>) =>
      setSettings((previous) =>
        patch.boardSize && !isValidBeadBoardSize(patch.boardSize)
          ? previous
          : { ...previous, ...patch },
      ),
    selectBoard: setSelected,
  };
}
