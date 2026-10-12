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
  resizeNearest,
  mapBeadGrid,
  beadBoards,
  beadChartSize,
  beadGridPixels,
  renderBeadBoardPreview,
  DEFAULT_BEAD_BOARD_SIZE,
  isValidBeadBoardSize,
  type BeadGrid,
  type BeadBoard,
  type BeadBoardSize,
} from "@xprite/editor-core/import-export";
import { TILESET_EMBEDDED_PIXELS_FLAG } from "@xprite/editor-core/tilemap";
import { layerAncestors } from "@xprite/editor-core/timeline";
import { BEAD_PALETTES, BeadBrand } from "@xprite/palette-assets/beads";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";

export enum BeadPreviewMode {
  Board = "board",
  Overview = "overview",
  Source = "source",
}
export { MIN_BEAD_BOARD_EDGE, MAX_BEAD_BOARD_EDGE } from "@xprite/editor-core/import-export";
export const MAX_BEAD_GRID_EDGE = 512;
const DEFAULT_GRID_EDGE = 128;
const PREVIEW_DELAY_MS = 150;
const MAX_PREVIEW_EDGE = 4096;
const MAX_PREVIEW_PIXELS = 16 * 1024 * 1024;
const MIN_GRID_EDGE = 1;

export interface BeadToolSettings {
  brand: BeadBrand;
  width: number;
  height: number;
  lockAspect: boolean;
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
}

export class BeadToolManager {
  readonly navigation: ToolViewport;
  readonly brands = BEAD_PALETTES.map(({ id, name }) => ({ value: id, label: name }));
  private state: BeadToolSnapshot = {
    source: null,
    grid: null,
    preview: null,
    boards: [],
    selected: 0,
    mode: BeadPreviewMode.Board,
    settings: {
      brand: BeadBrand.Mard,
      width: DEFAULT_GRID_EDGE,
      height: DEFAULT_GRID_EDGE,
      lockAspect: true,
      boardSize: DEFAULT_BEAD_BOARD_SIZE,
      showCodes: true,
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
        name: file.name,
        outputName: `${file.name.replace(/\.[^.]+$/, "")}-beads`,
        frame: 0,
        frameCount: input.project?.timeline.frames.length ?? 1,
        identity: this.state.identity + 1,
        settings: {
          ...this.state.settings,
          width: Math.max(MIN_GRID_EDGE, Math.round(pixels.width * scale)),
          height: Math.max(MIN_GRID_EDGE, Math.round(pixels.height * scale)),
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
    const settings = { ...this.state.settings, ...patch };
    if (
      !Object.values(BeadBrand).includes(settings.brand) ||
      !isValidBeadBoardSize(settings.boardSize)
    )
      return;
    if (
      ![settings.width, settings.height].every(
        (value) =>
          Number.isSafeInteger(value) && value >= MIN_GRID_EDGE && value <= MAX_BEAD_GRID_EDGE,
      )
    )
      return;
    if (
      settings.lockAspect &&
      (patch.width !== undefined || patch.height !== undefined || patch.lockAspect === true)
    ) {
      const ratio = this.state.source.width / this.state.source.height;
      const fromWidth = patch.height === undefined;
      const width = fromWidth ? settings.width : settings.height * ratio;
      const height = fromWidth ? settings.width / ratio : settings.height;
      const factor = Math.min(1, MAX_BEAD_GRID_EDGE / width, MAX_BEAD_GRID_EDGE / height);
      settings.width = Math.max(MIN_GRID_EDGE, Math.round(width * factor));
      settings.height = Math.max(MIN_GRID_EDGE, Math.round(height * factor));
    }
    const remap =
      settings.brand !== this.state.settings.brand ||
      settings.width !== this.state.settings.width ||
      settings.height !== this.state.settings.height;
    this.publish({ settings });
    if (remap) this.schedulePreview();
    else if (!this.state.pending) this.updatePreview();
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
      const { width, height, brand } = this.state.settings;
      const pixels = resizeNearest(this.state.source, width, height);
      const palette = BEAD_PALETTES.find((item) => item.id === brand)!;
      const grid = mapBeadGrid(pixels, palette.colors);
      let pngError: string | null = null;
      try {
        beadChartSize(grid);
      } catch (reason) {
        pngError = reason instanceof Error ? reason.message : String(reason);
      }
      this.publish({ grid, pngError, pending: false, error: null });
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
    const preview =
      this.state.mode === BeadPreviewMode.Source
        ? this.state.source
        : this.state.mode === BeadPreviewMode.Overview
          ? beadGridPixels(grid)
          : renderBeadBoardPreview(grid, showCodes, boardSize, boards[selected]);
    this.publish({ preview, boards, selected });
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
    if (
      this.state.mode !== BeadPreviewMode.Overview ||
      !grid ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= grid.width ||
      point.y >= grid.height
    )
      return;
    const { width, height } = this.state.settings.boardSize;
    const columns = Math.ceil(grid.width / width);
    this.selectBoard(Math.floor(point.y / height) * columns + Math.floor(point.x / width));
  };
  setOutputName = (name: string) => {
    if (!this.state.downloading) this.publish({ outputName: name });
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
        await this.port.savePng(grid, settings.showCodes, settings.boardSize, name);
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
