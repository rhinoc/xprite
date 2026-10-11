import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { Button } from "$/components/button";
import {
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { PanelFrame, PanelFrameLayout } from "$/components/panel/frame";
import {
  ScenePanelSkin,
  OverlayContentLayout,
  type ScenePanelFrameProps,
} from "$/components/panel/scene-frame";
import { FloatingLayer, FloatingLayerKind } from "$/components/window/floating-layer";
import { useModalInputDismiss } from "$/components/window/focus";
import { useWindowGesture, WindowGestureEdge } from "$/components/window/gesture";
import { OverlayInteractionScope, useOverlayInteraction } from "$/components/window/interaction";
import { windowMetrics } from "$/components/window/metrics";
import { useSceneFocusReveal } from "$/components/window/scene-focus";
import { useVisibleSceneBounds } from "$/components/window/visible-scene-bounds";

import styles from "$/components/window/gesture.module.css";

export interface WindowVariantContext {
  bounds: SurfaceBounds;
  clientBounds: SurfaceBounds;
  viewport: SurfaceViewport;
}

export interface WindowVariantProps {
  open: boolean;
  /** Center an uncontrolled window in the available scene until moved. */
  centerOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  defaultBounds?: SurfaceBounds;
  bounds?: SurfaceBounds;
  onBoundsChange?: (bounds: SurfaceBounds) => void;
  viewport?: SurfaceViewport;
  /** Available logical scene extent. Hosts provide this when placement is scene-relative. */
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  relativeTo?: { x: number; y: number };
  minSize?: { width: number; height: number };
  resizable?: boolean;
  movable?: boolean;
  autoFocus?: boolean;
  /** Modal owners are responsible for a focus trap and blocking the backdrop. */
  modal?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  onRootRef?: (node: HTMLDivElement | null) => void;
  constrainToViewport?: boolean;
  contentLayout?: OverlayContentLayout;
  children?: ReactNode | ((context: WindowVariantContext) => ReactNode);
  titlebarActions?: ReactNode | ((context: WindowVariantContext) => ReactNode);
  className?: string;
  /** Replace presentation while retaining window placement and interaction. */
  renderFrame?: (props: ScenePanelFrameProps) => ReactNode;
}

const DEFAULT_BOUNDS: SurfaceBounds = { x: 1350, y: 110, width: 500, height: 400 };
const DEFAULT_WINDOW_BORDER = windowMetrics.border;
const DEFAULT_WINDOW_TITLEBAR = windowMetrics.titlebar;
const DEFAULT_CLOSE_BUTTON = { width: 18, height: 22, right: 6, top: 6 };
const MINIMUM_WIDTH = windowMetrics.minimumWidth;
const MINIMUM_HEIGHT = windowMetrics.minimumHeight;

/** Theme-skinned, movable and resizable window with pointer and focus handling. */
export function WindowVariant({
  open,
  centerOnOpen = false,
  onOpenChange,
  title,
  description,
  defaultBounds = DEFAULT_BOUNDS,
  bounds: controlledBounds,
  onBoundsChange,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  sceneBounds,
  relativeTo = { x: 0, y: 0 },
  minSize = { width: MINIMUM_WIDTH, height: MINIMUM_HEIGHT },
  resizable = true,
  movable = true,
  autoFocus = true,
  modal = false,
  showCloseButton = true,
  closeLabel,
  onRootRef,
  constrainToViewport = false,
  contentLayout = OverlayContentLayout.Positioned,
  children,
  titlebarActions,
  className,
  renderFrame,
}: WindowVariantProps) {
  const { definition: theme, translateKey, translateSource } = useTheme();
  const WINDOW_BORDER = theme.parts.window.surface?.borderWidth ?? DEFAULT_WINDOW_BORDER;
  const WINDOW_TITLEBAR = theme.parts.window.surface?.titlebar?.height ?? DEFAULT_WINDOW_TITLEBAR;
  const closeButton = {
    width: theme.dimensions.window_close_button_width ?? DEFAULT_CLOSE_BUTTON.width,
    height: theme.dimensions.window_close_button_height ?? DEFAULT_CLOSE_BUTTON.height,
    right: theme.dimensions.window_close_button_right ?? DEFAULT_CLOSE_BUTTON.right,
    top: theme.dimensions.window_close_button_top ?? DEFAULT_CLOSE_BUTTON.top,
  };
  const closeButtonX =
    theme.dimensions.window_close_button_left !== undefined
      ? theme.dimensions.window_close_button_left
      : undefined;
  const displayTitle = translateSource(title);
  const displayDescription = description ? translateSource(description) : undefined;
  const [localBounds, setLocalBounds] = useState(defaultBounds);
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
  const availableRight = available.x + availableWidth;
  const availableBottom = available.y + availableHeight;
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (!open) setMoved(false);
  }, [open]);

  const requested = controlledBounds ?? localBounds;
  const contentWidth = Math.max(MINIMUM_WIDTH, minSize.width, requested.width);
  const contentHeight = Math.max(MINIMUM_HEIGHT, minSize.height, requested.height);
  const width = Math.min(constrainToViewport ? availableWidth : Infinity, contentWidth);
  const height = Math.min(constrainToViewport ? availableHeight : Infinity, contentHeight);
  const bounds = { ...requested, width, height };
  if (centerOnOpen && !controlledBounds && !moved) {
    bounds.x = available.x + (Math.floor(availableWidth / 4) - Math.floor(contentWidth / 4)) * 2;
    bounds.y = available.y + (Math.floor(availableHeight / 4) - Math.floor(contentHeight / 4)) * 2;
  }
  bounds.x = Math.round(
    constrainToViewport
      ? Math.max(available.x, Math.min(availableRight - width, bounds.x))
      : bounds.x,
  );
  bounds.y = Math.round(
    constrainToViewport
      ? Math.max(available.y, Math.min(availableBottom - height, bounds.y))
      : bounds.y,
  );

  const clientBounds = {
    x: bounds.x + WINDOW_BORDER,
    y: bounds.y + WINDOW_TITLEBAR,
    width: Math.max(0, contentWidth - WINDOW_BORDER * 2),
    height: Math.max(0, contentHeight - WINDOW_TITLEBAR - WINDOW_BORDER),
  };
  const context = { bounds, clientBounds, viewport };
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const publish = (next: SurfaceBounds) => {
    setMoved(true);
    if (!controlledBounds) setLocalBounds(next);
    onBoundsChange?.(next);
  };

  const gesture = useWindowGesture({
    open,
    root,
    bounds,
    available,
    contentWidth,
    contentHeight,
    minimumWidth: MINIMUM_WIDTH,
    minimumHeight: MINIMUM_HEIGHT,
    minSize,
    border: WINDOW_BORDER,
    titlebar: WINDOW_TITLEBAR,
    constrainToViewport,
    autoFocus,
    onBoundsChange: publish,
  });
  const interaction = useOverlayInteraction({
    open,
    rootRef: root,
    autoFocus,
    escapeWithinRoot: true,
    onDismiss: () => {
      gesture.stop();
      onOpenChange(false);
    },
  });
  const clientLayoutBounds = {
    x: bounds.x + WINDOW_BORDER,
    y: bounds.y + WINDOW_TITLEBAR,
    width: Math.max(0, width - WINDOW_BORDER * 2),
    height: Math.max(0, height - WINDOW_TITLEBAR - WINDOW_BORDER),
  };
  const focusReveal = useSceneFocusReveal(bounds, clientLayoutBounds, viewport);

  useModalInputDismiss(root, open, modal);

  if (!open) return null;

  const zone = (
    edge: WindowGestureEdge,
    x: number,
    y: number,
    w: number,
    h: number,
    cursor: CSSProperties["cursor"],
  ) => (
    <div
      key={edge}
      aria-hidden="true"
      {...stylusPointerInputProps()}
      data-window-handle={edge}
      className={styles.handle}
      onPointerDown={(event) => gesture.start(event, edge)}
      style={{
        left: x * sx,
        top: y * sy,
        width: Math.max(0, w * sx),
        height: Math.max(0, h * sy),
        cursor: `var(--ui-cursor-${edge === WindowGestureEdge.Move ? "move" : `resize-${edge}`}, ${cursor})`,
      }}
    />
  );

  const chrome = (
    <>
      {movable &&
        zone(
          WindowGestureEdge.Move,
          WINDOW_BORDER,
          WINDOW_BORDER,
          width - WINDOW_BORDER * 2,
          WINDOW_TITLEBAR - WINDOW_BORDER,
          "default",
        )}
      {resizable && (
        <>
          {zone(
            WindowGestureEdge.North,
            WINDOW_BORDER,
            0,
            width - WINDOW_BORDER * 2,
            WINDOW_BORDER,
            "n-resize",
          )}
          {zone(
            WindowGestureEdge.South,
            WINDOW_BORDER,
            height - WINDOW_BORDER,
            width - WINDOW_BORDER * 2,
            WINDOW_BORDER,
            "s-resize",
          )}
          {zone(
            WindowGestureEdge.West,
            0,
            WINDOW_TITLEBAR,
            WINDOW_BORDER,
            height - WINDOW_TITLEBAR - WINDOW_BORDER,
            "w-resize",
          )}
          {zone(
            WindowGestureEdge.East,
            width - WINDOW_BORDER,
            WINDOW_TITLEBAR,
            WINDOW_BORDER,
            height - WINDOW_TITLEBAR - WINDOW_BORDER,
            "e-resize",
          )}
          {zone(WindowGestureEdge.NorthWest, 0, 0, WINDOW_BORDER, WINDOW_TITLEBAR, "nw-resize")}
          {zone(
            WindowGestureEdge.NorthEast,
            width - WINDOW_BORDER,
            0,
            WINDOW_BORDER,
            WINDOW_TITLEBAR,
            "ne-resize",
          )}
          {zone(
            WindowGestureEdge.SouthWest,
            0,
            height - WINDOW_BORDER,
            WINDOW_BORDER,
            WINDOW_BORDER,
            "sw-resize",
          )}
          {zone(
            WindowGestureEdge.SouthEast,
            width - WINDOW_BORDER,
            height - WINDOW_BORDER,
            WINDOW_BORDER,
            WINDOW_BORDER,
            "se-resize",
          )}
        </>
      )}
      {typeof titlebarActions === "function" ? titlebarActions(context) : titlebarActions}
      {showCloseButton && (
        <Button
          bounds={{
            x: bounds.x + (closeButtonX ?? width - closeButton.width - closeButton.right),
            y: bounds.y + closeButton.top,
            width: closeButton.width,
            height: closeButton.height,
          }}
          relativeTo={bounds}
          viewport={viewport}
          part="window_button_normal"
          hotPart="window_button_hot"
          pushedPart="window_button_selected"
          icon="window_close_icon"
          style={{ minWidth: 0, minHeight: 0, padding: 0 }}
          insetContent={false}
          aria-label={closeLabel ?? translateKey("ui.close.name").replace("{name}", displayTitle)}
          onClick={() => {
            gesture.stop();
            onOpenChange(false);
          }}
        />
      )}
    </>
  );

  const presentation: ScenePanelFrameProps = {
    skin: ScenePanelSkin.Window,
    bounds,
    clientBounds,
    clientLayoutBounds,
    viewport,
    label: displayTitle,
    clientOverflow: constrainToViewport ? "auto" : "hidden",
    contentLayout,
    viewportRef: focusReveal.viewportRef,
    children: typeof children === "function" ? children(context) : children,
  };
  return (
    <OverlayInteractionScope owner={interaction.owner}>
      <FloatingLayer
        kind={FloatingLayerKind.Window}
        bounds={bounds}
        viewport={viewport}
        relativeTo={relativeTo}
        className={className}
        onRootRef={(node) => {
          root.current = node;
          onRootRef?.(node);
        }}
        rootProps={{
          role: "dialog",
          "aria-modal": modal,
          "aria-label": displayTitle,
          "aria-description": displayDescription,
          tabIndex: -1,
          onFocusCapture: focusReveal.onFocusCapture,
          ...gesture.rootProps,
          onKeyDown: interaction.onKeyDown,
        }}
      >
        {renderFrame ? (
          renderFrame(presentation)
        ) : (
          <PanelFrame layout={PanelFrameLayout.Scene} {...presentation} />
        )}
        {chrome}
      </FloatingLayer>
    </OverlayInteractionScope>
  );
}
