import { RightClickMode } from "@xprite/editor-core";

export { RightClickMode };

export interface EditorPreferences {
  zoomWithWheel: boolean;
  zoomWithSlide: boolean;
  zoomFromCenterWithWheel: boolean;
  zoomFromCenterWithKeys: boolean;
  autoScroll: boolean;
  autoFit: boolean;
  rightClickMode: RightClickMode;
  straightLinePreview: boolean;
  discardBrushOnEyedropper: boolean;
  tooltipDelay: number;
  nonActiveLayersOpacity: number;
}

export const MAX_TOOLTIP_DELAY = 60000;
const MAX_NON_ACTIVE_LAYERS_OPACITY = 255;
export const DEFAULT_EDITOR_PREFERENCES: Readonly<EditorPreferences> = {
  zoomWithWheel: true,
  zoomWithSlide: false,
  zoomFromCenterWithWheel: false,
  zoomFromCenterWithKeys: false,
  autoScroll: true,
  autoFit: true,
  rightClickMode: RightClickMode.PaintBackground,
  straightLinePreview: true,
  discardBrushOnEyedropper: false,
  tooltipDelay: 300,
  nonActiveLayersOpacity: MAX_NON_ACTIVE_LAYERS_OPACITY,
};

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...DEFAULT_EDITOR_PREFERENCES };
  for (const key of Object.keys(next) as (keyof EditorPreferences)[]) {
    const input = saved[key];
    if (key === "rightClickMode") {
      if (Object.values(RightClickMode).includes(input as RightClickMode))
        next[key] = input as RightClickMode;
    } else if (key === "tooltipDelay" || key === "nonActiveLayersOpacity") {
      if (typeof input === "number" && Number.isFinite(input))
        next[key] = Math.max(
          0,
          Math.min(
            key === "tooltipDelay" ? MAX_TOOLTIP_DELAY : MAX_NON_ACTIVE_LAYERS_OPACITY,
            Math.trunc(input),
          ),
        );
    } else if (typeof input === "boolean") next[key] = input;
  }
  return next;
}
