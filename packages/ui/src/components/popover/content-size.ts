import { useLayoutEffect, useState, type RefObject } from "react";

import { layoutSize, clientRect, clientScale, observeResize } from "$/base/utils/dom-geometry";
import type { AnchoredPopoverState } from "$/components/popover/anchored";

/** Measure wrapped controls and gutter space before revealing an anchored popup. */
export function usePopoverContentSize(
  content: RefObject<HTMLElement | null>,
  popover: AnchoredPopoverState,
  {
    maximumWidth: requestedWidth,
    initialHeight,
    inset,
    items,
  }: { maximumWidth: number; initialHeight: number; inset: number; items: string },
) {
  const [size, setSize] = useState({
    width: requestedWidth,
    height: initialHeight,
    ready: false,
  });
  const scaleX = popover.viewport.width / popover.viewport.sceneWidth;
  const scaleY = popover.viewport.height / popover.viewport.sceneHeight;
  const maximumWidth = Math.min(requestedWidth, popover.availableWidth);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const rect = clientRect(node);
      let occupiedWidth = 0;
      for (const control of node.querySelectorAll<HTMLElement>(items)) {
        const box = clientRect(control);
        if (!box.width || !box.height) continue;
        // Include intrinsic width so a scroll gutter cannot keep narrowing a wrapped control.
        const intrinsicWidth =
          Number.parseFloat(control.style.width) * clientScale(control).x || box.width;
        occupiedWidth = Math.max(occupiedWidth, box.right - rect.left, intrinsicWidth);
      }
      const viewport = node.closest<HTMLElement>("[data-ui-window-client]");
      const gutter = viewport
        ? Math.max(
            0,
            (layoutSize(viewport.parentElement)?.width ?? layoutSize(viewport).width) -
              layoutSize(viewport).width,
          ) * clientScale(viewport).x
        : 0;
      const padding = inset * 2;
      const next = {
        width: Math.min(maximumWidth, Math.ceil((occupiedWidth + gutter) / scaleX) + padding),
        height: Math.ceil(rect.height / scaleY) + padding,
        ready: true,
      };
      setSize((current) =>
        current.ready && current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = observeResize([node], schedule);

    const mutation = new MutationObserver(schedule);
    mutation.observe(node, { childList: true, subtree: true, attributes: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize();
      mutation.disconnect();
    };
    // Converge wrapped widths and scroll gutters before painting the opening position.
  }, [content, maximumWidth, scaleX, scaleY, size.width, size.height, inset, items]);
  return size;
}
