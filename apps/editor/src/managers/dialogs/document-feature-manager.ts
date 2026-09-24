import type {
  DialogRect,
  DialogSpriteResizeMethod,
  DialogViewTransform,
} from "$/managers/dialogs/input-values";
import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";

interface DocumentFeatureView {
  target: DialogEditorTarget;
  document: { id?: number; name: string; width: number; height: number };
  view: DialogViewTransform;
}

export function useDocumentFeatureManager() {
  const source = useDialogEditorSource();
  const current: DocumentFeatureView | null =
    source.target && source.snapshot?.document
      ? {
          target: source.target,
          document: {
            id: source.snapshot.document.id,
            name: source.snapshot.document.name,
            width: source.snapshot.document.width,
            height: source.snapshot.document.height,
          },
          view: {
            zoom: source.snapshot.view.zoom,
            pan: source.snapshot.view.pan,
          },
        }
      : null;
  return {
    current,
    isCurrentTarget: source.isCurrentTarget,
    pausePlayback: () => source.core?.timeline.setPlaying(false),
    resizeSprite(
      target: DialogEditorTarget,
      width: number,
      height: number,
      method: DialogSpriteResizeMethod,
    ) {
      if (!source.core || !source.isCurrentTarget(target)) return false;
      source.core.imageEditing.resizeSprite(width, height, method);
      return true;
    },
    resizeCanvas(target: DialogEditorTarget, bounds: DialogRect, trimOutside: boolean) {
      if (!source.core || !source.isCurrentTarget(target)) return false;
      source.core.imageEditing.resizeCanvas(bounds, trimOutside);
      return true;
    },
  };
}
