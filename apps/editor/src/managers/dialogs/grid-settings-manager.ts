import type { DialogRect } from "$/managers/dialogs/input-values";
import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";

export interface GridSettingsView {
  target: DialogEditorTarget;
  bounds: DialogRect;
}

export function useGridSettingsManager() {
  const { core, snapshot, target, isCurrentTarget } = useDialogEditorSource();
  const current: GridSettingsView | null =
    target && snapshot?.document
      ? {
          target,
          bounds: {
            x: snapshot.view.gridX ?? 0,
            y: snapshot.view.gridY ?? 0,
            width: snapshot.view.gridWidth,
            height: snapshot.view.gridHeight,
          },
        }
      : null;

  return {
    current,
    isCurrentTarget,
    setGridBounds(target: DialogEditorTarget, bounds: DialogRect): boolean {
      if (!core || !isCurrentTarget(target)) return false;
      core.canvas.setGridBounds(bounds);
      return true;
    },
  };
}
