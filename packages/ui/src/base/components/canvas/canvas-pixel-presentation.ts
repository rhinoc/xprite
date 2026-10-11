import {
  CanvasRenderer,
  type CanvasPixelSource,
  type SurfaceChecker,
} from "$/base/components/canvas/canvas-renderer";
import { clientRect, displayPixelRatio } from "$/base/utils/dom-geometry";

/** Keep backing dimensions in physical pixels while layout stays in CSS units. */
export function configureCanvasPresentation(
  target: HTMLCanvasElement,
  renderer: CanvasRenderer,
  rect = clientRect(target),
) {
  const pixelRatio = displayPixelRatio(target.ownerDocument.defaultView ?? window) || 1;
  renderer.setPixelRatio(
    (pixelRatio * rect.width) / renderer.layout.width,
    (pixelRatio * rect.height) / renderer.layout.height,
  );
  return pixelRatio;
}

/** Integer copies and fractional sampling share one pixel-center map. Pixel reads stay lazy. */
export function presentCanvasPixels(
  target: HTMLCanvasElement,
  renderer: CanvasRenderer,
  {
    source,
    width,
    height,
    readPixels,
    checker,
    croppedSource = false,
  }: {
    source?: HTMLCanvasElement | null;
    width: number;
    height: number;
    readPixels(): CanvasPixelSource;
    checker?: SurfaceChecker;
    /** The owner already clips its source canvas to integer scene pixels. */
    croppedSource?: boolean;
  },
): boolean {
  if (width <= 0 || height <= 0) return false;
  if (target.width !== renderer.pixelWidth) target.width = renderer.pixelWidth;
  if (target.height !== renderer.pixelHeight) target.height = renderer.pixelHeight;
  const context = target.getContext("2d");
  if (!context) return false;
  const { bounds, viewport, layout } = renderer;
  const aligned =
    (croppedSource || (bounds.width === width && bounds.height === height)) &&
    layout.left === (bounds.x * viewport.width) / viewport.sceneWidth &&
    layout.top === (bounds.y * viewport.height) / viewport.sceneHeight;
  if (
    source &&
    aligned &&
    Number.isInteger(target.width / width) &&
    Number.isInteger(target.height / height)
  ) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, target.width, target.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height, 0, 0, target.width, target.height);
  } else {
    context.putImageData(renderer.render(readPixels(), checker), 0, 0);
  }
  return true;
}
