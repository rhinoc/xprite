import type { NormalMapPort } from "$/managers/ports/normal-map";
import { ToolFailureCategory } from "$/managers/ports/telemetry";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import {
  ToolTelemetry,
  ToolOpenSource,
  ToolOperation,
  ToolOutputFormat,
} from "$/managers/telemetry/tool-telemetry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  createNormalMapGenerator,
  defaultNormalMapLightOptions,
  defaultNormalMapOptions,
  NORMAL_MAP_LIMITS,
  normalizeNormalMapOptions,
  NormalMapPreset,
  prepareNormalMapLighting,
  renderPreparedNormalMapLighting,
  type NormalMapLightOptions,
  type NormalMapOptions,
} from "@xprite/editor-core/image-editing";
import { AppearanceMode } from "@xprite/editor-ui/appearance";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";

export { NORMAL_MAP_LIMITS, NormalMapPreset } from "@xprite/editor-core/image-editing";

export enum NormalMapStatus {
  Empty = "empty",
  Loading = "loading",
  Ready = "ready",
}

export interface NormalMapSnapshot {
  identity: number;
  status: NormalMapStatus;
  appearanceMode: AppearanceMode;
  name: string;
  sourceWidth: number;
  sourceHeight: number;
  options: NormalMapOptions;
  settingsRevision: number;
  pixels: PixelBuffer | null;
  light: NormalMapLightOptions;
  lightPixels: PixelBuffer | null;
  lightError: string | null;
  error: string | null;
  downloading: boolean;
  openingEditor: boolean;
}

const IMAGE_FILENAME = /\.(?:png|jpe?g|webp)$/i;

const initialSnapshot = (): NormalMapSnapshot => ({
  identity: 0,
  status: NormalMapStatus.Empty,
  appearanceMode: AppearanceMode.Light,
  name: "",
  sourceWidth: 0,
  sourceHeight: 0,
  options: defaultNormalMapOptions(),
  settingsRevision: 0,
  pixels: null,
  light: defaultNormalMapLightOptions(1, 1),
  lightPixels: null,
  lightError: null,
  error: null,
  downloading: false,
  openingEditor: false,
});

