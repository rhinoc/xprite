import { useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { renderTimelinePreview } from "$/managers/timeline/animation-preview-manager";
import {
  fullscreenPreviewKeyAction,
  FullscreenPreviewKeyAction,
} from "$/managers/timeline/fullscreen-preview";
import type { TimelineSnapshot } from "$/managers/timeline/timeline-manager";
import { parseEditorColor } from "$/managers/tools/color-control";
import { CanvasSurface, createUiPortal } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import { clientPoint, clientRect, isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/timeline/fullscreen-preview/fullscreen-preview.module.css";

export interface FullscreenPreviewProps {
  snapshot: TimelineSnapshot;
  onClose(): void;
  onStepFrame(action: FullscreenPreviewKeyAction): void;
}

/**
 * Aseprite FullscreenPreview (F8, cmd_fullscreen_preview.cpp): the sprite at the editor zoom over
 * the whole window. Moving the mouse pans; frame navigation keys change the frame; a click or any
 * other key closes it.
 */
export function FullscreenPreview({ snapshot, onClose, onStepFrame }: FullscreenPreviewProps) {
  const scene = useSceneBounds();
  const assets = useUiAssets();
  const [pan, setPan] = useState(() => ({ ...(snapshot.view.pan ?? { x: 0, y: 0 }) }));
  const last = useRef<{ x: number; y: number } | null>(null);
  const callbacks = useRef({ onClose, onStepFrame });
  callbacks.current = { onClose, onStepFrame };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // Keys arrive at the window before any control; this surface owns them while open.
      const action = fullscreenPreviewKeyAction(event.key);
      if (action === FullscreenPreviewKeyAction.Close) callbacks.current.onClose();
      else callbacks.current.onStepFrame(action);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const document = snapshot.document;
  const timeline = document?.timeline;
  if (!document || !timeline) return null;
  const bounds = { x: 0, y: 0, width: scene.width, height: scene.height };
  const zoom = snapshot.view.zoom;
  return createUiPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="Full Screen Preview"
      onPointerMove={(event) => {
        const point = clientPoint(event);
        const previous = last.current;
        last.current = point;
        if (!previous) return;
        const rect = clientRect(event.currentTarget);
        const sx = rect.width / bounds.width || 1,
          sy = rect.height / bounds.height || 1;
        setPan((current) => ({
          x: current.x + (point.x - previous.x) / sx / 2,
          y: current.y + (point.y - previous.y) / sy / 2,
        }));
      }}
      onPointerUp={() => onClose()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CanvasSurface
        bounds={bounds}
        style={{ position: "absolute", ...surfaceLayout(bounds) }}
        dependencies={[assets, timeline, snapshot.pixelRevision, zoom, pan.x, pan.y]}
        aria-label="Full screen preview canvas"
        paint={(ctx) => {
          if (!assets) return;
          const width = Math.max(1, Math.round(bounds.width)),
            height = Math.max(1, Math.round(bounds.height));
          const image = renderTimelinePreview(
            timeline,
            timeline.activeFrame,
            document,
            { width, height },
            zoom,
            pan,
            parseEditorColor(assets.style.colors.editor_face),
          );
          ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), width, height), 0, 0);
        }}
      />
    </div>,
    globalThis.document.body,
  );
}
