export enum CheckerboardSize {
  Size16 = "16x16",
  Size8 = "8x8",
  Size4 = "4x4",
  Size2 = "2x2",
  Size1 = "1x1",
  Custom = "custom",
}

export enum CanvasDisplaySection {
  Background = "Background",
  Grid = "Grid",
}

export type CanvasDisplayColorKey =
  | "checkerboardColor1"
  | "checkerboardColor2"
  | "gridColor"
  | "pixelGridColor";

const BACKGROUND_PREFERENCE_KEYS = [
  "checkerboardSize",
  "checkerboardCustomWidth",
  "checkerboardCustomHeight",
  "checkerboardZoom",
  "checkerboardColor1",
  "checkerboardColor2",
] as const;
const GRID_PREFERENCE_KEYS = [
  "gridColor",
  "gridOpacity",
  "gridAutoOpacity",
  "pixelGridColor",
  "pixelGridOpacity",
  "pixelGridAutoOpacity",
] as const;

/** Reset just this page. Active documents inherit the current new-document defaults. */
export function resetCanvasDisplaySection(
  current: CanvasDisplayPreferences,
  defaults: CanvasDisplayPreferences,
  section: CanvasDisplaySection,
): CanvasDisplayPreferences {
  const keys =
    section === CanvasDisplaySection.Background ? BACKGROUND_PREFERENCE_KEYS : GRID_PREFERENCE_KEYS;
  return { ...current, ...Object.fromEntries(keys.map((key) => [key, defaults[key]])) };
}

export interface CanvasDisplayPreferences {
  checkerboardSize: CheckerboardSize;
  checkerboardCustomWidth: number;
  checkerboardCustomHeight: number;
  checkerboardZoom: boolean;
  checkerboardColor1: string;
  checkerboardColor2: string;
  gridColor: string;
  gridOpacity: number;
  gridAutoOpacity: boolean;
  pixelGridColor: string;
  pixelGridOpacity: number;
  pixelGridAutoOpacity: boolean;
}

export const DEFAULT_CANVAS_DISPLAY_PREFERENCES: Readonly<CanvasDisplayPreferences> = {
  checkerboardSize: CheckerboardSize.Size16,
  checkerboardCustomWidth: 16,
  checkerboardCustomHeight: 16,
  checkerboardZoom: true,
  checkerboardColor1: "#808080ff",
  checkerboardColor2: "#c0c0c0ff",
  gridColor: "#0000ffff",
  gridOpacity: 160,
  gridAutoOpacity: true,
  pixelGridColor: "#c8c8c8ff",
  pixelGridOpacity: 160,
  pixelGridAutoOpacity: true,
};

const MAX_OPACITY = 255;
const MAX_CHECKERBOARD_CELL_SIZE = 512;
const MIN_CHECKERBOARD_CELL_SIZE = 1;
const CHECKERBOARD_PRESET_SIZES: Partial<Record<CheckerboardSize, number>> = {
  [CheckerboardSize.Size16]: 16,
  [CheckerboardSize.Size8]: 8,
  [CheckerboardSize.Size4]: 4,
  [CheckerboardSize.Size2]: 2,
  [CheckerboardSize.Size1]: 1,
};

export function normalizeCanvasDisplayPreferences(value: unknown): CanvasDisplayPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const checkerboardSize = Object.values(CheckerboardSize).includes(
    saved.checkerboardSize as CheckerboardSize,
  )
    ? (saved.checkerboardSize as CheckerboardSize)
    : DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardSize;
  const checkerboardDimension = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(
          MIN_CHECKERBOARD_CELL_SIZE,
          Math.min(MAX_CHECKERBOARD_CELL_SIZE, Math.trunc(input)),
        )
      : fallback;
  const opacity = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(0, Math.min(MAX_OPACITY, Math.trunc(input)))
      : fallback;
  const boolean = (input: unknown, fallback: boolean) =>
    typeof input === "boolean" ? input : fallback;

  return {
    checkerboardSize,
    checkerboardCustomWidth: checkerboardDimension(
      saved.checkerboardCustomWidth,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardCustomWidth,
    ),
    checkerboardCustomHeight: checkerboardDimension(
      saved.checkerboardCustomHeight,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardCustomHeight,
    ),
    checkerboardZoom: boolean(
      saved.checkerboardZoom,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardZoom,
    ),
    checkerboardColor1: normalizeColor(
      saved.checkerboardColor1,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardColor1,
    ),
    checkerboardColor2: normalizeColor(
      saved.checkerboardColor2,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.checkerboardColor2,
    ),
    gridColor: normalizeColor(saved.gridColor, DEFAULT_CANVAS_DISPLAY_PREFERENCES.gridColor),
    gridOpacity: opacity(saved.gridOpacity, DEFAULT_CANVAS_DISPLAY_PREFERENCES.gridOpacity),
    gridAutoOpacity: boolean(
      saved.gridAutoOpacity,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.gridAutoOpacity,
    ),
    pixelGridColor: normalizeColor(
      saved.pixelGridColor,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.pixelGridColor,
    ),
    pixelGridOpacity: opacity(
      saved.pixelGridOpacity,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.pixelGridOpacity,
    ),
    pixelGridAutoOpacity: boolean(
      saved.pixelGridAutoOpacity,
      DEFAULT_CANVAS_DISPLAY_PREFERENCES.pixelGridAutoOpacity,
    ),
  };
}

export function checkerboardCellSize(preferences: CanvasDisplayPreferences) {
  const preset = CHECKERBOARD_PRESET_SIZES[preferences.checkerboardSize];
  return preset
    ? { width: preset, height: preset }
    : {
        width: preferences.checkerboardCustomWidth,
        height: preferences.checkerboardCustomHeight,
      };
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const digits = value.trim().replace(/^#/, "");
  if (/^[\da-f]{6}$/i.test(digits)) return `#${digits.toLowerCase()}ff`;
  if (/^[\da-f]{8}$/i.test(digits)) return `#${digits.toLowerCase()}`;
  return fallback;
}
