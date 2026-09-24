import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { layoutSize, scrollBy, clientRect } from "$/base/utils/dom-geometry";
import { cancelLayoutMeasurement, queueLayoutMeasurement } from "$/base/utils/layout-measurements";
import {
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { ScrollArea } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/window/overlay.module.css";

export enum OverlayContentLayout {
  Positioned = "positioned",
  Flow = "flow",
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface OverlayFrameProps {
  variant: "window" | "popup";
  bounds: SurfaceBounds;
  clientBounds: SurfaceBounds;
  clientLayoutBounds?: SurfaceBounds;
  viewport: SurfaceViewport;
  relativeTo?: { x: number; y: number };
  label: string;
  description?: string;
  modal?: boolean;
  className?: string;
  clientOverflow?: CSSProperties["overflow"];
  contentLayout?: OverlayContentLayout;
  scrollX?: boolean;
  scrollY?: boolean;
  onRootRef?: (node: HTMLDivElement | null) => void;
  rootProps?: HTMLAttributes<HTMLDivElement>;
  chrome?: ReactNode;
  children?: ReactNode;
}

/** Shared theme frame, scene placement, and client plane for rendered overlays. */
export function OverlayFrame({
  variant,
  bounds,
  clientBounds,
  clientLayoutBounds = clientBounds,
  viewport,
  relativeTo = { x: 0, y: 0 },
  label,
  description,
  modal = false,
  className,
  clientOverflow = variant === "popup" ? "auto" : "hidden",
  contentLayout = OverlayContentLayout.Positioned,
  scrollX,
  scrollY,
  onRootRef,
  rootProps,
  chrome,
  children,
}: OverlayFrameProps) {
  const { definition: theme } = useTheme();
  const layout = surfaceLayout(bounds, viewport);
  const clientLayout = surfaceLayout(clientLayoutBounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const isWindow = variant === "window";
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

  return (
    <div
      {...rootProps}
      ref={onRootRef}
      role="dialog"
      aria-modal={modal}
      aria-label={label}
      aria-description={description}
      tabIndex={-1}
      className={cn(isWindow ? styles.window : styles.popup, className)}
      data-overlay={variant}
      data-slot="overlay"
      data-floating-window={isWindow ? "" : undefined}
      data-popup={!isWindow ? "" : undefined}
      style={{
        ...rootProps?.style,
        left: layout.left - Math.floor(relativeTo.x * sx),
        top: layout.top - Math.floor(relativeTo.y * sy),
        width: layout.width,
        height: layout.height,
      }}
      onFocusCapture={(event) => {
        rootProps?.onFocusCapture?.(event);
        scheduleRevealFocus();
      }}
    >
      <span aria-hidden="true" className={styles.artwork}>
        <span
          className={styles.artworkScale}
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
          }}
        >
          <ThemePart
            part={isWindow ? "window" : "menu"}
            scale={2}
            drawCenter={isWindow}
            className={styles.skin}
            style={{
              position: "absolute",
              inset: 0,
              width: bounds.width,
              height: bounds.height,
              background: theme.colors.window_face,
            }}
          />
          {isWindow && (
            <span className={styles.title}>
              <Text
                variant={TextVariant.PositionedPixel}
                text={label}
                x={0}
                y={0}
                color={theme.colors.window_titlebar_text}
              />
            </span>
          )}
        </span>
      </span>
      <ScrollArea
        className={styles.client}
        aria-label={label}
        viewport={viewport}
        viewportRef={scroller}
        contentClassName={
          contentLayout === OverlayContentLayout.Positioned ? styles.contentPlane : undefined
        }
        contentStyle={
          contentLayout === OverlayContentLayout.Positioned
            ? {
                width: clientBounds.width * sx,
                height: clientBounds.height * sy,
                minWidth: 0,
                minHeight: 0,
              }
            : undefined
        }
        scrollX={scrollX ?? (clientOverflow === "auto" || clientOverflow === "scroll")}
        scrollY={scrollY ?? (clientOverflow === "auto" || clientOverflow === "scroll")}
        viewportProps={{
          "data-window-client": isWindow ? "" : undefined,
          "data-ui-window-client": !isWindow ? "" : undefined,
        }}
        style={{
          left: clientLayout.left - layout.left,
          top: clientLayout.top - layout.top,
          width: clientLayout.width,
          height: clientLayout.height,
        }}
      >
        {contentLayout === OverlayContentLayout.Flow ? (
          <div className={styles.contentPlane} style={{ width: "100%" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </ScrollArea>
      {chrome}
    </div>
  );
}
