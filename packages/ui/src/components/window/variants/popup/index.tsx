import { useRef, type ReactNode } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { Button } from "$/components/button";
import {
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { PanelFrame, PanelFrameLayout } from "$/components/panel/frame";
import {
  ScenePanelSkin,
  type ScenePanelFrameProps,
  type OverlayContentLayout,
} from "$/components/panel/scene-frame";
import { FloatingLayer, FloatingLayerKind } from "$/components/window/floating-layer";
import { OverlayInteractionScope, useOverlayInteraction } from "$/components/window/interaction";
import { windowMetrics } from "$/components/window/metrics";
import { useSceneFocusReveal } from "$/components/window/scene-focus";
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
  closeLabel?: string;
  contentLayout?: OverlayContentLayout;
  scrollX?: boolean;
  scrollY?: boolean;
  children?: ReactNode | ((context: PopupVariantContext) => ReactNode);
  /** Replace presentation while retaining popup placement and interaction. */
  renderFrame?: (props: ScenePanelFrameProps) => ReactNode;
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
  closeLabel,
  contentLayout,
  scrollX,
  scrollY,
  children,
  renderFrame,
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

  const interaction = useOverlayInteraction({
    open,
    rootRef: root,
    autoFocus,
    restoreFocus: true,
    closeOnEnter,
    closeOnOutsidePointer: closeOnOutsideClick,
    onDismiss: () => onOpenChange(false),
  });
  const focusReveal = useSceneFocusReveal(bounds, clientLayoutBounds, viewport);
  if (!open) return null;
  const presentation: ScenePanelFrameProps = {
    skin: ScenePanelSkin.Popup,
    bounds,
    clientBounds,
    clientLayoutBounds,
    viewport,
    label: displayLabel,
    contentLayout,
    scrollX,
    scrollY,
    viewportRef: focusReveal.viewportRef,
    children:
      typeof children === "function" ? children({ bounds, clientBounds, viewport }) : children,
  };

  return (
    <OverlayInteractionScope owner={interaction.owner}>
      <FloatingLayer
        kind={FloatingLayerKind.Popup}
        bounds={bounds}
        viewport={viewport}
        relativeTo={relativeTo}
        className={className}
        onRootRef={(node) => {
          root.current = node;
        }}
        rootProps={{
          role: "dialog",
          "aria-modal": false,
          "aria-label": displayLabel,
          tabIndex: -1,
          onFocusCapture: focusReveal.onFocusCapture,
          onPointerDown: (event) => event.stopPropagation(),
          onWheel: (event) => event.stopPropagation(),
          onKeyDown: (event) => {
            interaction.onKeyDown(event);
            event.stopPropagation();
          },
        }}
      >
        {renderFrame ? (
          renderFrame(presentation)
        ) : (
          <PanelFrame layout={PanelFrameLayout.Scene} {...presentation} />
        )}
        {showCloseButton && (
          <Button
            bounds={closeButtonBounds}
            relativeTo={bounds}
            viewport={viewport}
            part="window_button_normal"
            hotPart="window_button_hot"
            pushedPart="window_button_selected"
            icon="window_close_icon"
            insetContent={false}
            aria-label={closeLabel ?? translateKey("ui.close.name").replace("{name}", displayLabel)}
            onClick={() => onOpenChange(false)}
          />
        )}
      </FloatingLayer>
    </OverlayInteractionScope>
  );
}
