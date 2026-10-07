import {
  useLayoutEffect,
  useEffect,
  useRef,
  type CanvasHTMLAttributes,
  type DependencyList,
} from "react";

import { resizeCanvasBuffer } from "$/base/components/canvas/canvas-buffer";
import {
  queueCanvasPresentation,
  cancelCanvasPresentation,
} from "$/base/components/canvas/canvas-presentation";
import {
  CanvasRenderer,
  type CanvasPixelSource,
  type SurfaceChecker,
} from "$/base/components/canvas/canvas-renderer";
import { displayPixelRatio, observeResize } from "$/base/utils/dom-geometry";
import {
  DEFAULT_SURFACE_VIEWPORT,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface/geometry";
import { usePresentationMetrics } from "$/components/canvas-surface/presentation";
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface SurfaceProps extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "width" | "height"> {
  bounds: SurfaceBounds;
  viewport?: SurfaceViewport;
  /** Additional redraw dependencies, such as loaded image assets or selection state. */
  dependencies?: DependencyList;
}
export type { CanvasPixelSource, SurfaceChecker } from "$/base/components/canvas/canvas-renderer";
export type CanvasSurfaceProps = SurfaceProps &
  (
    | {
        /** Paint in global scene coordinates. Asset loading belongs to the caller. */
        paint: (context: CanvasRenderingContext2D) => void | Promise<void>;
        pixels?: never;
        checker?: never;
      }
    | {
        /** Immutable RGBA, sampled directly without a source canvas or readback. */
        pixels: CanvasPixelSource;
        checker?: SurfaceChecker;
        paint?: never;
      }
  );
/** Local UI artwork sampled in a shared scene coordinate grid. Positioning belongs to its parent. */
export function CanvasSurface({
  bounds,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  paint,
  pixels: pixelSource,
  checker,
  dependencies = [],
  style,
  ...props
}: CanvasSurfaceProps) {
  const { scale: presentationScale, pixelRatio } = usePresentationMetrics();
  const ref = useRef<HTMLCanvasElement>(null);
  const cached = useRef<{
    key: string;
    source: HTMLCanvasElement | null;
    context: CanvasRenderingContext2D | null;
    renderer: CanvasRenderer;
    busy: boolean;
  } | null>(null);
  const layout = surfaceLayout(bounds, viewport);
  useClientLayoutEffect(() => {
    const target = ref.current;
    if (!target || bounds.width <= 0 || bounds.height <= 0) return;
    const sourceWidth = Math.round(bounds.width);
    const sourceHeight = Math.round(bounds.height);
    const key = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      viewport.sceneWidth,
      viewport.sceneHeight,
      viewport.width,
      viewport.height,
    ].join(":");
    let surface = cached.current;
    if (
      !surface ||
      surface.busy ||
      (pixelSource ? surface.source !== null : surface.source === null)
    ) {
      const source = pixelSource ? null : document.createElement("canvas");
      if (source) resizeCanvasBuffer(source, sourceWidth, sourceHeight);
      const context = source?.getContext("2d", { willReadFrequently: true }) ?? null;
      if (source && !context) return;
      surface = {
        key,
        source,
        context,
        renderer: new CanvasRenderer(bounds, viewport),
        busy: false,
      };
      cached.current = surface;
    } else if (surface.key !== key) {
      // Resize the existing software surface instead of discarding its canvas
      // and context at every splitter movement. Busy async painters still own
      // isolated surfaces and can never overwrite this replacement.
      if (surface.source) resizeCanvasBuffer(surface.source, sourceWidth, sourceHeight);
      surface.key = key;
      surface.renderer = new CanvasRenderer(bounds, viewport);
    }
    const { source, context, renderer } = surface;
    // Reuse software surfaces and the physical output buffer across animation
    // frames. An unresolved async painter gets its own surface, preventing races.
    surface.busy = true;
    if (context && typeof context.reset === "function") context.reset();
    // Setting the canvas width clears its drawing state on browsers without context.reset().
    // oxlint-disable-next-line eslint/no-self-assign -- This self-assignment intentionally resets the canvas.
    else if (source) source.width = source.width;
    if (context) {
      context.imageSmoothingEnabled = false;
      context.translate(-bounds.x, -bounds.y);
    }
    let cancelled = false;
    let painted = false;
    let pixels: ImageData | undefined;
    let presentedWidth = 0;
    let presentedHeight = 0;
    let frame = 0;
    const present = (rect: DOMRect) => {
      if (cancelled || !painted) return;
      renderer.setPixelRatio(
        (displayPixelRatio(window) * rect.width) / layout.width,
        (displayPixelRatio(window) * rect.height) / layout.height,
      );
      if (
        presentedWidth === renderer.pixelWidth &&
        presentedHeight === renderer.pixelHeight &&
        target.width === renderer.pixelWidth &&
        target.height === renderer.pixelHeight
      )
        return;
      if (target.width !== renderer.pixelWidth) target.width = renderer.pixelWidth;
      if (target.height !== renderer.pixelHeight) target.height = renderer.pixelHeight;
      const presentation = target.getContext("2d");
      if (!presentation) return;
      // Aligned integer copies have exactly the same pixel-center map as the
      // software sampler. Present them without reading and expanding every pixel.
      if (
        source &&
        bounds.width === sourceWidth &&
        bounds.height === sourceHeight &&
        Number.isInteger(target.width / sourceWidth) &&
        Number.isInteger(target.height / sourceHeight) &&
        layout.left === (bounds.x * viewport.width) / viewport.sceneWidth &&
        layout.top === (bounds.y * viewport.height) / viewport.sceneHeight
      ) {
        presentation.setTransform(1, 0, 0, 1, 0, 0);
        presentation.clearRect(0, 0, target.width, target.height);
        presentation.imageSmoothingEnabled = false;
        presentation.drawImage(
          source,
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          target.width,
          target.height,
        );
      } else {
        const samples =
          pixelSource ?? (pixels ??= context!.getImageData(0, 0, sourceWidth, sourceHeight));
        presentation.putImageData(renderer.render(samples, checker), 0, 0);
      }
      presentedWidth = target.width;
      presentedHeight = target.height;
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => queueCanvasPresentation(target, present));
    };
    const observer = observeResize([target], resize);

    window.addEventListener("resize", resize);
    const finish = () => {
      surface.busy = false;
      if (cancelled) return;
      painted = true;
      queueCanvasPresentation(target, present);
    };
    const result = paint && context ? paint(context) : undefined;
    if (result)
      void result.then(finish, (error) => {
        surface.busy = false;
        if (!cancelled) console.error(error);
      });
    else finish();
    return () => {
      cancelled = true;
      cancelCanvasPresentation(target, present);
      observer();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [
    presentationScale,
    pixelRatio,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    viewport.sceneWidth,
    viewport.sceneHeight,
    viewport.width,
    viewport.height,
    paint,
    pixelSource,
    checker,
    ...dependencies,
  ]);
  return (
    <canvas
      {...props}
      ref={ref}
      width={typeof window === "undefined" ? layout.width : undefined}
      height={typeof window === "undefined" ? layout.height : undefined}
      data-ui-x={bounds.x}
      data-ui-y={bounds.y}
      style={{
        width: layout.width,
        height: layout.height,
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
