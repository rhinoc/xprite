import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { asepritePaletteColorIndex, stepAsepritePaletteIndex } from "$/color/palette-commands";
import { operatePalette, type PaletteOperation } from "$/color/palette-operations";
import { assertPaletteAllocation } from "$/color/palette-resize";
import { appendMissingPaletteColor } from "$/color/palette-warning";

export type PaletteColorTarget = "foreground" | "background";
export enum PaletteScope {
  Document = "document",
  System = "system",
}
export enum PaletteHistoryLabel {
  Set = "Set Palette",
  Change = "Color Change",
  Size = "Palette Size",
  Quantization = "Color Quantization",
}
export interface PaletteChangeOptions {
  label?: PaletteHistoryLabel;
  coalesce?: boolean;
  scope?: PaletteScope;
}
const PALETTE_REDRAW_INTERVAL_MS = 250;

export interface PaletteControllerPort {
  getPalette(): readonly Rgba[];
  getSystemPalette(): readonly Rgba[];
  getColor(target: PaletteColorTarget, scope?: PaletteScope): Rgba;
  setColor(target: PaletteColorTarget, color: Rgba, index?: number): void;
  commitPalette(
    colors: readonly Rgba[],
    options?: { label: PaletteHistoryLabel; mergePrevious: boolean; scope: PaletteScope },
  ): void;
  now?(): number;
}

interface PaletteColorChoice {
  index: number;
  palette: readonly Rgba[];
  color: Rgba;
}

/** Palette editing and palette-color navigation, with document commits injected by the editor. */
export class PaletteController {
  private choices: Partial<Record<PaletteColorTarget, PaletteColorChoice>> = {};
  private livePalette: readonly Rgba[] | null = null;
  private liveStarted = 0;
  private liveUpdated = 0;
  private systemOverride = false;
  get systemPalette(): readonly Rgba[] {
    return this.systemOverride ? this.port.getSystemPalette() : this.port.getPalette();
  }
  useDocumentPalette(): void {
    this.systemOverride = false;
  }
  useSystemPalette(): void {
    if (this.systemOverride) return;
    const colors = this.port.getPalette();
    this.systemOverride = true;
    if (colors.length)
      this.port.commitPalette(colors, {
        label: PaletteHistoryLabel.Set,
        mergePrevious: false,
        scope: PaletteScope.System,
      });
  }

  constructor(private readonly port: PaletteControllerPort) {}

  forgetChoice(target: PaletteColorTarget) {
    delete this.choices[target];
  }

  resetChoices() {
    this.choices = {};
    this.livePalette = null;
  }

  setPalette(colors: readonly Rgba[], options: PaletteChangeOptions = {}) {
    assertPaletteAllocation(colors.length);
    const next = colors.map((color) => [...color] as unknown as Rgba);
    const current =
      options.scope === PaletteScope.System ? this.systemPalette : this.port.getPalette();
    const now = this.port.now?.() ?? Date.now();
    const expires =
      this.liveStarted +
      (Math.floor((this.liveUpdated - this.liveStarted) / PALETTE_REDRAW_INTERVAL_MS) + 2) *
        PALETTE_REDRAW_INTERVAL_MS;
    const mergePrevious =
      options.coalesce === true && this.livePalette === current && now < expires;
    if (options.coalesce) {
      if (!mergePrevious) this.liveStarted = now;
      this.liveUpdated = now;
    } else this.livePalette = null;
    if (
      next.length === current.length &&
      next.every((color, index) =>
        color.every((channel, component) => channel === current[index][component]),
      )
    )
      return;
    if (options.scope === PaletteScope.System) this.systemOverride = true;
    this.port.commitPalette(next, {
      label: options.label ?? PaletteHistoryLabel.Set,
      mergePrevious,
      scope: options.scope ?? PaletteScope.Document,
    });
    if (options.coalesce) this.livePalette = this.port.getPalette();
  }

  /** Palette color stepping changes a tool color, never document history. */
  stepPaletteColor(
    target: PaletteColorTarget,
    step: number,
    scope = PaletteScope.Document,
  ): number | null {
    const colors = scope === PaletteScope.System ? this.systemPalette : this.port.getPalette();
    if (!colors.length || !Number.isFinite(step)) return null;
    const color = this.port.getColor(target, scope);
    const remembered = this.choices[target];
    const current =
      remembered?.palette === colors && remembered.color === color
        ? remembered.index
        : asepritePaletteColorIndex(colors, color);
    const index = stepAsepritePaletteIndex(current, step, colors.length)!;
    this.port.setColor(target, colors[index], index);
    this.choices[target] = { index, palette: colors, color: this.port.getColor(target, scope) };
    return index;
  }

  applyPaletteOperation(
    operation: PaletteOperation,
    ascending = true,
    selected: readonly number[] = [],
    options: PaletteChangeOptions = {},
  ) {
    this.setPalette(
      operatePalette(
        options.scope === PaletteScope.System ? this.systemPalette : this.port.getPalette(),
        operation,
        ascending,
        selected,
      ),
      options,
    );
  }

  /** Add one missing color and optionally select it as foreground in palette edit mode. */
  addPaletteColor(
    target: PaletteColorTarget,
    editMode = false,
    scope = PaletteScope.Document,
  ): {
    added: boolean;
    index: number;
    foregroundIndex?: number;
    backgroundIndex?: number;
  } {
    const color = this.port.getColor(target, scope);
    const result = appendMissingPaletteColor(
      scope === PaletteScope.System ? this.systemPalette : this.port.getPalette(),
      color,
    );
    if (!result.added) return { added: false, index: result.index };
    this.setPalette(
      result.palette.map((entry) => [entry[0], entry[1], entry[2], entry[3] ?? UINT8_MAX] as Rgba),
      { scope },
    );
    if (!editMode) return { added: true, index: result.index };
    this.port.setColor("foreground", color, result.index);
    return {
      added: true,
      index: result.index,
      foregroundIndex: result.index,
      ...(target === "background" ? { backgroundIndex: result.index } : {}),
    };
  }
}
