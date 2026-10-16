import { IslandPreviewManager } from "$/managers/animal-crossing/ground/ground-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import type { IslandPreviewPort } from "$/managers/ports/animal-crossing-ground";
import { ToolFailureCategory } from "$/managers/ports/telemetry";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import {
  ToolTelemetry,
  ToolOpenSource,
  ToolOperation,
  ToolOutputFormat,
} from "$/managers/telemetry/tool-telemetry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  ANIMAL_CROSSING_SIZE,
  animalCrossingGrid,
  animalCrossingQrPixels,
  importedAnimalCrossingResult,
  type ImportedAnimalCrossingPattern,
  type AnimalCrossingConversionSnapshot,
  defaultAnimalCrossingSettings,
  animalCrossingDocumentSource,
  type AnimalCrossingSettings,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";

export type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";
export enum AnimalCrossingLayout {
  Single = "single",
  Tiles = "tiles",
}

const EXAMPLE_TITLE = "Winding stone";
const EXAMPLE_CREATOR = "Amy";
const PREVIEW_DELAY_MS = 200;
const GEOMETRY_KEYS = [
  "cellWidth",
  "cellHeight",
  "offsetX",
  "offsetY",
  "spacingX",
  "spacingY",
] as const;
const INITIAL_SIZE = { width: ANIMAL_CROSSING_SIZE, height: ANIMAL_CROSSING_SIZE };
export interface AnimalCrossingSnapshot extends AnimalCrossingConversionSnapshot {
  name: string;
  example: boolean;
  previewOpen: boolean;
  layout: AnimalCrossingLayout;
  loading: boolean;
  downloading: boolean;
  error: string | null;
  identity: number;
  frame: number;
  frameCount: number;
  pending: boolean;
}
type AnimalCrossingToolState = Omit<
  AnimalCrossingSnapshot,
  keyof AnimalCrossingConversionSnapshot
> & {
  error: string | null;
};

