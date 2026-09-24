import * as React from "react";

import { viewportSize, clientRect } from "$/base/utils/dom-geometry";
import {
  DEFAULT_SURFACE_VIEWPORT,
  sceneViewport,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";

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

export enum AnchoredPopoverDismissReason {
  OutsidePointer = "outside-pointer",
  Escape = "escape",
  Resize = "resize",
  WindowBlur = "window-blur",
}
export interface AnchoredPopoverOptions {
  onDismiss?: (reason: AnchoredPopoverDismissReason, event: Event) => void;
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
  const availableWidth = scene ? viewport.sceneWidth : viewportSize(window).width / sx;
  const availableHeight = scene ? viewport.sceneHeight : viewportSize(window).height / sy;
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

/** Shared trigger anchoring and dismissal behavior for bitmap scene popovers. */
export function useAnchoredPopover<
  TTrigger extends HTMLElement = HTMLElement,
  TPanel extends HTMLElement = HTMLElement,
>(baseViewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT, options: AnchoredPopoverOptions = {}) {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const triggerRef = React.useRef<TTrigger>(null);
  const panelRef = React.useRef<TPanel>(null);
  const activeTrigger = React.useRef<TTrigger | null>(null);
  const [popover, setPopover] = React.useState<AnchoredPopoverState | null>(null);

  const close = React.useCallback((restoreFocus = false) => {
    setPopover(null);
    if (restoreFocus) (activeTrigger.current ?? triggerRef.current)?.focus({ preventScroll: true });
  }, []);

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

  React.useEffect(() => {
    if (!popover) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        optionsRef.current.onDismiss?.(AnchoredPopoverDismissReason.OutsidePointer, event);
        return close();
      }
      const element = target instanceof Element ? target : null;
      if (
        panelRef.current?.contains(target) ||
        (activeTrigger.current ?? triggerRef.current)?.contains(target) ||
        (optionsRef.current.keepOpenOnOtherOverlays !== false &&
          element?.closest('[role="menu"],[data-popup],[data-floating-window]'))
      )
        return;
      optionsRef.current.onDismiss?.(AnchoredPopoverDismissReason.OutsidePointer, event);
      close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !document.querySelector('[role="menu"]')) {
        event.preventDefault();
        optionsRef.current.onDismiss?.(AnchoredPopoverDismissReason.Escape, event);
        close(true);
      }
    };
    const resize = (event: Event) => {
      optionsRef.current.onDismiss?.(AnchoredPopoverDismissReason.Resize, event);
      close();
    };
    const blur = (event: Event) => {
      optionsRef.current.onDismiss?.(AnchoredPopoverDismissReason.WindowBlur, event);
      close();
    };
    // Canvas and other controls may consume bubbling pointer events.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
    };
  }, [popover, close]);

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
          overflowY: "auto" as const,
          overscrollBehavior: "contain" as const,
        }),
  };
}