/** Owns one loaded image and its normal-map options; never touches editor persistence. */
export class NormalMapManager {
  readonly viewport: ToolViewport;
  readonly lightViewport: ToolViewport;
  private snapshot = initialSnapshot();
  private source: PixelBuffer | null = null;
  private generator: ReturnType<typeof createNormalMapGenerator> | null = null;
  private result: PixelBuffer | null = null;
  private prepared: ReturnType<typeof prepareNormalMapLighting> | null = null;
  private request = 0;
  private closed = false;
  private listeners = new Set<() => void>();
  private readonly telemetry: ToolTelemetry;
  private stopAppearance: () => void;
  constructor(
    private readonly port: NormalMapPort,
    telemetry?: SiteTelemetryPort,
  ) {
    this.telemetry = new ToolTelemetry(telemetry);
    this.viewport = new ToolViewport(port.readWheel);
    this.lightViewport = new ToolViewport(port.readWheel);
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
  private update(patch: Partial<NormalMapSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  async open(file: File, source = ToolOpenSource.File) {
    if (this.closed) return;
    const request = ++this.request;
    this.update({ status: NormalMapStatus.Loading, error: null, downloading: false });
    let failureCategory = ToolFailureCategory.UnsupportedFormat;
    try {
      if (!IMAGE_FILENAME.test(file.name) && !file.type.startsWith("image/"))
        throw new Error("Choose a PNG, JPEG or WebP image.");
      failureCategory = ToolFailureCategory.Decode;
      const pixels = await this.port.read(file);
      if (this.closed || request !== this.request) return;
      failureCategory = ToolFailureCategory.Preview;
      this.source = pixels;
      this.generator = createNormalMapGenerator(pixels);
      this.update({
        identity: request,
        status: NormalMapStatus.Ready,
        name: file.name,
        sourceWidth: pixels.width,
        sourceHeight: pixels.height,
        options: defaultNormalMapOptions(),
        light: defaultNormalMapLightOptions(pixels.width, pixels.height),
      });
      if (this.render()) this.telemetry.opened(request, file, source);
      else this.telemetry.failed(ToolOperation.Open, ToolFailureCategory.Preview);
    } catch (reason) {
      if (!this.closed && request === this.request) {
        this.telemetry.failed(ToolOperation.Open, failureCategory, reason);
        this.update({
          status: this.source ? NormalMapStatus.Ready : NormalMapStatus.Empty,
          error: reason instanceof Error ? reason.message : "This image could not be opened.",
        });
      }
    }
  }
  async openExample() {
    if (this.closed) return;
    const request = ++this.request;
    this.update({ status: NormalMapStatus.Loading, error: null });
    try {
      const file = await this.port.example();
      if (!this.closed && request === this.request) await this.open(file, ToolOpenSource.Example);
    } catch (reason) {
      if (!this.closed && request === this.request) {
        this.telemetry.failed(ToolOperation.Open, ToolFailureCategory.ExampleFetch, reason);
        this.update({
          status: this.source ? NormalMapStatus.Ready : NormalMapStatus.Empty,
          error: reason instanceof Error ? reason.message : "The example could not be loaded.",
        });
      }
    }
  }
  selectPreset(preset: NormalMapPreset) {
    if (!this.source || this.snapshot.status !== NormalMapStatus.Ready) return;
    const current = this.snapshot.options;
    this.update({
      options: {
        ...defaultNormalMapOptions(preset),
        invertY: current.invertY,
        paintedLightAngle: current.paintedLightAngle,
        paintedLightInfluence: current.paintedLightInfluence,
      },
      settingsRevision: this.snapshot.settingsRevision + 1,
      error: null,
    });
    this.render();
  }
  changeOptions(patch: Partial<NormalMapOptions>) {
    if (!this.source || this.snapshot.status !== NormalMapStatus.Ready) return;
    const options = normalizeNormalMapOptions({ ...this.snapshot.options, ...patch });
    const settingsRevision = this.snapshot.settingsRevision + 1;
    if (
      options.normalStrength > NORMAL_MAP_LIMITS.normalStrength ||
      options.shapeStrength > NORMAL_MAP_LIMITS.shapeStrength
    ) {
      this.update({ settingsRevision, error: "Strength is out of range." });
      return;
    }
    this.update({ options, settingsRevision, error: null });
    this.render();
  }
  private render() {
    if (!this.generator) return false;
    try {
      this.result = this.generator.generate(this.snapshot.options);
      this.prepared =
        this.source && this.result ? prepareNormalMapLighting(this.source, this.result) : null;
      const light = {
        ...this.snapshot.light,
        invertY: this.snapshot.options.invertY,
        delight:
          this.snapshot.options.paintedLightInfluence > 0
            ? {
                angle: this.snapshot.options.paintedLightAngle,
                influence: this.snapshot.options.paintedLightInfluence,
              }
            : undefined,
      };
      const lightPixels = this.prepared
        ? renderPreparedNormalMapLighting(this.prepared, light)
        : null;
      this.update({ pixels: this.result, light, lightPixels, lightError: null, error: null });
      return true;
    } catch (reason) {
      this.result = null;
      this.prepared = null;
      this.update({
        pixels: null,
        lightPixels: null,
        lightError: null,
        error: reason instanceof Error ? reason.message : "The normal map could not be generated.",
      });
      return false;
    }
  }
  /** Re-render the lighting preview after a light parameter change. */
  private relight(patch: Partial<NormalMapLightOptions>) {
    if (!this.prepared || this.snapshot.status !== NormalMapStatus.Ready) return;
    const light = {
      ...this.snapshot.light,
      ...patch,
      invertY: this.snapshot.options.invertY,
      delight:
        this.snapshot.options.paintedLightInfluence > 0
          ? {
              angle: this.snapshot.options.paintedLightAngle,
              influence: this.snapshot.options.paintedLightInfluence,
            }
          : undefined,
    };
    try {
      const lightPixels = renderPreparedNormalMapLighting(this.prepared, light);
      this.update({ light, lightPixels, lightError: null });
    } catch (reason) {
      this.update({
        light,
        lightPixels: null,
        lightError:
          reason instanceof Error ? reason.message : "The lighting preview could not be rendered.",
      });
    }
  }
  moveLight(x: number, y: number) {
    this.relight({ position: { x, y } });
  }
  changeLight(patch: Partial<NormalMapLightOptions>) {
    this.relight(patch);
  }
  async download() {
    if (
      this.closed ||
      !this.result ||
      this.snapshot.status !== NormalMapStatus.Ready ||
      this.snapshot.downloading
    )
      return;
    const request = this.request;
    const fileId = this.snapshot.identity;
    const result = this.result;
    const base = this.snapshot.name.replace(IMAGE_FILENAME, "");
    this.update({ downloading: true, error: null });
    try {
      await this.port.savePng(result, `${base}-normal.png`);
      this.telemetry.handedOff(fileId, ToolOutputFormat.Png);
    } catch (reason) {
      this.telemetry.failed(ToolOperation.Export, ToolFailureCategory.Handoff, reason);
      if (!this.closed && request === this.request)
        this.update({
          error: reason instanceof Error ? reason.message : "The download failed. Try again.",
        });
    } finally {
      if (!this.closed && request === this.request) this.update({ downloading: false });
    }
  }
  /** Return to the empty import step without disposing the page manager. */
  clear() {
    if (this.closed) return;
    this.request++;
    this.source = null;
    this.generator = null;
    this.result = null;
    this.prepared = null;
    this.update({
      ...initialSnapshot(),
      appearanceMode: this.snapshot.appearanceMode,
    });
  }
  /** Opens the generated normal map in the editor as a new project. */
  async openEditor() {
    if (this.closed || !this.result || this.snapshot.openingEditor) return;
    this.update({ openingEditor: true, error: null });
    try {
      const base = this.snapshot.name.replace(IMAGE_FILENAME, "");
      await this.port.edit(this.result, `${base}-normal.png`);
    } catch {
      this.update({ error: "The editor could not be opened. Please try again." });
    } finally {
      this.update({ openingEditor: false });
    }
  }
  dispose() {
    this.closed = true;
    this.request++;
    this.source = null;
    this.generator = null;
    this.result = null;
    this.prepared = null;
    this.listeners.clear();
    this.stopAppearance();
  }
}
