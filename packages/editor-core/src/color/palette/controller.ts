import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { asepritePaletteColorIndex, stepAsepritePaletteIndex } from "$/color/palette-commands";
import { operatePalette, type PaletteOperation } from "$/color/palette-operations";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";
import { appendMissingPaletteColor } from "$/color/palette-warning";

export type PaletteColorTarget = "foreground" | "background";

export interface PaletteControllerPort {
  getPalette(): readonly Rgba[];
  getColor(target: PaletteColorTarget): Rgba;
  setColor(target: PaletteColorTarget, color: Rgba): void;
  commitPalette(colors: readonly Rgba[]): void;
}

interface PaletteColorChoice {
  index: number;
  palette: readonly Rgba[];
  color: Rgba;
}

/** Palette editing and palette-color navigation, with document commits injected by the editor. */
export class PaletteController {
  private choices: Partial<Record<PaletteColorTarget, PaletteColorChoice>> = {};

  constructor(private readonly port: PaletteControllerPort) {}

  forgetChoice(target: PaletteColorTarget) {
    delete this.choices[target];
  }

  resetChoices() {
    this.choices = {};
  }

  setPalette(colors: readonly Rgba[]) {
    if (colors.length > MAX_PALETTE_COLORS)
      throw new RangeError(`Palette exceeds ${MAX_PALETTE_COLORS} colors`);
    const next = colors.map((color) => [...color] as unknown as Rgba);
    const current = this.port.getPalette();
    if (
      next.length === current.length &&
      next.every((color, index) =>
        color.every((channel, component) => channel === current[index][component]),
      )
    )
      return;
    this.port.commitPalette(next);
  }

  /** Palette color stepping changes a tool color, never document history. */
  stepPaletteColor(target: PaletteColorTarget, step: number): number | null {
    const colors = this.port.getPalette();
    if (!colors.length || !Number.isFinite(step)) return null;
    const color = this.port.getColor(target);
    const remembered = this.choices[target];
    const current =
      remembered?.palette === colors && remembered.color === color
        ? remembered.index
        : asepritePaletteColorIndex(colors, color);
    const index = stepAsepritePaletteIndex(current, step, colors.length)!;
    this.port.setColor(target, colors[index]);
    this.choices[target] = { index, palette: colors, color: this.port.getColor(target) };
    return index;
  }

  applyPaletteOperation(
    operation: PaletteOperation,
    ascending = true,
    selected: readonly number[] = [],
  ) {
    this.setPalette(operatePalette(this.port.getPalette(), operation, ascending, selected));
  }

  /** Add one missing color and optionally select it as foreground in palette edit mode. */
  addPaletteColor(
    target: PaletteColorTarget,
    editMode = false,
  ): {
    added: boolean;
    index: number;
    foregroundIndex?: number;
    backgroundIndex?: number;
  } {
    const color = this.port.getColor(target);
    const result = appendMissingPaletteColor(this.port.getPalette(), color);
    if (!result.added) return { added: false, index: result.index };
    this.setPalette(
      result.palette.map((entry) => [entry[0], entry[1], entry[2], entry[3] ?? UINT8_MAX] as Rgba),
    );
    if (!editMode) return { added: true, index: result.index };
    this.port.setColor("foreground", color);
    return {
      added: true,
      index: result.index,
      foregroundIndex: result.index,
      ...(target === "background" ? { backgroundIndex: result.index } : {}),
    };
  }
}
