import { INT16_MAX, INT16_MIN, UINT16_MAX } from "@xprite/bedrock/common/numeric-constants";
import {
  DEFAULT_VIEW,
  evaluateSizeExpression,
  type DocumentViewOptions,
} from "@xprite/editor-core";

export interface GridBoundsPreferences {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GRID_BOUNDS_FIELDS = ["x", "y", "width", "height"] as const;
export const DEFAULT_GRID_BOUNDS_PREFERENCES: Readonly<GridBoundsPreferences> = {
  x: 0,
  y: 0,
  width: DEFAULT_VIEW.gridWidth,
  height: DEFAULT_VIEW.gridHeight,
};

export function gridBoundsPreferencesFromView(
  view: Pick<DocumentViewOptions, "gridX" | "gridY" | "gridWidth" | "gridHeight">,
): GridBoundsPreferences {
  return { x: view.gridX ?? 0, y: view.gridY ?? 0, width: view.gridWidth, height: view.gridHeight };
}

export function parseGridBoundsPreference(
  text: string,
  field: keyof GridBoundsPreferences,
): number | null {
  const value = evaluateSizeExpression(text);
  const offset = field === "x" || field === "y";
  return value !== null &&
    Number.isInteger(value) &&
    value >= (offset ? INT16_MIN : 1) &&
    value <= (offset ? INT16_MAX : UINT16_MAX)
    ? value
    : null;
}

export function normalizeGridBoundsPreferences(
  value: GridBoundsPreferences,
): GridBoundsPreferences {
  const result = { ...DEFAULT_GRID_BOUNDS_PREFERENCES };
  for (const field of GRID_BOUNDS_FIELDS) {
    const offset = field === "x" || field === "y";
    if (Number.isFinite(value[field]))
      result[field] = Math.max(
        offset ? INT16_MIN : 1,
        Math.min(offset ? INT16_MAX : UINT16_MAX, Math.trunc(value[field])),
      );
  }
  return result;
}
