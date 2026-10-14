import { useMemo, useState, useSyncExternalStore } from "react";

import { tUi, type UiMessageKey } from "$/i18n";
import { ExporterGroup, type ExporterDefinition } from "$/managers/files/exporter-registry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  renderExport,
  mapBeadGrid,
  beadBoardCount,
  renderBeadPatternSheet,
  renderBeadChart,
  beadPatternSheetSize,
  encodeBeadPdfAsync,
  beadErrorCode,
  BeadErrorCode,
  beadFileName,
  defaultBeadFileStem,
  sanitizeBeadFileStem,
  DEFAULT_BEAD_BOARD_SIZE,
  MAX_BEAD_BOARDS,
  MIN_BEAD_BOARD_EDGE,
  MAX_BEAD_BOARD_EDGE,
  isValidBeadBoardSize,
  type BeadBoardSize,
  type BeadDocumentLabels,
  type BeadGrid,
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
export { BEAD_BOARD_PRESETS } from "@xprite/editor-core/import-export";
const MAX_SOURCE_CELLS = 512 * 512;
const DEFAULT_FILE_STEM = "sprite";
const PERCENT = 100;
export const BEAD_EXPORT_SIZE = { width: 960, height: 640 };

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

const BEAD_ERROR_KEYS: Readonly<Record<BeadErrorCode, UiMessageKey>> = {
  [BeadErrorCode.MissingPalette]: "ui.export.beads.error.palette",
  [BeadErrorCode.InvalidSource]: "ui.export.beads.error.source",
  [BeadErrorCode.InvalidBoardSize]: "ui.export.beads.board.size.invalid",
  [BeadErrorCode.ChartTooLarge]: "ui.export.beads.png.limit",
  [BeadErrorCode.TooManyBoards]: "ui.export.beads.boards.limit",
};

/** Translate a typed core failure; anything else is rethrown untouched. */
export function beadErrorMessage(code: BeadErrorCode, boards = 0): string {
  return tUi(BEAD_ERROR_KEYS[code], {
    min: MIN_BEAD_BOARD_EDGE,
    max: code === BeadErrorCode.TooManyBoards ? MAX_BEAD_BOARDS : MAX_BEAD_BOARD_EDGE,
    count: boards,
  });
}

/** Labels printed into PNG sheets and PDF pages, in the current UI language. */
export function beadDocumentLabels(): BeadDocumentLabels {
  return {
    sheetTitle: tUi("ui.export.beads.doc.title"),
    sheetMaterials: tUi("ui.export.beads.doc.legend"),
    summary: (values) => tUi("ui.export.beads.doc.summary", values),
    boardLayout: (values) => tUi("ui.export.beads.doc.layout", values),
    overview: (values) => tUi("ui.export.beads.doc.overview", values),
    boardPage: (values) => tUi("ui.export.beads.doc.board", values),
    boardRange: (values) => tUi("ui.export.beads.doc.range", values),
    materials: (values) => tUi("ui.export.beads.doc.materials", values),
    materialsContinued: (values) => tUi("ui.export.beads.doc.materials.continued", values),
    total: (values) => tUi("ui.export.beads.doc.total", values),
    code: tUi("ui.export.beads.code"),
    color: tUi("ui.export.beads.doc.color"),
    quantity: tUi("ui.export.beads.quantity"),
  };
}

function normalizeOptions(value: unknown): BeadExportOptions | null {
  if (!value || typeof value !== "object") return null;
  const options = value as BeadExportOptions;
  return Object.values(BeadBrand).includes(options.brand) &&
    isValidBeadBoardSize(options.boardSize) &&
    typeof options.showCodes === "boolean" &&
    Object.values(BeadOutputFormat).includes(options.format) &&
    typeof options.name === "string" &&
    !!sanitizeBeadFileStem(options.name)
    ? options
    : null;
}

/** Source pixels are rendered once per document snapshot and frame, then reused on export. */
const renderedSources = new WeakMap<EditorDocument, Map<number, PixelBuffer>>();
function sourcePixels(document: EditorDocument): PixelBuffer {
  const frame = document.timeline?.activeFrame ?? 0;
  let frames = renderedSources.get(document);
  if (!frames) renderedSources.set(document, (frames = new Map()));
  let pixels = frames.get(frame);
  if (!pixels) {
    pixels = renderExport(document, {
      name: "beads.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame,
      frames: "current",
    });
    frames.set(frame, pixels);
  }
  return pixels;
}

