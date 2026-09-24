import type { PreferenceStoragePort } from "$/managers/ports/platform";

export interface PanelLayoutPreferences {
  paletteBoxSize: number;
  timelineLayerColumnWidth: number;
}

const DEFAULT_PALETTE_BOX_SIZE = 11;
const MIN_PALETTE_BOX_SIZE = 4;
const MAX_PALETTE_BOX_SIZE = 32;
const DEFAULT_TIMELINE_LAYER_COLUMN_WIDTH = 200;
const MIN_TIMELINE_LAYER_COLUMN_WIDTH = 168;
const MAX_TIMELINE_LAYER_COLUMN_WIDTH = 800;

const STORAGE_KEY = "xse.workspace.panel-layout.v1";

export function normalizePanelLayoutPreferences(value: unknown): PanelLayoutPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const boxSize = saved.paletteBoxSize;
  const columnWidth = saved.timelineLayerColumnWidth;
  return {
    paletteBoxSize:
      typeof boxSize === "number" && Number.isFinite(boxSize)
        ? Math.max(MIN_PALETTE_BOX_SIZE, Math.min(MAX_PALETTE_BOX_SIZE, boxSize))
        : DEFAULT_PALETTE_BOX_SIZE,
    timelineLayerColumnWidth:
      typeof columnWidth === "number" && Number.isFinite(columnWidth)
        ? Math.max(
            MIN_TIMELINE_LAYER_COLUMN_WIDTH,
            Math.min(MAX_TIMELINE_LAYER_COLUMN_WIDTH, Math.round(columnWidth)),
          )
        : DEFAULT_TIMELINE_LAYER_COLUMN_WIDTH,
  };
}

export function readPanelLayoutPreferences(
  storage?: PreferenceStoragePort,
): PanelLayoutPreferences {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return normalizePanelLayoutPreferences(saved ? JSON.parse(saved) : undefined);
  } catch {
    return normalizePanelLayoutPreferences(undefined);
  }
}

export function writePanelLayoutPreferences(
  value: PanelLayoutPreferences,
  storage?: PreferenceStoragePort,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizePanelLayoutPreferences(value)));
  } catch {
    // Keep the active workspace layout when preference storage is unavailable.
  }
}
