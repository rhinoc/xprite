import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import {
  computedStyle,
  displayPixelRatio,
  scrollSize,
  layoutSize,
  scrollPosition,
  setScrollPosition,
  clientRect,
  observeResize,
} from "$/base/utils/dom-geometry";
import { queueLayoutMeasurement, cancelLayoutMeasurement } from "$/base/utils/layout-measurements";
import {
  CanvasScaleProvider,
  usePresentationMetrics,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { Scrollbar } from "$/components/scrollbar/Scrollbar";

import styles from "$/components/scrollbar/scroll-area.module.css";

interface ScrollViewportProps extends HTMLAttributes<HTMLDivElement> {
  [attribute: `data-${string}`]: string | undefined;
}

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  scrollX?: boolean;
  scrollY?: boolean;
  viewport?: SurfaceViewport;
  viewportRef?: Ref<HTMLDivElement>;
  viewportProps?: ScrollViewportProps;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const ARTWORK_SCALE = 2;
const PIXEL_ALIGNMENT_EPSILON = 0.000001;
// CSS zoom can round a fitting content edge up by one layout pixel in WebKit.
const SCROLL_OVERFLOW_TOLERANCE = 1;
const INITIAL_METRICS = {
  width: 0,
  height: 0,
  contentWidth: 0,
  contentHeight: 0,
  left: 0,
  top: 0,
  horizontal: false,
  vertical: false,
};

/** DOM scrolling with the timeline's themed bars, shown only on overflowing axes. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    scrollX = true,
    scrollY = true,
    viewport = DEFAULT_SURFACE_VIEWPORT,
    viewportRef,
    viewportProps,
    contentClassName,
    contentStyle,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const { definition } = useTheme();
  const root = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const setViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node;
      if (typeof viewportRef === "function") viewportRef(node);
      else if (viewportRef) (viewportRef as { current: HTMLDivElement | null }).current = node;
    },
    [viewportRef],
  );
  const id = useId();
  const viewportId = viewportProps?.id ?? id;
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const presentation = usePresentationMetrics();
  const [pixelOffset, setPixelOffset] = useState({ x: 0, y: 0 });
  const pixelOffsetRef = useRef(pixelOffset);
  pixelOffsetRef.current = pixelOffset;
  const alignPixels = useCallback(() => {
    const host = root.current;
    const windowHost = host?.ownerDocument.defaultView;
    if (!host || !windowHost || style?.translate !== undefined) return;
    const rect = clientRect(host);
    const layout = computedStyle(host);
    const scaleX = rect.width / Number.parseFloat(layout.width);
    const scaleY = rect.height / Number.parseFloat(layout.height);
    if (!(scaleX > 0 && scaleY > 0)) return;
    const dpr = displayPixelRatio(windowHost) || 1;
    const sourceX = (rect.left - pixelOffsetRef.current.x * scaleX) * dpr;
    const sourceY = (rect.top - pixelOffsetRef.current.y * scaleY) * dpr;
    const x = (Math.round(sourceX) - sourceX) / (scaleX * dpr);
    const y = (Math.round(sourceY) - sourceY) / (scaleY * dpr);
    const next = {
      x: Math.abs(x) < PIXEL_ALIGNMENT_EPSILON ? 0 : x,
      y: Math.abs(y) < PIXEL_ALIGNMENT_EPSILON ? 0 : y,
    };
    setPixelOffset((current) =>
      Math.abs(current.x - next.x) < PIXEL_ALIGNMENT_EPSILON &&
      Math.abs(current.y - next.y) < PIXEL_ALIGNMENT_EPSILON
        ? current
        : next,
    );
  }, [style?.translate]);
  // Scroll content is composited as a surface. Snap that surface before snapping its children.
  useClientLayoutEffect(() => {
    const windowHost = root.current?.ownerDocument.defaultView;
    if (!windowHost) return;
    queueLayoutMeasurement(windowHost, alignPixels);
    return () => cancelLayoutMeasurement(windowHost, alignPixels);
  }, [alignPixels, presentation, style]);
  useClientLayoutEffect(() => {
    const host = root.current;
    const windowHost = host?.ownerDocument.defaultView;
    if (!host || !windowHost) return;
    const schedule = () => queueLayoutMeasurement(windowHost, alignPixels);
    const observer = observeResize([host], schedule);

    windowHost.addEventListener("resize", schedule);
    return () => {
      observer();
      windowHost.removeEventListener("resize", schedule);
      cancelLayoutMeasurement(windowHost, alignPixels);
    };
  }, [alignPixels, presentation]);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const verticalSize = definition.dimensions.mini_scrollbar_size * ARTWORK_SCALE * sx;
  const horizontalSize = definition.dimensions.mini_scrollbar_size * ARTWORK_SCALE * sy;

  const measure = useCallback(() => {
    const host = root.current;
    const node = scroller.current;
    if (!host || !node) return;
    const hostSize = layoutSize(host);
    // Hidden tabs retain their overflow geometry and native reading position.
    if (hostSize.width <= 0 || hostSize.height <= 0) return;
    const nodeSize = layoutSize(node);
    const contentSize = scrollSize(node);
    const position = scrollPosition(node);
    // Start with the full client size so a removed gutter cannot sustain itself.
    let horizontal = scrollX && contentSize.width > hostSize.width + SCROLL_OVERFLOW_TOLERANCE;
    let vertical = scrollY && contentSize.height > hostSize.height + SCROLL_OVERFLOW_TOLERANCE;
    horizontal ||=
      scrollX &&
      contentSize.width >
        hostSize.width - (vertical ? verticalSize : 0) + SCROLL_OVERFLOW_TOLERANCE;
    vertical ||=
      scrollY &&
      contentSize.height >
        hostSize.height - (horizontal ? horizontalSize : 0) + SCROLL_OVERFLOW_TOLERANCE;
    horizontal ||=
      scrollX &&
      contentSize.width >
        hostSize.width - (vertical ? verticalSize : 0) + SCROLL_OVERFLOW_TOLERANCE;
    const next = {
      width: nodeSize.width,
      height: nodeSize.height,
      contentWidth: contentSize.width,
      contentHeight: contentSize.height,
      left: position.x,
      top: position.y,
      horizontal,
      vertical,
    };
    setMetrics((current) =>
      Object.keys(next).every(
        (key) => current[key as keyof typeof next] === next[key as keyof typeof next],
      )
        ? current
        : next,
    );
  }, [scrollX, scrollY, verticalSize, horizontalSize]);

  const updateScroll = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const position = scrollPosition(node);
    setMetrics((current) =>
      current.left === position.x && current.top === position.y
        ? current
        : { ...current, left: position.x, top: position.y },
    );
  }, []);
  useClientLayoutEffect(() => {
    const host = root.current?.ownerDocument.defaultView;
    return () => {
      if (host) cancelLayoutMeasurement(host, updateScroll);
    };
  }, [updateScroll]);

  // Integer physical-pixel scrolling leaves artwork alignment unchanged.
  const physicalScale = presentation.scale * presentation.pixelRatio;
  const scrollPhase = (value: number) => {
    if (physicalScale <= 0) return 0;
    const phase = value * physicalScale - Math.round(value * physicalScale);
    return Math.abs(phase) < PIXEL_ALIGNMENT_EPSILON ? 0 : phase / physicalScale;
  };

  useClientLayoutEffect(() => {
    if (!scrollX && !scrollY) {
      setMetrics(INITIAL_METRICS);
      return;
    }
    const host = root.current;
    const node = scroller.current;
    const plane = content.current;
    if (!host || !node || !plane) return;
    const windowHost = host.ownerDocument.defaultView;
    if (!windowHost) return;
    const schedule = () => {
      queueLayoutMeasurement(windowHost, measure);
    };
    const resize = observeResize([host, node, plane], schedule);

    const mutation = new MutationObserver((records) => {
      const geometryChanged = records.some((record) => {
        if (record.type !== "attributes" || !(record.target instanceof SVGElement)) return true;
        const surface = record.target.closest(
          '[data-slot="theme-part"],[data-slot="theme-skin"],[data-slot="color-frame"]',
        );
        return !surface || surface === record.target;
      });
      if (geometryChanged) schedule();
    });
    mutation.observe(plane, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    plane.addEventListener("load", schedule, true);
    measure();
    return () => {
      cancelLayoutMeasurement(windowHost, measure);
      resize();
      mutation.disconnect();
      plane.removeEventListener("load", schedule, true);
    };
  }, [scrollX, scrollY, measure]);

  return (
    <CanvasScaleProvider pixelOffset={pixelOffset}>
      <div
        {...props}
        ref={setRootRef}
        className={cn(styles.root, className)}
        data-scroll-area=""
        data-slot="scroll-area"
        style={{
          ...style,
          translate: style?.translate ?? `${pixelOffset.x}px ${pixelOffset.y}px`,
          overflow: "clip",
          display: "grid",
          gap: 0,
          alignItems: "stretch",
          justifyItems: "stretch",
          gridTemplateColumns: `minmax(0, 1fr) ${metrics.vertical ? verticalSize : 0}px`,
          gridTemplateRows: `minmax(0, 1fr) ${metrics.horizontal ? horizontalSize : 0}px`,
        }}
      >
        <div
          {...viewportProps}
          id={viewportId}
          data-slot="scroll-viewport"
          ref={setViewportRef}
          className={cn(styles.viewport, viewportProps?.className)}
          style={{
            ...viewportProps?.style,
            overflowX: metrics.horizontal ? "auto" : "clip",
            overflowY: metrics.vertical ? "auto" : "clip",
            // Non-scrolling frames must still allow their nested scroll areas to pan.
            touchAction:
              metrics.horizontal && metrics.vertical
                ? "pan-x pan-y"
                : metrics.horizontal
                  ? "pan-x"
                  : metrics.vertical
                    ? "pan-y"
                    : "auto",
          }}
          onScroll={(event) => {
            const host = event.currentTarget.ownerDocument.defaultView;
            if ((scrollX || scrollY) && host) queueLayoutMeasurement(host, updateScroll);
            viewportProps?.onScroll?.(event);
          }}
        >
          <CanvasScaleProvider
            pixelOffset={{ x: -scrollPhase(metrics.left), y: -scrollPhase(metrics.top) }}
          >
            <div
              data-slot="scroll-content"
              ref={content}
              className={cn(styles.content, contentClassName)}
              style={contentStyle}
            >
              {children}
            </div>
          </CanvasScaleProvider>
        </div>
        {metrics.vertical && metrics.height > 0 && (
          <Scrollbar
            bounds={{ x: 0, y: 0, width: verticalSize / sx, height: metrics.height / sy }}
            viewport={viewport}
            style={{ left: "auto", right: 0 }}
            variant="mini"
            contentSize={metrics.contentHeight / sy}
            visibleSize={metrics.height / sy}
            value={metrics.top / sy}
            onValueChange={(value) => {
              if (scroller.current) {
                setScrollPosition(scroller.current, { y: value * sy });
                updateScroll();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerCancel={(event) => event.stopPropagation()}
            aria-controls={viewportId}
            aria-label={props["aria-label"] ?? viewportProps?.["aria-label"]}
          />
        )}
        {metrics.horizontal && metrics.width > 0 && (
          <Scrollbar
            bounds={{ x: 0, y: 0, width: metrics.width / sx, height: horizontalSize / sy }}
            viewport={viewport}
            style={{ top: "auto", bottom: 0 }}
            orientation="horizontal"
            variant="transparent"
            contentSize={metrics.contentWidth / sx}
            visibleSize={metrics.width / sx}
            value={metrics.left / sx}
            onValueChange={(value) => {
              if (scroller.current) {
                setScrollPosition(scroller.current, { x: value * sx });
                updateScroll();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerCancel={(event) => event.stopPropagation()}
            aria-controls={viewportId}
            aria-label={props["aria-label"] ?? viewportProps?.["aria-label"]}
          />
        )}
      </div>
    </CanvasScaleProvider>
  );
});
