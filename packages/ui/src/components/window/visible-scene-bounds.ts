import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import {
  getVisualViewport,
  borderSize,
  layoutBorder,
  scrollPosition,
  visualViewportRect,
  clientRect,
  positionedParent,
  observeResize,
} from "$/base/utils/dom-geometry";
import { cancelLayoutMeasurement, queueLayoutMeasurement } from "$/base/utils/layout-measurements";
import type { SurfaceBounds, SurfaceViewport } from "$/components/canvas-surface";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Intersect a surface's logical scene with the browser's visible workarea.
 * Keep display scale fixed when a keyboard, browser zoom, or split view reduces it.
 */
export function useVisibleSceneBounds(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  viewport: SurfaceViewport,
  scene: Pick<SurfaceBounds, "width" | "height">,
  relativeTo: Pick<SurfaceBounds, "x" | "y">,
): SurfaceBounds {
  const [visible, setVisible] = useState<SurfaceBounds | null>(null);
  const { width, height } = scene;
  const { x, y } = relativeTo;
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;

  useClientLayoutEffect(() => {
    const node = root.current;
    const hostWindow = node?.ownerDocument.defaultView;
    if (!open || !node || !hostWindow) return;
    const visual = getVisualViewport(hostWindow);
    if (!visual) return;
    const host = positionedParent(node);
    if (!host) return;

    const measure = () => {
      const rect = clientRect(host);
      if (!borderSize(host).width || !borderSize(host).height) return;
      const hostScaleX = rect.width / borderSize(host).width;
      const hostScaleY = rect.height / borderSize(host).height;
      const scaleX = sx * hostScaleX;
      const scaleY = sy * hostScaleY;
      if (scaleX <= 0 || scaleY <= 0) return;
      const originX = rect.left + (layoutBorder(host).x - scrollPosition(host).x) * hostScaleX;
      const originY = rect.top + (layoutBorder(host).y - scrollPosition(host).y) * hostScaleY;
      const left = Math.min(
        width,
        Math.max(0, x + (visualViewportRect(visual).x - originX) / scaleX),
      );
      const top = Math.min(
        height,
        Math.max(0, y + (visualViewportRect(visual).y - originY) / scaleY),
      );
      const right = Math.max(
        left,
        Math.min(
          width,
          x + (visualViewportRect(visual).x + visualViewportRect(visual).width - originX) / scaleX,
        ),
      );
      const bottom = Math.max(
        top,
        Math.min(
          height,
          y + (visualViewportRect(visual).y + visualViewportRect(visual).height - originY) / scaleY,
        ),
      );
      const next = { x: left, y: top, width: right - left, height: bottom - top };
      setVisible((current) =>
        current &&
        current.x === next.x &&
        current.y === next.y &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    const schedule = () => queueLayoutMeasurement(hostWindow, measure);
    const resize = observeResize([host], schedule);

    visual.addEventListener("resize", schedule);
    visual.addEventListener("scroll", schedule);
    hostWindow.addEventListener("resize", schedule);
    hostWindow.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      cancelLayoutMeasurement(hostWindow, measure);
      resize();
      visual.removeEventListener("resize", schedule);
      visual.removeEventListener("scroll", schedule);
      hostWindow.removeEventListener("resize", schedule);
      hostWindow.removeEventListener("scroll", schedule, true);
    };
  }, [root, open, width, height, x, y, sx, sy]);

  return open && visible ? visible : { x: 0, y: 0, width, height };
}