export class AnimalCrossingManager {
  readonly viewport: ToolViewport;
  readonly ground: IslandPreviewManager;
  private state: AnimalCrossingToolState = {
    name: "",
    example: false,
    previewOpen: false,
    layout: AnimalCrossingLayout.Single,
    loading: false,
    downloading: false,
    error: null,
    identity: 0,
    frame: 0,
    frameCount: 1,
    pending: false,
  };
  private conversion: AnimalCrossingConversionSnapshot = {
    source: null,
    settings: defaultAnimalCrossingSettings(INITIAL_SIZE),
    importedQr: false,
    result: null,
    selected: 0,
    qr: null,
    error: null,
  };
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewController: AbortController | null = null;
  private previewRevision = 0;
  private gridDraft: { settings: AnimalCrossingSettings; selected: number } | null = null;
  private snapshot: AnimalCrossingSnapshot;
  private tileDraft = defaultAnimalCrossingSettings(INITIAL_SIZE);
  private project: SessionProject | undefined;
  private request = 0;
  private closed = false;
  private readonly telemetry: ToolTelemetry;
  private listeners = new Set<() => void>();
  constructor(
    private readonly port: AnimalCrossingPort,
    groundPort?: IslandPreviewPort,
    telemetry?: SiteTelemetryPort,
  ) {
    this.telemetry = new ToolTelemetry(telemetry);
    this.ground = new IslandPreviewManager(groundPort);
    this.viewport = new ToolViewport(port.readWheel);
    this.snapshot = this.readSnapshot();
  }
  getSnapshot = () => this.snapshot;
  setPreviewOpen(previewOpen: boolean) {
    this.update({ previewOpen });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private readSnapshot(): AnimalCrossingSnapshot {
    const conversion = this.conversion;
    return { ...this.state, ...conversion, error: this.state.error ?? conversion.error };
  }
  private update(patch: Partial<AnimalCrossingToolState>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    this.snapshot = this.readSnapshot();
    if (!this.snapshot.pending && !this.snapshot.loading)
      this.ground.setDesign(
        this.snapshot.result,
        this.snapshot.selected,
        this.snapshot.source,
        this.snapshot.settings,
      );
    for (const listener of this.listeners) listener();
  }
  async open(file: File): Promise<void> {
    await this.openFile(file);
  }
  private async openFile(
    file: File,
    openSource = ToolOpenSource.File,
    example = false,
  ): Promise<boolean> {
    if (this.closed || this.snapshot.downloading) return false;
    const request = ++this.request;
    this.cancelPreview();
    this.conversion.error = null;
    this.update({ loading: true, error: null });
    let failureCategory = ToolFailureCategory.Decode;
    try {
      const source = await this.port.read(file);
      if (this.closed || request !== this.request) return false;
      failureCategory = ToolFailureCategory.Preview;
      const rendered = source.project ? this.render(0, file.name, source.project) : null;
      const pixels = rendered?.pixels ?? source.pixels;
      const settings = rendered?.settings ?? defaultAnimalCrossingSettings(pixels);
      settings.title = source.pattern?.title ?? file.name.replace(/\.[^.]+$/, "");
      if (source.pattern) {
        settings.creator = source.pattern.creator;
        settings.town = source.pattern.town;
      }
      if (example)
        Object.assign(settings, {
          title: EXAMPLE_TITLE,
          creator: EXAMPLE_CREATOR,
          town: "Bywater",
        });
      this.setSource(pixels, settings, source.pattern);
      this.tileDraft = { ...settings };
      this.project = source.project;
      this.update({
        name: file.name,
        example,
        pending: !source.pattern,
        layout:
          pixels.width > settings.cellWidth || pixels.height > settings.cellHeight
            ? AnimalCrossingLayout.Tiles
            : AnimalCrossingLayout.Single,
        frame: 0,
        frameCount: this.project?.timeline.frames.length ?? 1,
        identity: request,
        loading: false,
        error: null,
      });
      if (this.snapshot.source && !this.snapshot.error)
        this.telemetry.opened(request, file, openSource);
      else this.telemetry.failed(ToolOperation.Open, ToolFailureCategory.Preview);
      if (!source.pattern && !example) await this.generate();
      return true;
    } catch (reason) {
      if (!this.closed && request === this.request) {
        this.telemetry.failed(ToolOperation.Open, failureCategory, reason);
        this.update({
          loading: false,
          error: String(reason instanceof Error ? reason.message : reason),
        });
      }
      return false;
    }
  }
  private render(frame: number, name = this.snapshot.name, project = this.project!) {
    const document: EditorDocument = {
      name,
      width: project.image.width,
      height: project.image.height,
      timeline: project.timeline,
      palette: project.palette,
      selection: null,
      layer: { name: "", pixels: project.image, x: 0, y: 0, visible: true, locked: false },
    };
    return animalCrossingDocumentSource(document, frame);
  }
  setFrame(frame: number) {
    if (
      this.closed ||
      !this.project ||
      !Number.isInteger(frame) ||
      frame < 0 ||
      frame >= this.snapshot.frameCount
    )
      return;
    try {
      this.setSource(this.render(frame).pixels, this.snapshot.settings);
      this.update({ frame, pending: true, error: null });
      this.schedulePreview(0);
    } catch (reason) {
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  setLayout(layout: AnimalCrossingLayout) {
    const source = this.snapshot.source;
    if (this.closed || !source || this.snapshot.importedQr || this.snapshot.layout === layout)
      return;
    if (layout === AnimalCrossingLayout.Single) this.tileDraft = { ...this.snapshot.settings };
    const geometry =
      layout === AnimalCrossingLayout.Single
        ? {
            cellWidth: source.width,
            cellHeight: source.height,
            offsetX: 0,
            offsetY: 0,
            spacingX: 0,
            spacingY: 0,
          }
        : {
            cellWidth: this.tileDraft.cellWidth,
            cellHeight: this.tileDraft.cellHeight,
            offsetX: this.tileDraft.offsetX,
            offsetY: this.tileDraft.offsetY,
            spacingX: this.tileDraft.spacingX,
            spacingY: this.tileDraft.spacingY,
          };
    this.changeSettings(geometry);
    this.update({ layout });
  }
  getGrid(converted: boolean) {
    const pixels = converted ? this.conversion.result?.pixels : this.conversion.source;
    if (!pixels) return null;
    try {
      return animalCrossingGrid(
        pixels,
        converted ? defaultAnimalCrossingSettings(pixels) : this.conversion.settings,
      );
    } catch {
      return null;
    }
  }
  private cancelPreview() {
    this.previewRevision++;
    if (this.previewTimer !== undefined) clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.previewController?.abort();
    this.previewController = null;
  }
  private setSource(
    pixels: PixelBuffer,
    settings: AnimalCrossingSettings,
    pattern?: ImportedAnimalCrossingPattern,
  ) {
    this.cancelPreview();
    if (this.conversion.source) this.port.releasePreview(this.conversion.source);
    this.gridDraft = null;
    const result = pattern ? importedAnimalCrossingResult(pattern) : null;
    this.conversion = {
      source: pixels,
      settings: { ...settings },
      importedQr: !!pattern,
      result,
      selected: 0,
      qr: result ? animalCrossingQrPixels(result.patterns[0].bytes) : null,
      error: null,
    };
  }
  private schedulePreview(delay: number) {
    this.cancelPreview();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      void this.generate();
    }, delay);
  }
  beginGridEdit = () => {
    if (
      this.closed ||
      this.snapshot.importedQr ||
      this.snapshot.downloading ||
      this.snapshot.loading ||
      this.gridDraft
    )
      return;
    this.gridDraft = { settings: { ...this.snapshot.settings }, selected: this.snapshot.selected };
    this.cancelPreview();
  };
  endGridEdit = (cancel = false) => {
    const draft = this.gridDraft;
    if (this.closed) {
      this.gridDraft = null;
      return;
    }
    if (!draft) return;
    this.gridDraft = null;
    if (cancel) {
      this.conversion = { ...this.conversion, ...draft };
      this.update({ pending: true });
    }
    if (this.snapshot.pending) this.schedulePreview(0);
  };
  changeSettings = (patch: Partial<AnimalCrossingSettings>) => {
    if (
      this.closed ||
      this.snapshot.importedQr ||
      this.snapshot.loading ||
      this.snapshot.downloading ||
      !this.snapshot.source
    )
      return;
    if (
      !Object.entries(patch).some(
        ([key, value]) => this.snapshot.settings[key as keyof AnimalCrossingSettings] !== value,
      )
    )
      return;
    const previous = this.getGrid(false),
      selected = this.snapshot.selected;
    const settings = { ...this.snapshot.settings, ...patch };
    this.conversion = { ...this.conversion, settings, error: null };
    if (GEOMETRY_KEYS.some((key) => patch[key] !== undefined)) {
      const next = this.getGrid(false);
      this.conversion.selected = next
        ? Math.min(previous ? Math.floor(selected / previous.columns) : 0, next.rows - 1) *
            next.columns +
          Math.min(previous ? selected % previous.columns : 0, next.columns - 1)
        : 0;
    }
    this.update({ pending: true, error: null });
    if (!this.gridDraft) this.schedulePreview(PREVIEW_DELAY_MS);
  };
  async generate() {
    const { source, settings, selected, importedQr } = this.conversion;
    if (
      this.closed ||
      !source ||
      this.snapshot.loading ||
      this.snapshot.downloading ||
      importedQr ||
      this.gridDraft
    )
      return;
    this.cancelPreview();
    const revision = this.previewRevision,
      identity = this.snapshot.identity;
    const controller = new AbortController();
    this.previewController = controller;
    this.update({ pending: true, error: null });
    try {
      const preview = await this.port.preview(source, { ...settings }, selected, controller.signal);
      if (this.closed || revision !== this.previewRevision || identity !== this.snapshot.identity)
        return;
      this.conversion = { ...this.conversion, ...preview, error: null };
      this.update({ pending: false, error: null });
    } catch (reason) {
      if (
        !this.closed &&
        revision === this.previewRevision &&
        identity === this.snapshot.identity
      ) {
        this.conversion = { ...this.conversion, result: null, qr: null, error: null };
        this.update({
          pending: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    } finally {
      if (revision === this.previewRevision) this.previewController = null;
    }
  }
  select = (selected: number) => {
    if (
      this.closed ||
      this.snapshot.loading ||
      this.snapshot.downloading ||
      !Number.isInteger(selected) ||
      selected === this.snapshot.selected ||
      !this.getGrid(false)?.cells[selected]
    )
      return;
    if (this.snapshot.pending) {
      this.conversion = { ...this.conversion, selected };
      this.update({});
      if (!this.gridDraft) this.schedulePreview(0);
      return;
    }
    const pattern = this.conversion.result?.patterns[selected];
    if (pattern) {
      this.conversion = { ...this.conversion, selected, qr: animalCrossingQrPixels(pattern.bytes) };
      this.update({});
    }
  };
  async download() {
    const { result, name } = this.snapshot;
    if (
      this.closed ||
      !result ||
      this.snapshot.pending ||
      this.snapshot.loading ||
      this.snapshot.downloading
    )
      return;
    const fileId = this.snapshot.identity;
    this.update({ downloading: true, error: null });
    try {
      await this.port.save(result, `${name.replace(/\.[^.]+$/, "")}-animal-crossing.zip`);
      this.telemetry.handedOff(fileId, ToolOutputFormat.Zip);
    } catch (reason) {
      this.telemetry.failed(ToolOperation.Export, ToolFailureCategory.Handoff, reason);
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      this.update({ downloading: false });
    }
  }
  async downloadQr() {
    const { qr, result, selected } = this.snapshot;
    const pattern = result?.patterns[selected];
    if (
      this.closed ||
      !qr ||
      !pattern ||
      this.snapshot.pending ||
      this.snapshot.loading ||
      this.snapshot.downloading
    )
      return;
    const fileId = this.snapshot.identity;
    this.update({ downloading: true, error: null });
    try {
      await this.port.saveQr(qr, `r${pattern.row + 1}-c${pattern.column + 1}-qr.png`);
      this.telemetry.handedOff(fileId, ToolOutputFormat.Png);
    } catch (reason) {
      this.telemetry.failed(ToolOperation.Export, ToolFailureCategory.Handoff, reason);
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      this.update({ downloading: false });
    }
  }
  async openExample() {
    if (this.closed || this.snapshot.downloading) return;
    const request = this.request;
    try {
      const file = await this.port.example();
      if (this.closed || request !== this.request) return;
      const opened = await this.openFile(file, ToolOpenSource.Example, true);
      if (opened && !this.closed && this.snapshot.source && !this.snapshot.error) {
        this.update({ example: true });
        this.changeSettings({ title: EXAMPLE_TITLE, creator: EXAMPLE_CREATOR, town: "Bywater" });
        this.generate();
      }
    } catch (reason) {
      if (!this.closed && request === this.request) {
        this.telemetry.failed(ToolOperation.Open, ToolFailureCategory.ExampleFetch, reason);
        this.update({ error: reason instanceof Error ? reason.message : String(reason) });
      }
    }
  }
  /** Return to the empty import step without disposing the page manager. */
  clear() {
    if (this.closed) return;
    this.cancelPreview();
    if (this.conversion.source) this.port.releasePreview(this.conversion.source);
    this.request++;
    this.project = undefined;
    this.gridDraft = null;
    this.tileDraft = defaultAnimalCrossingSettings(INITIAL_SIZE);
    this.conversion = {
      source: null,
      settings: defaultAnimalCrossingSettings(INITIAL_SIZE),
      importedQr: false,
      result: null,
      selected: 0,
      qr: null,
      error: null,
    };
    this.update({
      name: "",
      example: false,
      previewOpen: false,
      layout: AnimalCrossingLayout.Single,
      loading: false,
      downloading: false,
      error: null,
      identity: this.state.identity + 1,
      frame: 0,
      frameCount: 1,
      pending: false,
    });
  }
  dispose() {
    this.closed = true;
    this.cancelPreview();
    if (this.conversion.source) this.port.releasePreview(this.conversion.source);
    this.ground.dispose();
    this.request++;
    this.listeners.clear();
  }
}
