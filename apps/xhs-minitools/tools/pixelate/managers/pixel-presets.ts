import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  defaultPixelationSettings,
  PixelationMode,
  updatePixelationSettings,
  type PixelGridAnalysis,
  type PixelationSettings,
} from "@xprite/pixelate";

export enum PixelPreset {
  /** The engine's own defaults for this photo. */
  Default = "default",
  /** Finer: about 1.5× the blocks. */
  Clear = "clear",
  /** Chunky: about 0.6× the blocks, 16 colours. */
  Retro = "retro",
  /** The default blocks with 8 colours. */
  FewColors = "few-colors",
}

export const PIXEL_PRESETS = [
  PixelPreset.Default,
  PixelPreset.Clear,
  PixelPreset.Retro,
  PixelPreset.FewColors,
] as const;

const PRESETS: Readonly<Record<PixelPreset, { scale: number; colors: number | null }>> = {
  [PixelPreset.Default]: { scale: 1, colors: null },
  [PixelPreset.Clear]: { scale: 1.5, colors: null },
  [PixelPreset.Retro]: { scale: 0.6, colors: 16 },
  [PixelPreset.FewColors]: { scale: 1, colors: 8 },
};

/** The block-count slider runs over the longer side. */
export const SIZE_MIN = 16;
export const SIZE_MAX = 128;

export interface GridSize {
  width: number;
  height: number;
}

/** The blocks the settings produce: the recovered grid, else the convert target. */
export function outputGrid(
  settings: Readonly<PixelationSettings>,
  grid: PixelGridAnalysis | null | undefined,
): GridSize {
  return settings.mode === PixelationMode.RecoverGrid && grid?.reliable
    ? { width: grid.width, height: grid.height }
    : { width: settings.targetWidth, height: settings.targetHeight };
}

export function longSide(size: GridSize) {
  return Math.max(size.width, size.height);
}

/** Blocks for a longer side of `long`, keeping the photo's proportions. */
export function gridForLongSide(source: GridSize, long: number): GridSize {
  const value = Math.max(1, Math.round(long));
  return source.width >= source.height
    ? { width: value, height: Math.max(1, Math.round((value * source.height) / source.width)) }
    : { width: Math.max(1, Math.round((value * source.width) / source.height)), height: value };
}

/** Settings patch that sets the convert size from the longer side. */
export function sizePatch(source: GridSize, long: number): Partial<PixelationSettings> {
  const value = Math.max(1, Math.round(long));
  return source.width >= source.height ? { targetWidth: value } : { targetHeight: value };
}

export interface PresetPlan {
  settings: PixelationSettings;
  /**
   * Blocks to apply with a custom-size grid afterwards: a recovered grid cannot change its block
   * count through the convert target.
   */
  customGrid: GridSize | null;
}

/** The settings for a preset, starting from the engine defaults for this photo and its grid. */
export function presetPlan(
  preset: PixelPreset,
  source: Pick<PixelBuffer, "width" | "height">,
  grid: PixelGridAnalysis | null,
): PresetPlan {
  const { scale, colors } = PRESETS[preset];
  const base = defaultPixelationSettings(source, grid ?? undefined);
  const baseGrid = outputGrid(base, grid);
  const patch: Partial<PixelationSettings> =
    colors === null ? {} : { reduceColors: true, maxColors: colors };
  let customGrid: GridSize | null = null;
  if (scale !== 1) {
    const long = Math.round(longSide(baseGrid) * scale);
    if (base.mode === PixelationMode.RecoverGrid) customGrid = gridForLongSide(baseGrid, long);
    else Object.assign(patch, sizePatch(source, long));
  }
  return { settings: updatePixelationSettings(base, patch, source), customGrid };
}

/** What a preset's thumbnail badge shows: its block columns, or its colour count. */
export function presetBadge(
  preset: PixelPreset,
  defaultGrid: GridSize,
): { columns: number } | { colors: number } {
  const { scale, colors } = PRESETS[preset];
  if (preset === PixelPreset.FewColors && colors !== null) return { colors };
  return { columns: gridForLongSide(defaultGrid, longSide(defaultGrid) * scale).width };
}
