import * as React from "react";

import { viewportContentSize, clientRect } from "$/base/utils/dom-geometry";
import {
  DEFAULT_SURFACE_VIEWPORT,
  sceneViewport,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { OverlayDismissReason, useOverlayInteraction } from "$/components/window/interaction";

export interface AnchoredPopoverState {
  x: number;
  y: number;
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  availableWidth: number;
  availableHeight: number;
}

export interface AnchoredPopoverAnchor {
  bounds: SurfaceBounds;
  top: number;
  bottom: number;
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  availableWidth: number;
  availableHeight: number;
}

export interface AnchoredPopoverOpenOptions {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
}

export interface AnchoredPopoverOptions {
  onDismiss?: (reason: OverlayDismissReason, event: Event) => void;
  keepOpenOnOtherOverlays?: boolean;
}

/** Measure a trigger in scene coordinates, retaining authored bounds when they match. */
export function measurePopoverAnchor(
  trigger: HTMLElement,
  baseViewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
  authoredBounds?: SurfaceBounds,
): AnchoredPopoverAnchor {
  const rect = clientRect(trigger);
  const sceneElement = trigger.closest<HTMLElement>("[data-ui-scene]");
  const scene = sceneElement ? clientRect(sceneElement) : undefined;
  const viewport = sceneElement ? sceneViewport(sceneElement, baseViewport) : baseViewport;
  const origin = { x: scene?.left ?? 0, y: scene?.top ?? 0 };
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const availableViewport = viewportContentSize(window);
  const availableWidth = scene ? viewport.sceneWidth : availableViewport.width / sx;
  const availableHeight = scene ? viewport.sceneHeight : availableViewport.height / sy;
  const authoredAnchor =
    !!scene &&
    !!authoredBounds &&
    Math.abs(rect.left - origin.x - Math.floor(authoredBounds.x * sx)) < 1 &&
    Math.abs(rect.top - origin.y - Math.floor(authoredBounds.y * sy)) < 1;
  const top =
    authoredAnchor && authoredBounds ? authoredBounds.y : Math.round((rect.top - origin.y) / sy);
  const bottom =
    authoredAnchor && authoredBounds
      ? authoredBounds.y + authoredBounds.height
      : Math.round((rect.bottom - origin.y) / sy);
  const bounds =
    authoredAnchor && authoredBounds
      ? { ...authoredBounds }
      : {
          x: Math.round((rect.left - origin.x) / sx),
          y: top,
          width: Math.round(rect.width / sx),
          height: Math.round(rect.height / sy),
        };
  return { bounds, top, bottom, viewport, origin, availableWidth, availableHeight };
}

/** Trigger-relative scene placement without dismissal or focus behavior. */
export function usePopoverPosition<TTrigger extends HTMLElement = HTMLElement>(
  baseViewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
) {
  const triggerRef = React.useRef<TTrigger>(null);
  const activeTrigger = React.useRef<TTrigger | null>(null);
  const [popover, setPopover] = React.useState<AnchoredPopoverState | null>(null);

  const close = React.useCallback(() => setPopover(null), []);

  const open = React.useCallback(
    (
      { width, height, offsetX = 0, offsetY = 0 }: AnchoredPopoverOpenOptions,
      trigger = triggerRef.current,
    ) => {
      if (!trigger) return;
      activeTrigger.current = trigger;
      const anchor = measurePopoverAnchor(trigger, baseViewport);
      const requestedX = anchor.bounds.x + offsetX;
      const requestedY = anchor.bottom + offsetY;

      // Fit once using the opening size. Aseprite PopupWindow::expandWindow keeps
      // its origin when conditional content later changes the popup's height.
      setPopover({
        x: Math.max(0, Math.min(anchor.availableWidth - width, requestedX)),
        y: Math.max(0, Math.min(anchor.availableHeight - height, requestedY)),
        viewport: anchor.viewport,
        origin: anchor.origin,
        availableWidth: anchor.availableWidth,
        availableHeight: anchor.availableHeight,
      });
    },
    [baseViewport],
  );

  return { triggerRef, activeTrigger, popover, open, close };
}

/** Anchored popup preset composed from placement and shared overlay interactions. */
export function useAnchoredPopover<
  TTrigger extends HTMLElement = HTMLElement,
  TPanel extends HTMLElement = HTMLElement,
>(baseViewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT, options: AnchoredPopoverOptions = {}) {
  const {
    triggerRef,
    activeTrigger,
    popover,
    open,
    close: closePosition,
  } = usePopoverPosition<TTrigger>(baseViewport);
  const panelRef = React.useRef<TPanel>(null);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const close = React.useCallback(
    (restoreFocus = false) => {
      closePosition();
      if (restoreFocus)
        (activeTrigger.current ?? triggerRef.current)?.focus({ preventScroll: true });
    },
    [closePosition, activeTrigger, triggerRef],
  );
  useOverlayInteraction({
    open: !!popover,
    rootRef: panelRef,
    triggerRef: activeTrigger,
    closeOnOutsidePointer: true,
    closeOnResize: true,
    closeOnWindowBlur: true,
    ignoreOutside: (event) =>
      optionsRef.current.keepOpenOnOtherOverlays !== false &&
      event.target instanceof Element &&
      !!event.target.closest('[role="menu"],[data-popup],[data-floating-window]'),
    ignoreEscape: (event) =>
      !!(
        event.target instanceof Node ? event.target.ownerDocument : panelRef.current?.ownerDocument
      )?.querySelector('[role="menu"]'),
    onDismiss: (reason, event) => {
      optionsRef.current.onDismiss?.(reason, event);
      close(reason === OverlayDismissReason.Escape);
    },
  });

  return { triggerRef, panelRef, popover, open, close };
}

/** Fixed-position wrapper styles shared by bitmap scene popovers. */
export function anchoredPopoverStyle(
  popover: Pick<AnchoredPopoverState, "origin" | "viewport" | "availableHeight">,
  bounds: SurfaceBounds,
  options: { zIndex?: number; constrainToViewport?: boolean } = {},
): React.CSSProperties {
  const layout = surfaceLayout(bounds, popover.viewport);
  return {
    position: "fixed",
    zIndex: options.zIndex ?? 8000,
    left: popover.origin.x + layout.left,
    top: popover.origin.y + layout.top,
    width: layout.width,
    height: layout.height,
    ...(options.constrainToViewport === false
      ? {}
      : {
          maxHeight:
            (popover.availableHeight * popover.viewport.height) / popover.viewport.sceneHeight,
          overflow: "hidden" as const,
        }),
  };
}
