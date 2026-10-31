import type { PixelationPort } from "$/managers/ports/pixelation";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { PaletteBrowserChoice } from "@xprite/editor-ui/palette/model";
import {
  PixelationAlgorithm,
  PixelationMode,
  applyPixelationGrid,
  defaultPixelationSettings,
  extractPixelationPalette,
  OutlinePrepass,
  updatePixelationSettings,
  pixelationSettingsOptions,
  type PixelationSettings,
  type PixelationSize,
  type PixelGridAnalysis,
} from "@xprite/pixelate";

/**
 * A recovered grid without a pre-pass restores the source's own pixels; any outline pre-pass
 * (including stock PixelOE on Custom size's blocks) draws new ones.
 */
export function restoresPixels(state: Pick<PixelationSnapshot, "settings">) {
  return (
    state.settings.mode === PixelationMode.RecoverGrid &&
    state.settings.prepass === OutlinePrepass.None
  );
}

export interface PixelationSnapshot {
  paletteChoices: readonly PaletteBrowserChoice[];
  /**
   * The automatic palette (colours picked from the result) at the current settings, also while a
   * preset is loaded; empty while unknown.
   */
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
  /** The image and settings (palette aside) `palettePreview` was picked at. */
  private automaticKey = "";
  /**
   * When `?palette=` resolves to a bundled preset, keep selecting it on each open until the user
   * picks another palette (or Automatic).
   */
  private preferredPalette: { colors: Rgba[]; name: string } | null = null;
  constructor(
    private readonly port: PixelationPort,
    options?: { paletteSlug?: string | null },
  ) {
    this.navigation = new ToolViewport(port.readWheel);
    this.refreshPalettes();
    this.applyPaletteSlug(options?.paletteSlug ?? null);
  }
  /** Match a catalog / deep-link slug to a loaded choice (`wplace` or `builtin:wplace`). */
  private applyPaletteSlug(slug: string | null) {
    if (!slug) return;
    const normalized = slug
      .trim()
      .toLowerCase()
      .replace(/^builtin:/, "");
    if (!normalized) return;
    const choice = this.state.paletteChoices.find((entry) => {
      const id = entry.id.toLowerCase();
      return id === normalized || id === `builtin:${normalized}`;
    });
    if (!choice?.colors.length) return;
    this.preferredPalette = {
      colors: choice.colors.map((color) => [...color] as Rgba),
      name: choice.name,
    };
    this.state = {
      ...this.state,
      settings: this.withPreferredPalette(this.state.settings),
    };
  }
  private withPreferredPalette(settings: PixelationSettings): PixelationSettings {
    if (!this.preferredPalette) return settings;
    return {
      ...settings,
      palette: this.preferredPalette.colors.map((color) => [...color] as Rgba),
      paletteName: this.preferredPalette.name,
      reduceColors: true,
    };
  }
  private clearPreferredIfPaletteChanged(patch: Partial<PixelationSettings>) {
    if (patch.palette === undefined || !this.preferredPalette) return;
    if (patch.palette === null) {
      this.preferredPalette = null;
      return;
    }
    if (patch.paletteName !== undefined && patch.paletteName !== this.preferredPalette.name)
      this.preferredPalette = null;
  }
  refreshPalettes = () => {
    this.publish({ paletteChoices: this.port.paletteResources().choices });
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
  /** Leave the current image and show the opening state; returns the request it belongs to. */
  private startOpening() {
    const request = ++this.request;
    ++this.conversion;
    this.port.prepare();
    this.publish({ loading: true, converting: false, result: null, error: null });
    return request;
  }
  async open(file: File) {
    if (this.closed || this.state.downloading) return;
    await this.read(file, this.startOpening());
  }
  private async read(file: File, request: number) {
    if (this.closed || request !== this.request) return;
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
        settings: this.withPreferredPalette(defaultPixelationSettings(source, grid)),
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
  /**
   * The example downloads first: show it opening (and disable the open buttons) from the click on,
   * and open only the example asked for last.
   */
  async openExample() {
    if (this.closed || this.state.downloading) return;
    const request = this.startOpening();
    let file: File;
    try {
      file = await this.port.example();
    } catch (reason) {
      if (request === this.request)
        this.publish({
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      return;
    }
    await this.read(file, request);
  }
  changeSettings = (patch: Partial<PixelationSettings>) => {
    if (!this.state.source || this.closed || this.state.loading || this.state.downloading) return;
    this.clearPreferredIfPaletteChanged(patch);
    this.publish({
      settings: updatePixelationSettings(this.state.settings, patch, this.state.source),
      result: null,
    });
    void this.convert();
  };
  /**
   * Put back settings together with the algorithm and grid they were made with (an undo step or a
   * preset), then convert.
   */
  restore = (saved: Pick<PixelationSnapshot, "algorithm" | "grid" | "settings">) => {
    if (!this.state.source || this.closed || this.state.loading || this.state.downloading) return;
    // A grid detection still running would overwrite the restored grid.
    ++this.request;
    this.publish({
      algorithm: saved.algorithm,
      grid: saved.grid,
      settings: saved.settings,
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
      if (conversion === this.conversion) {
        // With a preset loaded the result shows the preset, so the automatic palette is the one
        // last picked at these same settings, or unknown if anything else has changed since.
        const palette = this.state.settings.palette;
        const automatic = { ...this.state.settings, palette: null, paletteName: "" };
        const key = JSON.stringify([this.state.identity, automatic]);
        let palettePreview: readonly Rgba[];
        if (palette) palettePreview = key === this.automaticKey ? this.state.palettePreview : [];
        else {
          palettePreview = extractPixelationPalette(result).map((entry) => entry.color);
          this.automaticKey = key;
        }
        this.publish({ result, converting: false, palettePreview });
      }
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
      settings: this.withPreferredPalette(defaultPixelationSettings({ width: 64, height: 64 })),
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
