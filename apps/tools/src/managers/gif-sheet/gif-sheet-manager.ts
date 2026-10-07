import type { GifSheetPort } from "$/managers/ports/gif-sheet";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  defaultSpriteSheetOptions,
  rasterAnimationProject,
  renderSpriteSheet,
  SheetLayout,
  type SpriteSheetResult,
} from "@xprite/editor-core/import-export";
import { AppearanceMode } from "@xprite/editor-ui/appearance";

export { SheetLayout as GifSheetLayout } from "@xprite/editor-core/import-export";
export enum GifSheetStatus {
  Empty = "empty",
  Loading = "loading",
  Ready = "ready",
}
export enum GifSheetDownload {
  Png = "png",
  Json = "json",
}
export interface GifSheetSettings {
  layout: SheetLayout;
  count: number;
  borderPadding: number;
  shapePadding: number;
  powerOfTwo: boolean;
}
export interface GifSheetSnapshot {
  identity: number;
  status: GifSheetStatus;
  appearanceMode: AppearanceMode;
  name: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  settings: GifSheetSettings;
  settingsRevision: number;
  pixels: PixelBuffer | null;
  error: string | null;
  downloading: boolean;
}
const MIN_COUNT = 1;
const MAX_PADDING = 4096;
const GIF_FILENAME = /\.gif$/i;
const DEFAULT_SETTINGS: GifSheetSettings = {
  layout: SheetLayout.Rows,
  count: MIN_COUNT,
  borderPadding: 0,
  shapePadding: 0,
  powerOfTwo: false,
};
const initialSnapshot = (): GifSheetSnapshot => ({
  identity: 0,
  status: GifSheetStatus.Empty,
  appearanceMode: AppearanceMode.Light,
  name: "",
  frameWidth: 0,
  frameHeight: 0,
  frames: 0,
  settings: { ...DEFAULT_SETTINGS },
  settingsRevision: 0,
  pixels: null,
  error: null,
  downloading: false,
});

/** Conversion owns an isolated document and never touches editor workspace persistence. */
export class GifSheetManager {
  readonly viewport: ToolViewport;
  private snapshot = initialSnapshot();
  private document: EditorDocument | null = null;
  private result: SpriteSheetResult | null = null;
  private request = 0;
  private closed = false;
  private listeners = new Set<() => void>();
  private stopAppearance: () => void;
  constructor(private readonly port: GifSheetPort) {
    this.viewport = new ToolViewport(port.readWheel);
    this.snapshot.appearanceMode = port.readAppearance();
    this.stopAppearance = port.watchAppearance((appearanceMode) => this.update({ appearanceMode }));
  }
  getSnapshot = () => this.snapshot;
  getAppearanceMode = () => this.snapshot.appearanceMode;
  setAppearanceMode = (appearanceMode: AppearanceMode) => this.update({ appearanceMode });
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<GifSheetSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  async open(file: File) {
    const request = ++this.request;
    this.update({ status: GifSheetStatus.Loading, error: null, downloading: false });
    try {
      if (!GIF_FILENAME.test(file.name)) throw new Error("Choose a GIF file.");
      const animation = await this.port.read(file);
      if (this.closed || request !== this.request) return;
      const project = rasterAnimationProject(animation);
      this.document = {
        name: file.name,
        width: project.image.width,
        height: project.image.height,
        timeline: project.timeline,
        selection: null,
        layer: {
          name: "GIF",
          pixels: project.image,
          x: 0,
          y: 0,
          visible: true,
          locked: false,
        },
      };
      this.update({
        identity: request,
        status: GifSheetStatus.Ready,
        name: file.name,
        frameWidth: animation.width,
        frameHeight: animation.height,
        frames: animation.frames.length,
        settings: { ...DEFAULT_SETTINGS, count: Math.ceil(Math.sqrt(animation.frames.length)) },
      });
      this.render();
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({
          status: this.document ? GifSheetStatus.Ready : GifSheetStatus.Empty,
          error: reason instanceof Error ? reason.message : "This GIF could not be opened.",
        });
    }
  }
  async openExample() {
    const request = ++this.request;
    this.update({ status: GifSheetStatus.Loading, error: null });
    try {
      const file = await this.port.example();
      if (!this.closed && request === this.request) await this.open(file);
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({
          status: this.document ? GifSheetStatus.Ready : GifSheetStatus.Empty,
          error: reason instanceof Error ? reason.message : "The example could not be loaded.",
        });
    }
  }
  changeSettings(patch: Partial<GifSheetSettings>) {
    if (!this.document || this.snapshot.status !== GifSheetStatus.Ready) return;
    const settings = { ...this.snapshot.settings, ...patch };
    if (
      !Object.values(SheetLayout).includes(settings.layout) ||
      settings.layout === SheetLayout.Packed
    )
      return;
    const settingsRevision = this.snapshot.settingsRevision + MIN_COUNT;
    if (
      !Number.isInteger(settings.count) ||
      settings.count < MIN_COUNT ||
      settings.count > this.snapshot.frames
    ) {
      this.update({
        settingsRevision,
        error: `Choose a whole-number row or column count from 1 to ${this.snapshot.frames}.`,
      });
      return;
    }
    for (const padding of [settings.borderPadding, settings.shapePadding]) {
      if (!Number.isInteger(padding) || padding < 0 || padding > MAX_PADDING) {
        this.update({
          settingsRevision,
          error: `Padding and spacing must be whole numbers from 0 to ${MAX_PADDING}.`,
        });
        return;
      }
    }
    this.update({ settings, settingsRevision });
    this.render();
  }
  private render() {
    if (!this.document) return;
    try {
      const settings = this.snapshot.settings;
      const name = this.snapshot.name.replace(GIF_FILENAME, ".png");
      this.result = renderSpriteSheet(this.document, {
        ...defaultSpriteSheetOptions(this.document),
        name,
        layout: settings.layout,
        constraint:
          settings.layout === SheetLayout.Rows
            ? "columns"
            : settings.layout === SheetLayout.Columns
              ? "rows"
              : "none",
        constraintWidth: settings.count,
        constraintHeight: settings.count,
        borderPadding: settings.borderPadding,
        shapePadding: settings.shapePadding,
        powerOfTwo: settings.powerOfTwo,
        imageEnabled: true,
        dataEnabled: true,
        dataName: this.snapshot.name.replace(GIF_FILENAME, ".json"),
        dataFormat: "array",
        listLayers: false,
        listTags: false,
        listSlices: false,
        filenameFormat: "{title}-{frame}.png",
      });
      this.update({ pixels: this.result.pixels, error: null });
    } catch (reason) {
      this.result = null;
      this.update({
        pixels: null,
        error: reason instanceof Error ? reason.message : "This layout could not be generated.",
      });
    }
  }
  async download(format: GifSheetDownload) {
    if (!this.result || this.snapshot.status !== GifSheetStatus.Ready || this.snapshot.downloading)
      return;
    const request = this.request;
    const result = this.result;
    const base = this.snapshot.name.replace(GIF_FILENAME, "");
    this.update({ downloading: true, error: null });
    try {
      if (format === GifSheetDownload.Png) await this.port.savePng(result.pixels, `${base}.png`);
      else await this.port.saveJson(JSON.stringify(result.data, null, 2), `${base}.json`);
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({
          error: reason instanceof Error ? reason.message : "The download failed. Try again.",
        });
    } finally {
      if (!this.closed && request === this.request) this.update({ downloading: false });
    }
  }
  dispose() {
    this.closed = true;
    this.request++;
    this.document = null;
    this.result = null;
    this.listeners.clear();
    this.stopAppearance();
  }
}
