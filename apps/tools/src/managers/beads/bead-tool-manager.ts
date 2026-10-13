import type { BeadInput, BeadToolPort } from "$/managers/ports/beads";
import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import {
  ToolTelemetry,
  ToolOperation,
  ToolOpenSource,
  ToolOutputFormat,
} from "$/managers/telemetry/tool-telemetry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  renderExport,
  pixelateImage,
  defaultPixelationSettings,
  updatePixelationSettings,
  pixelationSettingsOptions,
  PixelationMethod,
  PIXELATION_METHOD_OPTIONS,
  mapBeadGrid,
  beadBoards,
  beadPatternSheetSize,
  BEAD_CHART_CELL_SIZE,
  beadPreviewCellSize,
  renderBeadOverviewPreview,
  renderBeadBoardPreview,
  DEFAULT_BEAD_BOARD_SIZE,
  isValidBeadBoardSize,
  type BeadGrid,
  type BeadBoard,
  type BeadBoardSize,
  type BeadColor,
  type PixelationSettings,
} from "@xprite/editor-core/import-export";
import { TILESET_EMBEDDED_PIXELS_FLAG } from "@xprite/editor-core/tilemap";
import { layerAncestors } from "@xprite/editor-core/timeline";
import { BEAD_ARTIFACT_ATTRIBUTION } from "@xprite/growth-content/tools";
import { BEAD_PALETTES, BeadBrand } from "@xprite/palette-assets/beads";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";

export enum BeadPreviewMode {
  Board = "board",
  Overview = "overview",
  Source = "source",
}
export {
  MAX_PIXELATION_SIZE,
  MIN_BEAD_BOARD_EDGE,
  MAX_BEAD_BOARD_EDGE,
} from "@xprite/editor-core/import-export";
export enum BeadMaterialSort {
  Quantity = "quantity",
  Code = "code",
}
const DEFAULT_GRID_EDGE = 128;
const PREVIEW_DELAY_MS = 150;
const MAX_PREVIEW_EDGE = 4096;
const MAX_PREVIEW_PIXELS = 16 * 1024 * 1024;
const MIN_GRID_EDGE = 1;

export interface BeadToolSettings extends Pick<
  PixelationSettings,
  "targetWidth" | "targetHeight" | "lockAspectRatio" | "method"
> {
  brand: BeadBrand;
  boardSize: BeadBoardSize;
  showCodes: boolean;
}
export interface BeadToolSnapshot {
  source: PixelBuffer | null;
  grid: BeadGrid | null;
  preview: PixelBuffer | null;
  boards: readonly BeadBoard[];
  selected: number;
  mode: BeadPreviewMode;
  settings: Readonly<BeadToolSettings>;
  name: string;
  outputName: string;
  frame: number;
  frameCount: number;
  identity: number;
  loading: boolean;
  pending: boolean;
  downloading: boolean;
  error: string | null;
  pngError: string | null;
  excludedColors: readonly BeadColor[];
  highlight: string | null;
  previewLayout: BeadPreviewLayout | null;
}

export interface BeadPreviewLayout {
  columns: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  cellSize: number;
  boardSize: BeadBoardSize;
}

