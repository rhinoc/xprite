import { useEffect, useRef, type ReactNode } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { Button } from "$/components/button";
import {
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { windowMetrics } from "$/components/window/metrics";
import { OverlayFrame, type OverlayContentLayout } from "$/components/window/overlay-frame";
import { useVisibleSceneBounds } from "$/components/window/visible-scene-bounds";

const POPUP_CLOSE_BUTTON_WIDTH = 18;
const POPUP_CLOSE_BUTTON_HEIGHT = 22;

export interface PopupVariantContext {
  bounds: SurfaceBounds;
  clientBounds: SurfaceBounds;
  viewport: SurfaceViewport;
}

export interface PopupVariantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  bounds: SurfaceBounds;
  viewport?: SurfaceViewport;
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  clientInsets?: Partial<{ left: number; right: number; top: number; bottom: number }>;
  relativeTo?: { x: number; y: number };
  className?: string;
  autoFocus?: boolean;
  closeOnEnter?: boolean;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
  contentLayout?: OverlayContentLayout;
  scrollX?: boolean;
  scrollY?: boolean;
  children?: ReactNode | ((context: PopupVariantContext) => ReactNode);
}

/** Theme-skinned popup border with focus restoration and outside dismissal. */
export function PopupVariant({
  open,
  onOpenChange,
  label,
  bounds: requested,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  sceneBounds,
  clientInsets,
  relativeTo = { x: 0, y: 0 },
  className,
  autoFocus = true,
  closeOnEnter = false,
  closeOnOutsideClick = true,
  showCloseButton = true,
  contentLayout,
  scrollX,
  scrollY,
  children,
}: PopupVariantProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const available = useVisibleSceneBounds(
    root,
    open,
    viewport,
    sceneBounds ?? { width: viewport.sceneWidth, height: viewport.sceneHeight },
    relativeTo,
  );
  const availableWidth = available.width;
  const availableHeight = available.height;
  const close = useRef(onOpenChange);
  close.current = onOpenChange;
  const { translateSource, translateKey } = useTheme();
  const displayLabel = translateSource(label);
  const contentWidth = Math.max(windowMetrics.popupMinimumWidth, requested.width);
  const contentHeight = Math.max(windowMetrics.popupMinimumHeight, requested.height);
  // Constrained popups retain their authored content plane for scrolling. Keep
  // the close control in a separate row so it cannot cover that plane's controls.
  const closeRowHeight =
    showCloseButton && contentWidth > availableWidth ? POPUP_CLOSE_BUTTON_HEIGHT : 0;
  const bounds = {
    ...requested,
    width: Math.min(availableWidth, contentWidth),
    height: Math.min(availableHeight, contentHeight + closeRowHeight),
  };
  bounds.x = Math.max(available.x, Math.min(available.x + availableWidth - bounds.width, bounds.x));
  bounds.y = Math.max(
    available.y,
    Math.min(available.y + availableHeight - bounds.height, bounds.y),
  );
  const insetLeft = clientInsets?.left ?? windowMetrics.popupInsetX;
  const insetRight = clientInsets?.right ?? windowMetrics.popupInsetX;
  const insetTop = clientInsets?.top ?? windowMetrics.popupInsetTop;
  const insetBottom = clientInsets?.bottom ?? windowMetrics.popupInsetBottom;
  const clientBounds = {
    x: bounds.x + insetLeft,
    y: bounds.y + insetTop + closeRowHeight,
    width: Math.max(0, (scrollX === false ? bounds.width : contentWidth) - insetLeft - insetRight),
    height: Math.max(0, contentHeight - insetTop - insetBottom),
  };
  const clientLayoutBounds = {
    ...clientBounds,
    width: Math.max(0, bounds.width - insetLeft - insetRight),
    height: Math.max(0, bounds.height - insetTop - insetBottom - closeRowHeight),
  };
  const closeButtonBounds = {
    x: clientLayoutBounds.x + clientLayoutBounds.width - POPUP_CLOSE_BUTTON_WIDTH,
    y: bounds.y + insetTop,
    width: POPUP_CLOSE_BUTTON_WIDTH,
    height: POPUP_CLOSE_BUTTON_HEIGHT,
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocus) root.current?.focus({ preventScroll: true });
    let restoreFocus = true;
    const pointer = (event: PointerEvent) => {
      if (closeOnOutsideClick && root.current && !root.current.contains(event.target as Node)) {
        restoreFocus = false;
        close.current(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" || (closeOnEnter && event.key === "Enter")) {
        event.preventDefault();
        event.stopPropagation();
        close.current(false);
      }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", key);
      if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, autoFocus, closeOnOutsideClick, closeOnEnter]);

  if (!open) return null;
  return (
    <OverlayFrame
      variant="popup"
      bounds={bounds}
      clientBounds={clientBounds}
      clientLayoutBounds={clientLayoutBounds}
      viewport={viewport}
      relativeTo={relativeTo}
      label={displayLabel}
      className={className}
      contentLayout={contentLayout}
      scrollX={scrollX}
      scrollY={scrollY}
      onRootRef={(node) => {
        root.current = node;
      }}
      chrome={
        showCloseButton && (
          <Button
            bounds={closeButtonBounds}
            relativeTo={bounds}
            viewport={viewport}
            part="window_button_normal"
            hotPart="window_button_hot"
            pushedPart="window_button_selected"
            icon="window_close_icon"
            insetContent={false}
            aria-label={translateKey("ui.close.name").replace("{name}", displayLabel)}
            onClick={() => onOpenChange(false)}
          />
        )
      }
      rootProps={{
        onPointerDown: (event) => event.stopPropagation(),
        onWheel: (event) => event.stopPropagation(),
        onKeyDown: (event) => {
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (
            event.key === "Escape" ||
            (closeOnEnter && event.key === "Enter" && !event.defaultPrevented)
          ) {
            event.preventDefault();
            close.current(false);
          }
          event.stopPropagation();
        },
      }}
    >
      {typeof children === "function" ? children({ bounds, clientBounds, viewport }) : children}
    </OverlayFrame>
  );
}
