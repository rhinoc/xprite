import type { PixelBuffer, Rgba } from "$/base/primitives";
import { manualPixelGrid, MAX_GRID_CELL_SIZE } from "$/import-export/image/import/grid";
import {
  DEFAULT_LINE_GUIDE,
  DEFAULT_OUTLINE_PREPASS,
  readOutlinePrepass,
} from "$/import-export/image/import/outline-prepass";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelationMethod,
  PixelationMode,
  type PixelGridAnalysis,
  type PixelationSettings,
  type PixelateOptions,
} from "$/import-export/image/import/types";

export const MAX_PIXELATION_SIZE = 512;
export const PIXELATION_SIZES = [16, 32, 64, 128, 256, MAX_PIXELATION_SIZE] as const;
export const PIXELATION_METHOD_OPTIONS = [
  { value: PixelationMethod.Structure, label: "Preserve edges" },
  { value: PixelationMethod.Dominant, label: "Dominant colors" },
  { value: PixelationMethod.MostFrequent, label: "Most frequent color" },
  { value: PixelationMethod.Box, label: "Box average" },
  { value: PixelationMethod.Nearest, label: "Nearest-neighbor" },
] as const;
const DEFAULT_PIXELATION_SIZE = 64;
const DEFAULT_COLORS = 16;
const MAX_COLORS = 256;
export function defaultPixelationSettings(
  image: Pick<PixelBuffer, "width" | "height">,
  grid?: PixelGridAnalysis,
): PixelationSettings {
  const scale = Math.min(1, DEFAULT_PIXELATION_SIZE / Math.max(image.width, image.height));
  const mode = grid?.reliable ? PixelationMode.RecoverGrid : PixelationMode.Convert;
  // Recover Grid opens on PixelOE + lines with Median and Limit colors (16). Convert opens on
  // PixelOE + lines with Contrast and no color limit. Both use PixelOE's outline pre-pass.
  return {
    mode,
    reduceColors: mode === PixelationMode.RecoverGrid,
    outlineStrength: 0,
    prepass: DEFAULT_OUTLINE_PREPASS,
    lineGuide: DEFAULT_LINE_GUIDE,
    colorPicker:
      mode === PixelationMode.RecoverGrid ? CellColorPicker.Median : CellColorPicker.Contrast,
    autoGrid: true,
    gridCellWidth: grid?.reliable ? grid.cellWidth : 8,
    gridCellHeight: grid?.reliable ? grid.cellHeight : 8,
    targetWidth: Math.max(1, Math.round(image.width * scale)),
    targetHeight: Math.max(1, Math.round(image.height * scale)),
    maxColors: DEFAULT_COLORS,
    method: PixelationMethod.Structure,
    blockPicker: false,
    preserveDimensions: false,
    removeNoise: false,
    lockAspectRatio: true,
    palette: null,
    paletteName: "",
  };
}
export function updatePixelationSettings(
  settings: PixelationSettings,
  patch: Partial<PixelationSettings>,
  image: Pick<PixelBuffer, "width" | "height">,
): PixelationSettings {
  const next = { ...settings, ...patch };
  // Settings saved before the pre-pass dropdown carry the old checkbox instead.
  next.prepass = readOutlinePrepass(patch) ?? readOutlinePrepass(settings) ?? OutlinePrepass.None;
  delete (next as { pixeloePrepass?: unknown }).pixeloePrepass;
  // Settings saved before Limit colors and Snap palette became one control: either one on means
  // Limit colors, counting Limit colors' own count if it was on, else Snap palette's.
  const legacy = { ...settings, ...patch } as { snapPalette?: unknown; snapColors?: unknown };
  if (legacy.snapPalette !== undefined || legacy.snapColors !== undefined) {
    if (legacy.snapPalette === true && !next.reduceColors) {
      next.reduceColors = true;
      if (typeof legacy.snapColors === "number") next.maxColors = legacy.snapColors;
    }
    delete (next as { snapPalette?: unknown }).snapPalette;
    delete (next as { snapColors?: unknown }).snapColors;
  }
  if (!Object.values(LineGuideMode).includes(next.lineGuide)) next.lineGuide = DEFAULT_LINE_GUIDE;
  // Turning a PixelOE pre-pass on starts from Contrast, PixelOE's own colour rule.
  if (
    settings.prepass === OutlinePrepass.None &&
    next.prepass !== OutlinePrepass.None &&
    patch.colorPicker === undefined
  )
    next.colorPicker = CellColorPicker.Contrast;
  if (patch.palette !== undefined) {
    if (patch.palette && (!patch.palette.length || patch.palette.length > MAX_COLORS))
      throw new RangeError("Choose a palette with 1 to 256 colors.");
    next.palette = patch.palette ? patch.palette.map((color) => [...color] as Rgba) : null;
    if (patch.palette === null) next.paletteName = "";
  }
  // Mode-switch defaults: Recover uses Median and limits colours; plain Convert limits only without a pre-pass.
  if (patch.mode !== undefined && patch.mode !== settings.mode) {
    if (patch.reduceColors === undefined) {
      if (patch.mode === PixelationMode.RecoverGrid) {
        next.reduceColors = true;
      } else {
        next.reduceColors = next.prepass === OutlinePrepass.None;
      }
    }
    if (patch.colorPicker === undefined && patch.mode === PixelationMode.RecoverGrid) {
      next.colorPicker = CellColorPicker.Median;
    }
  }
  const cellSize = (value: number) =>
    Number.isFinite(value) ? Math.max(1, Math.min(MAX_GRID_CELL_SIZE, value)) : 8;
  next.gridCellWidth = cellSize(next.gridCellWidth);
  next.gridCellHeight = cellSize(next.gridCellHeight);
  next.outlineStrength = Number.isFinite(next.outlineStrength)
    ? Math.max(0, Math.min(100, Math.round(next.outlineStrength)))
    : 0;
  const dimension = (value: number) =>
    Number.isFinite(value) ? Math.max(1, Math.min(MAX_PIXELATION_SIZE, Math.round(value))) : 1;
  next.targetWidth = dimension(next.targetWidth);
  next.targetHeight = dimension(next.targetHeight);
  if (next.lockAspectRatio) {
    const fromHeight = patch.targetHeight !== undefined && patch.targetWidth === undefined;
    const width = fromHeight ? (next.targetHeight * image.width) / image.height : next.targetWidth;
    const height = fromHeight ? next.targetHeight : (next.targetWidth * image.height) / image.width;
    const scale = Math.min(1, MAX_PIXELATION_SIZE / Math.max(width, height));
    next.targetWidth = dimension(width * scale);
    next.targetHeight = dimension(height * scale);
  }
  next.maxColors = Number.isFinite(next.maxColors)
    ? Math.max(2, Math.min(MAX_COLORS, Math.round(next.maxColors)))
    : DEFAULT_COLORS;
  return next;
}
export function pixelationSettingsOptions(
  settings: PixelationSettings,
  image?: Pick<PixelBuffer, "width" | "height">,
  detected?: PixelGridAnalysis,
): PixelateOptions {
  let grid;
  if (settings.mode === PixelationMode.RecoverGrid) {
    if (settings.autoGrid) {
      if (!detected?.reliable)
        throw new Error(
          "No consistent pixel grid was detected. Turn off Automatic grid and choose cell sizes.",
        );
      grid = detected;
    } else {
      if (!image) throw new Error("Open an image before choosing grid cells.");
      grid = manualPixelGrid(image, settings.gridCellWidth, settings.gridCellHeight);
    }
  }
  return {
    mode: settings.mode,
    grid,
    colorPicker: settings.colorPicker,
    outlineStrength: settings.mode === PixelationMode.Convert ? settings.outlineStrength : 0,
    prepass: settings.prepass,
    lineGuide: settings.lineGuide,
    targetWidth: settings.targetWidth,
    targetHeight: settings.targetHeight,
    // Limit colors: k-means to the colour count, or the loaded palette.
    paletteSnap: settings.reduceColors
      ? settings.palette
        ? { palette: settings.palette }
        : { colors: settings.maxColors }
      : undefined,
    method: settings.method,
    // A pre-pass hands its result to the colour rule, so the picker (not `method`) fills each block.
    blockPicker: settings.blockPicker || settings.prepass !== OutlinePrepass.None,
    preserveDimensions: settings.preserveDimensions,
    removeNoise: settings.removeNoise,
    alphaMode: "premultiplied",
  };
}

