import type { PixelationPort } from "$/managers/ports/pixelation";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  PixelationAlgorithm,
  PixelationMode,
  applyPixelationGrid,
  defaultPixelationSettings,
  extractPixelationPalette,
  runsStockPixeloe,
  updatePixelationSettings,
  pixelationSettingsOptions,
  type PixelationSettings,
  type PixelationSize,
  type PixelGridAnalysis,
} from "@xprite/editor-core/import-export";
import type { PaletteBrowserChoice } from "@xprite/editor-ui/palette/model";

/**
 * A recovered grid restores the source's own pixels; stock PixelOE (a PixelOE pre-pass with Contrast
 * on Custom size's blocks) draws new ones.
 */
export function restoresPixels(state: Pick<PixelationSnapshot, "settings" | "grid">) {
  return (
    state.settings.mode === PixelationMode.RecoverGrid &&
    !runsStockPixeloe(state.settings, state.grid ?? undefined)
  );
}

export interface PixelationSnapshot {
  paletteChoices: readonly PaletteBrowserChoice[];
  defaultPalette: readonly Rgba[];
  palettePreview: readonly Rgba[];
  /** The grid algorithm the import-dialog controls chose, and the grid it found. */
  algorithm: PixelationAlgorithm;
  grid: PixelGridAnalysis | null;
  source: PixelBuffer | null;
  /** Changes with every opened file, so the shared preview viewport refits for a new image. */
  identity: number;
  result: PixelBuffer | null;
  settings: Readonly<PixelationSettings>;
  name: string;
  loading: boolean;
  converting: boolean;
  downloading: boolean;
  error: string | null;
}
export class PixelationManager {
  /** One shared zoom and pan for the original and the result layers of the comparison. */
  readonly navigation: ToolViewport;
  private state: PixelationSnapshot = {
    paletteChoices: [],
    defaultPalette: [],
    palettePreview: [],
    algorithm: PixelationAlgorithm.Auto,
    grid: null,
    source: null,
    identity: 0,
    result: null,
    settings: defaultPixelationSettings({ width: 64, height: 64 }),
    name: "",
    loading: false,
    converting: false,
    downloading: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private request = 0;
  private conversion = 0;
  private closed = false;
  constructor(private readonly port: PixelationPort) {
    this.navigation = new ToolViewport(port.readWheel);
    this.refreshPalettes();
  }
  refreshPalettes = () => {
    const resources = this.port.paletteResources();
    this.publish({ paletteChoices: resources.choices, defaultPalette: resources.defaultPalette });
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<PixelationSnapshot>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async open(file: File) {
    if (this.closed || this.state.downloading) return;
    const request = ++this.request;
    ++this.conversion;
    this.publish({ loading: true, converting: false, result: null, error: null });
    try {
      const source = await this.port.read(file);
      if (this.closed || request !== this.request) return;
      const grid = await this.port.detectGrid(source);
      if (this.closed || request !== this.request) return;
      this.publish({
        source,
        identity: this.state.identity + 1,
        algorithm: PixelationAlgorithm.Auto,
        grid,
        name: file.name,
        settings: defaultPixelationSettings(source, grid),
        loading: false,
      });
      await this.convert();
    } catch (reason) {
      if (request === this.request)
        this.publish({
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    }
  }
  async openExample() {
    try {
      await this.open(await this.port.example());
    } catch (reason) {
      this.publish({ error: String(reason) });
    }
  }
  changeSettings = (patch: Partial<PixelationSettings>) => {
    if (!this.state.source || this.closed || this.state.loading || this.state.downloading) return;
    this.publish({
      settings: updatePixelationSettings(this.state.settings, patch, this.state.source),
      result: null,
    });
    void this.convert();
  };
  /**
   * Find pixels the way the import dialog does: detect with the chosen algorithm, recover a reliable
   * grid, otherwise fall back to the plain convert.
   */
  changeAlgorithm = async (algorithm: PixelationAlgorithm, size?: PixelationSize) => {
    const source = this.state.source;
    if (!source || this.closed || this.state.loading || this.state.downloading) return;
    const request = ++this.request;
    const conversion = ++this.conversion;
    this.publish({ algorithm, converting: true, result: null, error: null });
    try {
      const grid = await this.port.detectGrid(source, algorithm, size);
      if (this.closed || request !== this.request) return;
      this.publish({
        grid,
        settings: applyPixelationGrid(this.state.settings, grid, source),
      });
      await this.convert();
    } catch (reason) {
      if (conversion === this.conversion || request === this.request)
        this.publish({
          converting: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    }
  };
  private async convert() {
    const source = this.state.source;
    if (!source || this.closed) return;
    const conversion = ++this.conversion;
    this.publish({ converting: true, error: null });
    try {
      const options = pixelationSettingsOptions(
        this.state.settings,
        source,
        this.state.grid ?? undefined,
      );
      const result = await this.port.convert(source, options);
      if (conversion === this.conversion)
        this.publish({
          result,
          converting: false,
          palettePreview:
            this.state.settings.reduceColors && this.state.settings.palette
              ? this.state.settings.palette
              : extractPixelationPalette(result).map((entry) => entry.color),
        });
    } catch (reason) {
      if (conversion === this.conversion)
        this.publish({
          converting: false,
          result: null,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    }
  }
  private outputName() {
    return `${this.state.name.replace(/\.[^.]+$/, "")}-${restoresPixels(this.state) ? "restored" : "pixelated"}.png`;
  }
  async download() {
    await this.output(false);
  }
  async edit() {
    await this.output(true);
  }
  private async output(edit: boolean) {
    if (
      !this.state.result ||
      this.state.converting ||
      this.state.loading ||
      this.state.downloading ||
      this.closed
    )
      return;
    const pixels = this.state.result,
      name = this.outputName();
    this.publish({ downloading: true, error: null });
    try {
      if (edit)
        await this.port.edit(
          pixels,
          name,
          this.state.settings.reduceColors && this.state.settings.palette
            ? this.state.settings.palette
            : undefined,
        );
      else await this.port.save(pixels, name);
    } catch (reason) {
      this.publish({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      this.publish({ downloading: false });
    }
  }
  /** Return to the empty import step without disposing the page manager. */
  clear() {
    if (this.closed) return;
    ++this.request;
    ++this.conversion;
    this.publish({
      algorithm: PixelationAlgorithm.Auto,
      grid: null,
      source: null,
      result: null,
      settings: defaultPixelationSettings({ width: 64, height: 64 }),
      name: "",
      loading: false,
      converting: false,
      downloading: false,
      error: null,
      palettePreview: [],
    });
  }
  dispose() {
    this.closed = true;
    ++this.request;
    ++this.conversion;
    this.port.dispose();
    this.listeners.clear();
  }
}
