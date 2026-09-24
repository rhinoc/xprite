import {
  DEFAULT_AUTO_GUIDES_COLOR,
  DEFAULT_LAYER_EDGES_COLOR,
  DEFAULT_SLICE_COLOR,
} from "@xprite/editor-core";

export interface GuideSlicePreferences {
  layerEdgesColor: string;
  autoGuidesColor: string;
  defaultSliceColor: string;
}

export const DEFAULT_GUIDE_SLICE_PREFERENCES: GuideSlicePreferences = {
  layerEdgesColor: DEFAULT_LAYER_EDGES_COLOR,
  autoGuidesColor: DEFAULT_AUTO_GUIDES_COLOR,
  defaultSliceColor: DEFAULT_SLICE_COLOR,
};

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const digits = value.trim().replace(/^#/, "");
  if (/^[\da-f]{6}$/i.test(digits)) return `#${digits.toLowerCase()}ff`;
  if (/^[\da-f]{8}$/i.test(digits)) return `#${digits.toLowerCase()}`;
  return fallback;
}

export function normalizeGuideSlicePreferences(value: unknown): GuideSlicePreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    layerEdgesColor: normalizeColor(
      saved.layerEdgesColor,
      DEFAULT_GUIDE_SLICE_PREFERENCES.layerEdgesColor,
    ),
    autoGuidesColor: normalizeColor(
      saved.autoGuidesColor,
      DEFAULT_GUIDE_SLICE_PREFERENCES.autoGuidesColor,
    ),
    defaultSliceColor: normalizeColor(
      saved.defaultSliceColor,
      DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor,
    ),
  };
}