/**
 * What a detected grid means for the settings: a reliable one recovers it, anything else falls back
 * to the plain convert (resize). Shared by the import dialog and the tool pages.
 */
export function applyPixelationGrid(
  settings: PixelationSettings,
  grid: PixelGridAnalysis,
  image: Pick<PixelBuffer, "width" | "height">,
): PixelationSettings {
  return updatePixelationSettings(
    settings,
    grid.reliable
      ? {
          mode: PixelationMode.RecoverGrid,
          autoGrid: true,
          gridCellWidth: grid.cellWidth,
          gridCellHeight: grid.cellHeight,
        }
      : { mode: PixelationMode.Convert },
    image,
  );
}

/**
 * The output size for typing one dimension: the other follows the image's aspect ratio. Null when the
 * text is not a usable size.
 */
export function pixelationSizeFromAxis(
  axis: "width" | "height",
  value: string,
  image: Pick<PixelBuffer, "width" | "height">,
): { width: number; height: number } | null {
  const typed = Number.parseInt(value, 10);
  if (!Number.isFinite(typed) || typed < 1) return null;
  const { width, height } = image;
  return axis === "width"
    ? { width: typed, height: Math.max(1, Math.round((typed * height) / width)) }
    : { width: Math.max(1, Math.round((typed * width) / height)), height: typed };
}