function paletteFor(brand: BeadBrand) {
  return BEAD_PALETTES.find((item) => item.id === brand)!;
}

/** Validation that must pass before any output is rendered; null when exportable. */
export function beadExportBlocker(grid: BeadGrid, options: BeadExportOptions): string | null {
  const boards = beadBoardCount(grid, options.boardSize);
  if (boards > MAX_BEAD_BOARDS) return beadErrorMessage(BeadErrorCode.TooManyBoards, boards);
  if (options.format === BeadOutputFormat.Png) {
    try {
      beadPatternSheetSize(grid, BEAD_CHART_CELL_SIZE, BEAD_ARTIFACT_ATTRIBUTION);
    } catch (reason) {
      const code = beadErrorCode(reason);
      if (code) return beadErrorMessage(code);
      throw reason;
    }
  }
  return null;
}

type ProgressListener = () => void;
let exportProgress: number | null = null;
const progressListeners = new Set<ProgressListener>();
function publishProgress(progress: number | null) {
  exportProgress = progress;
  for (const listener of progressListeners) listener();
}
/** Fraction 0..1 while a bead PDF is being encoded, otherwise null. */
export function useBeadExportProgress(): number | null {
  return useSyncExternalStore(
    (listener) => {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
    () => exportProgress,
    () => null,
  );
}
export function beadProgressLabel(progress: number): string {
  return tUi("ui.export.beads.progress", {
    percent: Math.round(progress * PERCENT),
  });
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const beadExporterDefinition: ExporterDefinition<BeadExportSource, BeadExportOptions> = {
  id: BeadExporterId.Beads,
  label: () => tUi("ui.export.beads"),
  group: ExporterGroup.Crafts,
  initialSize: BEAD_EXPORT_SIZE,
  available: ({ platform, document }) =>
    !!platform.files.exportOutput && document.width * document.height <= MAX_SOURCE_CELLS,
  normalizeOptions,
  createSource({ document }, remembered) {
    if (document.width * document.height > MAX_SOURCE_CELLS)
      throw new Error(tUi("ui.export.beads.source.limit"));
    return {
      pixels: sourcePixels(document),
      // The file name always follows the current sprite; other choices are remembered.
      settings: {
        ...(remembered ?? {
          brand: BeadBrand.Mard,
          boardSize: DEFAULT_BEAD_BOARD_SIZE,
          showCodes: true,
          format: BeadOutputFormat.Png,
        }),
        name: defaultBeadFileStem(document.name, DEFAULT_FILE_STEM),
      },
    };
  },
  async execute(context, options, ports) {
    if (context.document.width * context.document.height > MAX_SOURCE_CELLS)
      throw new Error(tUi("ui.export.beads.source.limit"));
    const palette = paletteFor(options.brand);
    let grid: BeadGrid;
    try {
      grid = mapBeadGrid(sourcePixels(context.document), palette.colors);
    } catch (reason) {
      const code = beadErrorCode(reason);
      throw code ? new Error(beadErrorMessage(code)) : reason;
    }
    const blocker = beadExportBlocker(grid, options);
    if (blocker) throw new Error(blocker);
    const output = context.platform.files.exportOutput!;
    const labels = beadDocumentLabels();
    const attribution = await output.readAttribution(
      BEAD_ARTIFACT_ATTRIBUTION.name,
      BEAD_ARTIFACT_ATTRIBUTION.url,
      logoUrl,
      options.format === BeadOutputFormat.Pdf,
    );
    const name = beadFileName(options.name, options.format, DEFAULT_FILE_STEM);
    let blob: Blob;
    if (options.format === BeadOutputFormat.Pdf) {
      publishProgress(0);
      try {
        const bytes = await encodeBeadPdfAsync(
          grid,
          palette.name,
          options.boardSize,
          options.showCodes,
          {
            attribution,
            labels,
            rasterText: output.rasterText,
            onProgress: publishProgress,
            yieldToHost: yieldToBrowser,
          },
        );
        blob = new Blob([new Uint8Array(bytes).buffer], {
          type: "application/pdf",
        });
      } finally {
        publishProgress(null);
      }
    } else {
      blob = await output.encodePng(
        renderBeadPatternSheet(
          grid,
          palette.name,
          options.showCodes,
          options.boardSize,
          attribution,
          output.rasterText,
          labels,
        ),
      );
    }
    await (ports.save ?? output.save)({ name, blob });
    return { names: [name] };
  },
};

export enum BeadBoardAxis {
  Width = "width",
  Height = "height",
}
type BoardDraft = Record<BeadBoardAxis, string>;

function parseBoardEdge(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() &&
    Number.isSafeInteger(value) &&
    value >= MIN_BEAD_BOARD_EDGE &&
    value <= MAX_BEAD_BOARD_EDGE
    ? value
    : null;
}

export interface BeadBoardRect {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The board under a pattern cell, clipped to the pattern edge. */
export function beadBoardAt(
  grid: Pick<BeadGrid, "width" | "height">,
  size: BeadBoardSize,
  cellX: number,
  cellY: number,
): BeadBoardRect | null {
  if (cellX < 0 || cellY < 0 || cellX >= grid.width || cellY >= grid.height) return null;
  const column = Math.floor(cellX / size.width),
    row = Math.floor(cellY / size.height);
  const x = column * size.width,
    y = row * size.height;
  return {
    column,
    row,
    x,
    y,
    width: Math.min(size.width, grid.width - x),
    height: Math.min(size.height, grid.height - y),
  };
}

const MAX_PREVIEW_PIXELS = 16 * 1024 * 1024;
const MAX_PREVIEW_EDGE = 8192;

/** Largest whole chart cell, up to the export cell, that keeps the preview canvas affordable. */
export function beadPreviewCell(grid: Pick<BeadGrid, "width" | "height">, wanted: number): number {
  let cell = Math.max(1, Math.min(BEAD_CHART_CELL_SIZE, Math.round(wanted)));
  while (
    cell > 1 &&
    ((grid.width * cell + 1) * (grid.height * cell + 1) > MAX_PREVIEW_PIXELS ||
      Math.max(grid.width, grid.height) * cell + 1 > MAX_PREVIEW_EDGE)
  )
    cell--;
  return cell;
}

/** Whole-pattern chart with board edges, rendered at the cell size it is displayed at. */
export function useBeadChart(grid: BeadGrid, settings: BeadExportOptions, cell: number) {
  return useMemo(
    () => renderBeadChart(grid, settings.showCodes, settings.boardSize, undefined, cell),
    [grid, settings.showCodes, settings.boardSize, cell],
  );
}

export function useBeadExport(source: BeadExportSource) {
  const [settings, setSettings] = useState(source.settings);
  const [draft, setDraft] = useState<BoardDraft>(() => ({
    width: String(source.settings.boardSize.width),
    height: String(source.settings.boardSize.height),
  }));
  const palette = paletteFor(settings.brand);
  const grid = useMemo(
    () => mapBeadGrid(source.pixels, palette.colors),
    [source.pixels, palette.colors],
  );
  const boardCount = useMemo(
    () => beadBoardCount(grid, settings.boardSize),
    [grid, settings.boardSize],
  );
  const draftInvalid = Object.values(draft).some((raw) => parseBoardEdge(raw) === null);
  const blocker = useMemo(
    () =>
      draftInvalid
        ? beadErrorMessage(BeadErrorCode.InvalidBoardSize)
        : beadExportBlocker(grid, settings),
    [draftInvalid, grid, settings],
  );
  const applyBoard = (boardSize: BeadBoardSize) =>
    setSettings((previous) =>
      previous.boardSize.width === boardSize.width && previous.boardSize.height === boardSize.height
        ? previous
        : { ...previous, boardSize },
    );
  const changeBoard = (axis: BeadBoardAxis, raw: string) => {
    setDraft((previous) => ({ ...previous, [axis]: raw }));
    const value = parseBoardEdge(raw);
    if (value !== null) applyBoard({ ...settings.boardSize, [axis]: value });
  };
  const choosePreset = (boardSize: BeadBoardSize) => {
    setDraft({ width: String(boardSize.width), height: String(boardSize.height) });
    applyBoard(boardSize);
  };
  return {
    settings,
    grid,
    boardCount,
    draft,
    blocker,
    palettes: BEAD_PALETTES.map(({ id, name }) => ({ id, name })),
    changeSettings: (patch: Partial<Omit<BeadExportOptions, "boardSize" | "name">>) =>
      setSettings((previous) => ({ ...previous, ...patch })),
    changeBoard,
    choosePreset,
  };
}
