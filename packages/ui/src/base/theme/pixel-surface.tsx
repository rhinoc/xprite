import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "$/base/utils/cn";
import {
  computedStyle,
  layoutSize,
  displayPixelRatio,
  clientRect,
  observeElementSize,
  type ElementSize,
} from "$/base/utils/dom-geometry";
import { cancelLayoutMeasurement, queueLayoutMeasurement } from "$/base/utils/layout-measurements";
import { usePresentationMetrics } from "$/components/canvas-surface/presentation";

import styles from "$/base/theme/theme-part.module.css";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const DEFAULT_PIXEL_GRID = { x: 1, y: 1, offsetX: 0, offsetY: 0 };
const PIXEL_GRID_EPSILON = 0.000001;

function pixelFraction(value: number) {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) < PIXEL_GRID_EPSILON ? 0 : value - Math.floor(value);
}

export interface PixelSurfaceMetrics {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  cssPixelScale: { x: number; y: number };
}

/** Every skin uses one physical-pixel drawing plane, independently of UI scale or DPR. */
export function PixelSurface({
  paint,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  paint: (metrics: PixelSurfaceMetrics) => ReactNode;
}) {
  const presentation = usePresentationMetrics();
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [grid, setGrid] = useState(DEFAULT_PIXEL_GRID);
  useClientLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const update = (next: ElementSize) =>
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    const style = computedStyle(host);
    update({
      width: style ? Number.parseFloat(style.width) || 0 : layoutSize(host).width,
      height: style ? Number.parseFloat(style.height) || 0 : layoutSize(host).height,
    });
    return observeElementSize(host, update);
  }, []);
  useClientLayoutEffect(() => {
    const host = ref.current;
    const windowHost = host?.ownerDocument.defaultView;
    if (!host || !windowHost || size.width <= 0 || size.height <= 0 || presentation.scale <= 0)
      return;
    const measure = () => {
      const bounds = clientRect(host);
      const dpr = displayPixelRatio(windowHost) || 1;
      const next = {
        x: (bounds.width * dpr) / size.width,
        y: (bounds.height * dpr) / size.height,
        offsetX: pixelFraction(bounds.left * dpr),
        offsetY: pixelFraction(bounds.top * dpr),
      };
      if (next.x <= 0 || next.y <= 0) return;
      setGrid((current) =>
        Math.abs(current.x - next.x) < PIXEL_GRID_EPSILON &&
        Math.abs(current.y - next.y) < PIXEL_GRID_EPSILON &&
        Math.abs(current.offsetX - next.offsetX) < PIXEL_GRID_EPSILON &&
        Math.abs(current.offsetY - next.offsetY) < PIXEL_GRID_EPSILON
          ? current
          : next,
      );
    };
    // Measure after ancestor surfaces finish positioning to avoid synchronous feedback loops.
    queueLayoutMeasurement(windowHost, measure);
    return () => cancelLayoutMeasurement(windowHost, measure);
  }, [size.width, size.height, presentation, props.style, paint]);
  const metrics: PixelSurfaceMetrics = {
    // Adjacent skins must snap their shared edge the same way, including fractional origins.
    width: Math.max(0, Math.round(size.width * grid.x + grid.offsetX) - Math.round(grid.offsetX)),
    height: Math.max(0, Math.round(size.height * grid.y + grid.offsetY) - Math.round(grid.offsetY)),
    scaleX: grid.x,
    scaleY: grid.y,
    cssPixelScale: { x: 1 / grid.x, y: 1 / grid.y },
  };
  return (
    <span {...props} ref={ref} className={cn(styles.themePixelHost, className)}>
      <span
        aria-hidden="true"
        className={styles.themePixelSurface}
        style={{
          left: (Math.round(grid.offsetX) - grid.offsetX) / grid.x,
          top: (Math.round(grid.offsetY) - grid.offsetY) / grid.y,
          width: metrics.width / grid.x,
          height: metrics.height / grid.y,
        }}
      >
        {paint(metrics)}
      </span>
      {children}
    </span>
  );
}