export class BeadToolManager {
  readonly navigation: ToolViewport;
  readonly brands = BEAD_PALETTES.map(({ id, name }) => ({ value: id, label: name }));
  readonly samplingModes = PIXELATION_METHOD_OPTIONS;
  private state: BeadToolSnapshot = {
    source: null,
    grid: null,
    preview: null,
    boards: [],
    selected: 0,
    mode: BeadPreviewMode.Overview,
    settings: {
      brand: BeadBrand.Mard,
      targetWidth: DEFAULT_GRID_EDGE,
      targetHeight: DEFAULT_GRID_EDGE,
      lockAspectRatio: true,
      boardSize: DEFAULT_BEAD_BOARD_SIZE,
      showCodes: true,
      method: PixelationMethod.Nearest,
    },
    name: "",
    outputName: "",
    frame: 0,
    frameCount: 1,
    identity: 0,
    loading: false,
    pending: false,
    downloading: false,
    error: null,
    pngError: null,
    excludedColors: [],
    highlight: null,
    previewLayout: null,
  };
  private input: BeadInput | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  private closed = false;
  private readonly listeners = new Set<() => void>();
  private readonly telemetry: ToolTelemetry;
  constructor(
    private readonly port: BeadToolPort,
    telemetry?: SiteTelemetryPort,
  ) {
    this.navigation = new ToolViewport(port.readWheel, {
      maxDisplayDimension: MAX_PREVIEW_EDGE,
      maxDisplayPixels: MAX_PREVIEW_PIXELS,
    });
    this.telemetry = new ToolTelemetry(telemetry);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<BeadToolSnapshot>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private cancelPreview() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private framePixels(input: BeadInput, frame: number, name: string) {
    if (!input.project) return input.pixels;
    const project = input.project;
    const timeline = project.timeline;
    for (const [index, layer] of timeline.layers.entries()) {
      if (
        layer.kind !== "tilemap" ||
        !layer.visible ||
        !layerAncestors(timeline, index).every((parent) => parent.visible)
      )
        continue;
      const tileset = timeline.tilesets?.find((item) => item.id === layer.tilesetId);
      if (tileset?.external && !(tileset.flags & TILESET_EMBEDDED_PIXELS_FLAG))
        throw new ToolOperationError(
          ToolFailureCategory.UnsupportedFormat,
          "Embed external tilesets before opening this project.",
        );
    }
    const document: EditorDocument = {
      name,
      width: project.image.width,
      height: project.image.height,
      timeline,
      palette: project.palette,
      selection: null,
      layer: { name: "", pixels: project.image, x: 0, y: 0, visible: true, locked: false },
    };
    return renderExport(document, {
      name: "beads.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame,
      frames: "current",
    });
  }
  private async load(getFile: () => Promise<File>, source: ToolOpenSource) {
    if (this.closed || this.state.downloading) return;
    const request = ++this.request;
    this.cancelPreview();
    this.publish({
      loading: true,
      pending: false,
      error: null,
      grid: null,
      preview: null,
      boards: [],
      pngError: null,
    });
    let failureCategory =
      source === ToolOpenSource.Example
        ? ToolFailureCategory.ExampleFetch
        : ToolFailureCategory.Decode;
    try {
      const file = await getFile();
      failureCategory = ToolFailureCategory.Decode;
      if (this.closed || request !== this.request) return;
      const input = await this.port.read(file);
      if (this.closed || request !== this.request) return;
      const pixels = this.framePixels(input, 0, file.name);
      const scale = Math.min(
        1,
        DEFAULT_GRID_EDGE / pixels.width,
        DEFAULT_GRID_EDGE / pixels.height,
      );
      this.input = input;
      this.publish({
        source: pixels,
        grid: null,
        preview: null,
        boards: [],
        selected: 0,
        mode: BeadPreviewMode.Overview,
        highlight: null,
        name: file.name,
        outputName: `${file.name.replace(/\.[^.]+$/, "")}-beads`,
        frame: 0,
        frameCount: input.project?.timeline.frames.length ?? 1,
        identity: this.state.identity + 1,
        settings: {
          ...this.state.settings,
          targetWidth: Math.max(MIN_GRID_EDGE, Math.round(pixels.width * scale)),
          targetHeight: Math.max(MIN_GRID_EDGE, Math.round(pixels.height * scale)),
        },
        loading: false,
        pngError: null,
      });
      this.generate();
      if (!this.state.error) this.telemetry.opened(request, file, source);
      else this.telemetry.failed(ToolOperation.Open, ToolFailureCategory.Preview);
    } catch (reason) {
      if (this.closed || request !== this.request) return;
      this.telemetry.failed(ToolOperation.Open, failureCategory, reason);
      this.publish({ loading: false });
      if (this.state.source) this.generate();
      this.publish({ error: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  open = (file: File) => this.load(async () => file, ToolOpenSource.File);
  openExample = () => this.load(() => this.port.example(), ToolOpenSource.Example);
  setFrame = (frame: number) => {
    if (
      !this.input ||
      this.closed ||
      this.state.loading ||
      this.state.downloading ||
      !Number.isSafeInteger(frame) ||
      frame < 0 ||
      frame >= this.state.frameCount ||
      frame === this.state.frame
    )
      return;
    try {
      const pixels = this.framePixels(this.input, frame, this.state.name);
      this.publish({ frame, source: pixels, identity: this.state.identity + 1 });
      this.schedulePreview();
    } catch (reason) {
      this.publish({ error: reason instanceof Error ? reason.message : String(reason) });
    }
  };
  changeSettings = (patch: Partial<BeadToolSettings>) => {
    if (!this.state.source || this.closed || this.state.loading || this.state.downloading) return;
    const normalized = updatePixelationSettings(
      { ...defaultPixelationSettings(this.state.source), ...this.state.settings },
      patch,
      this.state.source,
    );
    const settings = {
      ...this.state.settings,
      ...patch,
      targetWidth: normalized.targetWidth,
      targetHeight: normalized.targetHeight,
      lockAspectRatio: normalized.lockAspectRatio,
      method: normalized.method,
    };
    if (
      !Object.values(BeadBrand).includes(settings.brand) ||
      !isValidBeadBoardSize(settings.boardSize) ||
      !Object.values(PixelationMethod).includes(settings.method)
    )
      return;
    const remap =
      settings.brand !== this.state.settings.brand ||
      settings.targetWidth !== this.state.settings.targetWidth ||
      settings.targetHeight !== this.state.settings.targetHeight ||
      settings.method !== this.state.settings.method;
    const brandChanged = settings.brand !== this.state.settings.brand;
    this.publish({ settings, ...(brandChanged ? { excludedColors: [], highlight: null } : {}) });
    if (remap) this.schedulePreview();
    else if (!this.state.pending) this.updatePreview();
  };
  setOutputName = (outputName: string) => {
    if (this.closed || this.state.loading || this.state.downloading) return;
    this.publish({ outputName });
  };
  private canChangeColors() {
    return (
      !!this.state.grid &&
      !this.closed &&
      !this.state.loading &&
      !this.state.downloading &&
      !this.state.pending
    );
  }
  highlightColor = (code: string | null) => {
    if (
      !this.canChangeColors() ||
      (code !== null && !this.state.grid!.usage.some(({ color }) => color.code === code))
    )
      return;
    this.publish({
      highlight: this.state.highlight === code ? null : code,
      mode: BeadPreviewMode.Overview,
      identity: this.state.identity + (this.state.mode === BeadPreviewMode.Overview ? 0 : 1),
    });
    this.updatePreview();
  };
  excludeColor = (code: string) => {
    if (!this.canChangeColors() || this.state.grid!.usage.length <= 1) return;
    const color = this.state.grid!.usage.find((item) => item.color.code === code)?.color;
    if (!color) return;
    this.publish({
      excludedColors: [...this.state.excludedColors, color],
      highlight: this.state.highlight === code ? null : this.state.highlight,
    });
    this.schedulePreview();
  };
  restoreColor = (code: string) => {
    if (!this.canChangeColors() || !this.state.excludedColors.some((color) => color.code === code))
      return;
    this.publish({
      excludedColors: this.state.excludedColors.filter((color) => color.code !== code),
    });
    this.schedulePreview();
  };
  restoreAllColors = () => {
    if (!this.canChangeColors() || !this.state.excludedColors.length) return;
    this.publish({ excludedColors: [] });
    this.schedulePreview();
  };
  private schedulePreview() {
    this.cancelPreview();
    this.publish({ pending: true, error: null });
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.generate();
    }, PREVIEW_DELAY_MS);
  }
  private generate() {
    if (!this.state.source || this.closed) return;
    try {
      const { brand } = this.state.settings;
      const normalized = updatePixelationSettings(
        { ...defaultPixelationSettings(this.state.source), ...this.state.settings },
        {},
        this.state.source,
      );
      const pixels = pixelateImage(
        this.state.source,
        pixelationSettingsOptions(
          {
            ...normalized,
            reduceColors: false,
          },
          this.state.source,
        ),
      );
      const palette = BEAD_PALETTES.find((item) => item.id === brand)!;
      const excluded = new Set(this.state.excludedColors.map((color) => color.code));
      const original = mapBeadGrid(pixels, palette.colors);
      const remaining = original.usage
        .map(({ color }) => color)
        .filter((color) => !excluded.has(color.code));
      const grid = excluded.size
        ? mapBeadGrid(
            pixels,
            remaining.length
              ? remaining
              : palette.colors.filter((color) => !excluded.has(color.code)),
          )
        : original;
      let pngError: string | null = null;
      try {
        beadPatternSheetSize(grid, BEAD_CHART_CELL_SIZE, BEAD_ARTIFACT_ATTRIBUTION);
      } catch (reason) {
        pngError = reason instanceof Error ? reason.message : String(reason);
      }
      const highlight = grid.usage.some(({ color }) => color.code === this.state.highlight)
        ? this.state.highlight
        : null;
      this.publish({
        grid,
        pngError,
        highlight,
        settings: {
          ...this.state.settings,
          targetWidth: normalized.targetWidth,
          targetHeight: normalized.targetHeight,
        },
        pending: false,
        error: null,
      });
      this.updatePreview();
    } catch (reason) {
      this.publish({
        grid: null,
        preview: null,
        pending: false,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }
  private updatePreview() {
    const grid = this.state.grid;
    if (!grid || !this.state.source) return;
    const { boardSize, showCodes } = this.state.settings;
    const boards = beadBoards(grid, boardSize);
    const selected = Math.min(this.state.selected, boards.length - 1);
    const area =
      this.state.mode === BeadPreviewMode.Board
        ? boards[selected]
        : { x: 0, y: 0, width: grid.width, height: grid.height };
    const preview =
      this.state.mode === BeadPreviewMode.Source
        ? this.state.source
        : this.state.mode === BeadPreviewMode.Overview
          ? renderBeadOverviewPreview(grid, showCodes, boardSize, this.state.highlight, false)
          : renderBeadBoardPreview(
              grid,
              showCodes,
              boardSize,
              boards[selected],
              this.state.highlight,
              false,
            );
    this.publish({
      preview,
      boards,
      selected,
      previewLayout:
        this.state.mode === BeadPreviewMode.Source
          ? null
          : {
              columns: area.width,
              rows: area.height,
              offsetX: area.x,
              offsetY: area.y,
              cellSize: beadPreviewCellSize(area),
              boardSize,
            },
    });
  }
  setMode = (mode: BeadPreviewMode) => {
    if (
      !Object.values(BeadPreviewMode).includes(mode) ||
      mode === this.state.mode ||
      this.state.pending
    )
      return;
    this.publish({ mode, identity: this.state.identity + 1 });
    this.updatePreview();
  };
  selectBoard = (index: number) => {
    if (!Number.isSafeInteger(index) || !this.state.boards[index] || this.state.pending) return;
    this.publish({
      selected: index,
      mode: BeadPreviewMode.Board,
      identity: this.state.identity + 1,
    });
    this.updatePreview();
  };
  selectAt = (point: { x: number; y: number }) => {
    const grid = this.state.grid;
    const cellSize = grid ? beadPreviewCellSize(grid) : 1;
    if (
      this.state.mode !== BeadPreviewMode.Overview ||
      !grid ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= grid.width * cellSize ||
      point.y >= grid.height * cellSize
    )
      return;
    const { width, height } = this.state.settings.boardSize;
    const columns = Math.ceil(grid.width / width);
    this.selectBoard(
      Math.floor(point.y / cellSize / height) * columns + Math.floor(point.x / cellSize / width),
    );
  };
  downloadPng = () => this.download(ToolOutputFormat.Png);
  downloadPdf = () => this.download(ToolOutputFormat.Pdf);
  private async download(format: ToolOutputFormat.Png | ToolOutputFormat.Pdf) {
    const { grid, settings, outputName } = this.state;
    if (
      !grid ||
      this.closed ||
      this.state.loading ||
      this.state.pending ||
      this.state.downloading ||
      !outputName.trim() ||
      (format === ToolOutputFormat.Png && this.state.pngError)
    )
      return;
    const request = this.request;
    const name = `${outputName.trim().replace(/\.(png|pdf)$/i, "")}.${format}`;
    this.publish({ downloading: true, error: null });
    try {
      if (format === ToolOutputFormat.Png)
        await this.port.savePng(
          grid,
          BEAD_PALETTES.find((item) => item.id === settings.brand)!.name,
          settings.showCodes,
          settings.boardSize,
          name,
        );
      else
        await this.port.savePdf(
          grid,
          BEAD_PALETTES.find((item) => item.id === settings.brand)!.name,
          settings.showCodes,
          settings.boardSize,
          name,
        );
      if (!this.closed && request === this.request)
        this.telemetry.handedOff(
          request,
          format === ToolOutputFormat.Png ? ToolOutputFormat.Png : ToolOutputFormat.Pdf,
        );
    } catch (reason) {
      if (request === this.request) {
        this.telemetry.failed(ToolOperation.Export, ToolFailureCategory.Handoff, reason);
        this.publish({ error: reason instanceof Error ? reason.message : String(reason) });
      }
    } finally {
      if (request === this.request) this.publish({ downloading: false });
    }
  }
  dispose() {
    this.closed = true;
    ++this.request;
    this.cancelPreview();
    this.listeners.clear();
  }
}
