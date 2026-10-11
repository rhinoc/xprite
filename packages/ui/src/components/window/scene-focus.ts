import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { layoutSize, scrollBy, clientRect } from "$/base/utils/dom-geometry";
import { cancelLayoutMeasurement, queueLayoutMeasurement } from "$/base/utils/layout-measurements";
import {
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Keep focused controls visible inside the scene client plane without panning the page. */
export function useSceneFocusReveal(
  bounds: SurfaceBounds,
  clientBounds: SurfaceBounds,
  viewport: SurfaceViewport,
) {
  const layout = surfaceLayout(bounds, viewport);
  const clientLayout = surfaceLayout(clientBounds, viewport);
  const scroller = useRef<HTMLDivElement | null>(null);
  const revealFocus = useCallback(() => {
    const node = scroller.current;
    const focused = node?.ownerDocument.activeElement;
    if (!node || !(focused instanceof HTMLElement) || !node.contains(focused)) return;
    const frame = clientRect(node);
    const target = clientRect(focused);
    const scaleX = layoutSize(node).width ? frame.width / layoutSize(node).width : 1;
    const scaleY = layoutSize(node).height ? frame.height / layoutSize(node).height : 1;
    // Scroll this client plane only. Scrolling the page would move the editor
    // and let the browser's keyboard panning fight overlay placement.
    if (target.left < frame.left) scrollBy(node, { x: (target.left - frame.left) / scaleX });
    else if (target.right > frame.right)
      scrollBy(node, { x: (target.right - frame.right) / scaleX });
    if (target.top < frame.top) scrollBy(node, { y: (target.top - frame.top) / scaleY });
    else if (target.bottom > frame.bottom)
      scrollBy(node, { y: (target.bottom - frame.bottom) / scaleY });
  }, []);
  const scheduleRevealFocus = useCallback(() => {
    const host = scroller.current?.ownerDocument.defaultView;
    if (host) queueLayoutMeasurement(host, revealFocus);
  }, [revealFocus]);

  useClientLayoutEffect(() => {
    scheduleRevealFocus();
    const host = scroller.current?.ownerDocument.defaultView;
    return () => {
      if (host) cancelLayoutMeasurement(host, revealFocus);
    };
  }, [
    scheduleRevealFocus,
    revealFocus,
    layout.left,
    layout.top,
    clientLayout.width,
    clientLayout.height,
  ]);

  return { viewportRef: scroller, onFocusCapture: scheduleRevealFocus };
}
