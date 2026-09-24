import { useCallback } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { formatEditorColor, parseEditorColor } from "$/managers/tools/color-control";
import {
  ToolSelectionPivotPosition,
  ToolSelectionRotationAlgorithm,
  ToolTilemapDisplayMode,
  type ToolSelectionPivotPosition as SelectionPivotPosition,
  type ToolSelectionRotationAlgorithm as SelectionRotationAlgorithm,
} from "$/managers/tools/tool-options";
import { isBackgroundLayer, type ToolSettings } from "@xprite/editor-core";

const DEFAULT_SELECTION_TRANSPARENT_COLOR = "#00000000";

/** Selection-tool options remain canonical in RasterEditor settings. */
export function useSelectionToolbarModel() {
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const settings = snapshot?.settings;
  const timeline = snapshot?.document?.timeline;
  const activeLayer = timeline?.layers[timeline.activeLayer];
  const pixelTransformsEnabled =
    activeLayer?.kind !== "tilemap" || settings?.tilemapMode === ToolTilemapDisplayMode.Pixels;
  const effectiveOpaque =
    (settings?.selectionAutoOpaque ?? true)
      ? !!activeLayer && isBackgroundLayer(activeLayer)
      : (settings?.selectionOpaque ?? false);
  const set = useCallback(
    (patch: Partial<ToolSettings>) => core?.drawing.settings.setSettings(patch),
    [core],
  );

  const setOpaque = useCallback(
    (value: boolean) => set({ selectionOpaque: value, selectionAutoOpaque: false }),
    [set],
  );
  const setAutoOpaque = useCallback((value: boolean) => set({ selectionAutoOpaque: value }), [set]);
  const setTransparentColor = useCallback(
    (value: string) => set({ selectionTransparentColor: parseEditorColor(value) }),
    [set],
  );
  const setRotationAlgorithm = useCallback(
    (value: SelectionRotationAlgorithm) => set({ selectionRotationAlgorithm: value }),
    [set],
  );
  const setPivotPosition = useCallback(
    (value: SelectionPivotPosition) => set({ selectionPivotPosition: value }),
    [set],
  );
  const setPivotVisible = useCallback(
    (value: boolean) => set({ selectionPivotVisible: value }),
    [set],
  );
  const setCornerRadius = useCallback(
    (value: number) =>
      set({
        selectionCornerRadius: Math.max(0, Math.round(Number.isFinite(value) ? value : 0)),
      }),
    [set],
  );

  return {
    enabled: Boolean(core),
    transformActive: Boolean(snapshot?.selectionTransform),
    opaque: settings?.selectionOpaque ?? false,
    autoOpaque: settings?.selectionAutoOpaque ?? true,
    effectiveOpaque,
    pixelTransformsEnabled,
    transparentColor: settings?.selectionTransparentColor
      ? formatEditorColor(settings.selectionTransparentColor)
      : DEFAULT_SELECTION_TRANSPARENT_COLOR,
    rotationAlgorithm: settings?.selectionRotationAlgorithm ?? ToolSelectionRotationAlgorithm.Fast,
    pivotPosition: settings?.selectionPivotPosition ?? ToolSelectionPivotPosition.Center,
    pivotVisible: settings?.selectionPivotVisible ?? false,
    cornerRadius: settings?.selectionCornerRadius ?? 0,
    setOpaque,
    setAutoOpaque,
    setTransparentColor,
    setRotationAlgorithm,
    setPivotPosition,
    setPivotVisible,
    setCornerRadius,
  };
}
