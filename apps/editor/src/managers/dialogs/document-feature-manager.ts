import type {
  DialogRect,
  DialogSpriteResizeMethod,
  DialogViewTransform,
} from "$/managers/dialogs/input-values";
import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { clampCanvasPan, documentToScreen } from "@xprite/editor-core";

interface DocumentFeatureView {
  target: DialogEditorTarget;
  document: { id?: number; name: string; width: number; height: number };
  view: DialogViewTransform;
}

export function useDocumentFeatureManager(trackCanvasPan: boolean) {
  const source = useDialogEditorSource(undefined, trackCanvasPan);
  const { timelineVisible } = useEditorFields(["timelineVisible"]);
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
            tiledMode: source.snapshot.view.tiledMode,
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
      const { core } = source;
      if (!core || !source.isCurrentTarget(target)) return false;
      const { document, view } = core.getSnapshot();
      if (!document) return false;
      const viewport = measuredEditorViewport(core, timelineVisible);
      const previewOrigin = documentToScreen(bounds, viewport, document, view);
      const resizedOrigin = documentToScreen({ x: 0, y: 0 }, viewport, bounds, view);
      const previousEdit = core.history.getSnapshot().latestEdit;
      core.imageEditing.resizeCanvas(bounds, trimOutside);
      const result = core.getSnapshot();
      if (
        core.history.getSnapshot().latestEdit === previousEdit ||
        result.document?.width !== bounds.width ||
        result.document?.height !== bounds.height
      ) {
        if (result.error) throw result.error;
        return false;
      }
      // Keep the canvas at the ruler position when the new dimensions change its center.
      const pan = clampCanvasPan(
        {
          x: view.pan.x + previewOrigin.x - resizedOrigin.x,
          y: view.pan.y + previewOrigin.y - resizedOrigin.y,
        },
        viewport,
        bounds,
        view.zoom,
        view.tiledMode,
      );
      if (pan.x !== view.pan.x || pan.y !== view.pan.y) core.canvas.setView({ pan });
      return true;
    },
  };
}
