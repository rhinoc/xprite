import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { PointerDragActivation, PointerDragAxis } from "$/base/utils/pointer-drag-activation";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { Button } from "$/components/button";
import {
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { DIALOG_EDITABLE_SELECTOR, focusDialogContainer } from "$/components/window/focus";
import { windowMetrics } from "$/components/window/metrics";
import { OverlayFrame, OverlayContentLayout } from "$/components/window/overlay-frame";
import { useVisibleSceneBounds } from "$/components/window/visible-scene-bounds";

import styles from "$/components/window/overlay.module.css";

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
  moveable?: boolean;
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
}

type Edge = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Gesture = {
  pointer: number;
  activation: PointerDragActivation;
  edge: Edge;
  x: number;
  y: number;
  bounds: SurfaceBounds;
  sx: number;
  sy: number;
  node: HTMLElement;
};

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
  moveable = true,
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
  const gesture = useRef<Gesture | null>(null);
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
  const stop = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.node.hasPointerCapture(active.pointer))
      active.node.releasePointerCapture(active.pointer);
  }, []);

  useEffect(() => {
    window.addEventListener("blur", stop);
    if (!open) stop();
    return () => {
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [open, stop]);

  useEffect(() => {
    stop();
  }, [available.x, available.y, availableWidth, availableHeight, stop]);

  useEffect(() => {
    if (open && autoFocus) root.current?.focus({ preventScroll: true });
  }, [open, autoFocus]);

  useEffect(() => {
    const document = root.current?.ownerDocument;
    if (!open || !modal || !document) return;
    const dismissInput = (event: PointerEvent) => {
      const active = document.activeElement;
      if (
        event.button === 0 &&
        event.isPrimary &&
        active instanceof HTMLElement &&
        root.current?.contains(active) &&
        active.matches(DIALOG_EDITABLE_SELECTOR) &&
        event.target instanceof Element &&
        !event.target.closest(DIALOG_EDITABLE_SELECTOR)
      )
        focusDialogContainer(root.current);
    };
    document.addEventListener("pointerdown", dismissInput, true);
    return () => document.removeEventListener("pointerdown", dismissInput, true);
  }, [open, modal]);

  const publish = (next: SurfaceBounds) => {
    setMoved(true);
    if (!controlledBounds) setLocalBounds(next);
    onBoundsChange?.(next);
  };

  const start = (event: ReactPointerEvent<HTMLElement>, edge: Edge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stop();
    if (autoFocus) root.current?.focus({ preventScroll: true });
    const rect = clientRect(root.current!);
    gesture.current = {
      pointer: event.pointerId,
      activation: new PointerDragActivation(
        event,
        edge === "e" || edge === "w"
          ? PointerDragAxis.Horizontal
          : edge === "n" || edge === "s"
            ? PointerDragAxis.Vertical
            : PointerDragAxis.Both,
      ),
      edge,
      x: clientPoint(event).x,
      y: clientPoint(event).y,
      bounds: { ...bounds },
      sx: rect.width / bounds.width,
      sy: rect.height / bounds.height,
      node: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!active.activation.update(event)) return;
    const dx = Math.round((clientPoint(event).x - active.x) / active.sx);
    const dy = Math.round((clientPoint(event).y - active.y) / active.sy);
    const b = active.bounds;
    if (active.edge === "move") {
      publish({
        ...b,
        width: contentWidth,
        height: contentHeight,
        x: Math.max(
          available.x + (constrainToViewport ? 0 : WINDOW_BORDER - b.width),
          Math.min(availableRight - (constrainToViewport ? b.width : WINDOW_BORDER), b.x + dx),
        ),
        y: Math.max(
          available.y,
          Math.min(availableBottom - (constrainToViewport ? b.height : WINDOW_TITLEBAR), b.y + dy),
        ),
      });
      return;
    }
    const minimumWidth = Math.min(
      constrainToViewport ? availableWidth : Infinity,
      Math.max(MINIMUM_WIDTH, minSize.width),
    );
    const minimumHeight = Math.min(
      constrainToViewport ? availableHeight : Infinity,
      Math.max(MINIMUM_HEIGHT, minSize.height),
    );
    let left = b.x;
    let top = b.y;
    let right = b.x + b.width;
    let bottom = b.y + b.height;
    if (active.edge.includes("w"))
      left = Math.max(
        constrainToViewport ? available.x : -Infinity,
        Math.min(right - minimumWidth, left + dx),
      );
    if (active.edge.includes("e"))
      right = Math.min(
        constrainToViewport ? availableRight : Infinity,
        Math.max(left + minimumWidth, right + dx),
      );
    if (active.edge.includes("n"))
      top = Math.max(
        constrainToViewport ? available.y : -Infinity,
        Math.min(bottom - minimumHeight, top + dy),
      );
    if (active.edge.includes("s"))
      bottom = Math.min(
        constrainToViewport ? availableBottom : Infinity,
        Math.max(top + minimumHeight, bottom + dy),
      );
    publish({ x: left, y: top, width: right - left, height: bottom - top });
  };

  if (!open) return null;

  const zone = (
    edge: Edge,
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
      onPointerDown={(event) => start(event, edge)}
      style={{
        left: x * sx,
        top: y * sy,
        width: Math.max(0, w * sx),
        height: Math.max(0, h * sy),
        cursor: `var(--ui-cursor-${edge === "move" ? "move" : `resize-${edge}`}, ${cursor})`,
      }}
    />
  );

  const chrome = (
    <>
      {moveable &&
        zone(
          "move",
          WINDOW_BORDER,
          WINDOW_BORDER,
          width - WINDOW_BORDER * 2,
          WINDOW_TITLEBAR - WINDOW_BORDER,
          "default",
        )}
      {resizable && (
        <>
          {zone("n", WINDOW_BORDER, 0, width - WINDOW_BORDER * 2, WINDOW_BORDER, "n-resize")}
          {zone(
            "s",
            WINDOW_BORDER,
            height - WINDOW_BORDER,
            width - WINDOW_BORDER * 2,
            WINDOW_BORDER,
            "s-resize",
          )}
          {zone(
            "w",
            0,
            WINDOW_TITLEBAR,
            WINDOW_BORDER,
            height - WINDOW_TITLEBAR - WINDOW_BORDER,
            "w-resize",
          )}
          {zone(
            "e",
            width - WINDOW_BORDER,
            WINDOW_TITLEBAR,
            WINDOW_BORDER,
            height - WINDOW_TITLEBAR - WINDOW_BORDER,
            "e-resize",
          )}
          {zone("nw", 0, 0, WINDOW_BORDER, WINDOW_TITLEBAR, "nw-resize")}
          {zone("ne", width - WINDOW_BORDER, 0, WINDOW_BORDER, WINDOW_TITLEBAR, "ne-resize")}
          {zone("sw", 0, height - WINDOW_BORDER, WINDOW_BORDER, WINDOW_BORDER, "sw-resize")}
          {zone(
            "se",
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
            stop();
            onOpenChange(false);
          }}
        />
      )}
    </>
  );

  return (
    <OverlayFrame
      variant="window"
      bounds={bounds}
      clientBounds={clientBounds}
      clientLayoutBounds={{
        x: bounds.x + WINDOW_BORDER,
        y: bounds.y + WINDOW_TITLEBAR,
        width: Math.max(0, width - WINDOW_BORDER * 2),
        height: Math.max(0, height - WINDOW_TITLEBAR - WINDOW_BORDER),
      }}
      viewport={viewport}
      relativeTo={relativeTo}
      label={displayTitle}
      description={displayDescription}
      modal={modal}
      className={className}
      clientOverflow={constrainToViewport ? "auto" : "hidden"}
      contentLayout={contentLayout}
      onRootRef={(node) => {
        root.current = node;
        onRootRef?.(node);
      }}
      rootProps={{
        onPointerMove: move,
        onPointerUp: (event) => {
          if (gesture.current?.pointer === event.pointerId) {
            move(event);
            stop();
          }
        },
        onPointerCancel: stop,
        onLostPointerCapture: stop,
        onKeyDown: (event) => {
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (event.key === "Escape" && event.currentTarget.contains(event.target as Node)) {
            event.preventDefault();
            event.stopPropagation();
            stop();
            onOpenChange(false);
          }
        },
      }}
      chrome={chrome}
    >
      {typeof children === "function" ? children(context) : children}
    </OverlayFrame>
  );
}
