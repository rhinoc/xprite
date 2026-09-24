import { clientRect, clientScale } from "$/base/utils/dom-geometry";
import { UINT8_MAX } from "$/base/utils/numeric-constants";
import { RASTER_SCALE, CSS_PIXEL_SCALE, UI_SCALE } from "$/components/canvas-surface/metrics";
/** Generic global-grid sampling. All inputs are independently painted UI artwork. */
export interface SurfaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SurfaceViewport {
  sceneWidth: number;
  sceneHeight: number;
  width: number;
  height: number;
}
/** Unit mapping for raster artwork. This is not a reference screen extent. */
export const DEFAULT_SURFACE_VIEWPORT: SurfaceViewport = {
  sceneWidth: RASTER_SCALE,
  sceneHeight: RASTER_SCALE,
  width: UI_SCALE,
  height: UI_SCALE,
};
export const UI_SCALE_X = CSS_PIXEL_SCALE;
export const UI_SCALE_Y = CSS_PIXEL_SCALE;
/** Current scene extent at its existing bitmap scale. Resizing the editor
 * changes the workarea, never the size of its controls. */
export function sceneViewport(
  scene: HTMLElement | Pick<DOMRect, "width" | "height">,
  base: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
): SurfaceViewport {
  const element = typeof HTMLElement !== "undefined" && scene instanceof HTMLElement;
  const rect: Pick<DOMRect, "width" | "height"> = element
    ? clientRect(scene)
    : (scene as Pick<DOMRect, "width" | "height">);
  const scale = element ? clientScale(scene) : { x: 1, y: 1 };
  const sx = (base.width / base.sceneWidth) * scale.x;
  const sy = (base.height / base.sceneHeight) * scale.y;
  // The integer extent must never round outside the visible scene.
  const sceneWidth = Math.max(1, Math.floor(rect.width / sx + 1e-9));
  const sceneHeight = Math.max(1, Math.floor(rect.height / sy + 1e-9));
  return { sceneWidth, sceneHeight, width: sceneWidth * sx, height: sceneHeight * sy };
}
export function surfaceLayout(bounds: SurfaceBounds, viewport = DEFAULT_SURFACE_VIEWPORT) {
  const left = Math.floor((bounds.x * viewport.width) / viewport.sceneWidth);
  const top = Math.floor((bounds.y * viewport.height) / viewport.sceneHeight);
  return {
    left,
    top,
    width: Math.ceil(((bounds.x + bounds.width) * viewport.width) / viewport.sceneWidth) - left,
    height: Math.ceil(((bounds.y + bounds.height) * viewport.height) / viewport.sceneHeight) - top,
  };
}
type Kernel = { indices: number[]; weights: number[] };
function kernel(output: number, ratio: number, limit: number): Kernel {
  const center = (output + 0.5) * ratio;
  const support = Math.max(1, ratio);
  const start = Math.max(0, Math.floor(center - support + 0.5));
  const end = Math.min(limit, Math.floor(center + support + 0.5));
  const indices: number[] = [],
    weights: number[] = [];
  let sum = 0;
  for (let source = start; source < end; source++) {
    const weight = Math.max(0, 1 - Math.abs((source + 0.5 - center) / support));
    indices.push(source);
    weights.push(weight);
    sum += weight;
  }
  return {
    indices,
    weights: weights.map((value) => Math.floor((value / sum) * 4194304 + 0.5) / 4194304),
  };
}
const byte = (value: number) => Math.min(UINT8_MAX, Math.max(0, Math.floor(value + 0.5)));
/** Separable antialiased bilinear filtering with global pixel centers and premultiplied alpha.
 * Bounds should include any neighboring artwork needed by the filter; outside the surface is transparent.
 * Coefficients normalize against the full viewport, matching a single full-scene resize phase.
 */
export function resampleSurface(
  source: ImageData,
  bounds: SurfaceBounds,
  viewport = DEFAULT_SURFACE_VIEWPORT,
): ImageData {
  const layout = surfaceLayout(bounds, viewport);
  const horizontal = Array.from({ length: layout.width }, (_, i) =>
    kernel(layout.left + i, viewport.sceneWidth / viewport.width, viewport.sceneWidth),
  );
  const vertical = Array.from({ length: layout.height }, (_, i) =>
    kernel(layout.top + i, viewport.sceneHeight / viewport.height, viewport.sceneHeight),
  );
  const premultiplied = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    for (let c = 0; c < 3; c++)
      premultiplied[i + c] = byte((source.data[i + c] * alpha) / UINT8_MAX);
    premultiplied[i + 3] = alpha;
  }
  const intermediate = new Uint8ClampedArray(layout.width * source.height * 4);
  for (let y = 0; y < source.height; y++) {
    horizontal.forEach(({ indices, weights }, x) => {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        indices.forEach((index, k) => {
          const local = index - bounds.x;
          if (local >= 0 && local < source.width)
            sum += premultiplied[(y * source.width + local) * 4 + c] * weights[k];
        });
        intermediate[(y * layout.width + x) * 4 + c] = byte(sum);
      }
    });
  }
  const result = new ImageData(layout.width, layout.height);
  vertical.forEach(({ indices, weights }, y) => {
    for (let x = 0; x < layout.width; x++) {
      const offset = (y * layout.width + x) * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        indices.forEach((index, k) => {
          const local = index - bounds.y;
          if (local >= 0 && local < source.height)
            sum += intermediate[(local * layout.width + x) * 4 + c] * weights[k];
        });
        result.data[offset + c] = byte(sum);
      }
      const alpha = result.data[offset + 3];
      if (alpha)
        for (let c = 0; c < 3; c++)
          result.data[offset + c] = Math.min(
            UINT8_MAX,
            Math.floor((result.data[offset + c] * UINT8_MAX) / alpha),
          );
    }
  });
  return result;
}
