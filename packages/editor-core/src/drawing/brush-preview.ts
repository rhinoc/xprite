import type { BrushImage } from "$/base/primitives";
import { isValidBrushImage, rasterizeBrushShape } from "$/canvas/raster";
/** Integer brush raster from the MIT-licensed doc/brush.cpp and doc/algo.cpp.
 * This is the popup thumbnail, including the nine-pixel clamp/crop. */
export type AsepriteBrushShape = "circle" | "square" | "line" | "image";
export interface AsepriteBrushValue {
  shape: AsepriteBrushShape;
  size: number;
  angle: number;
  image?: BrushImage;
}
const MAX_ASEPRITE_BRUSH_PREVIEW_SIZE = 9;
const ASEPRITE_BRUSH_PREVIEW_ELLIPSE_EXTRA_OFFSET_SIZES = [8] as const;

export function asepriteBrushMask(brush: AsepriteBrushValue): {
  width: number;
  height: number;
  pixels: readonly number[];
} {
  if (brush.shape === "image") {
    const image = brush.image;
    if (!isValidBrushImage(image)) return { width: 1, height: 1, pixels: [0] };
    const width = Math.min(MAX_ASEPRITE_BRUSH_PREVIEW_SIZE, image.width),
      height = Math.min(MAX_ASEPRITE_BRUSH_PREVIEW_SIZE, image.height);
    const anchorX =
      image.anchor && Number.isFinite(image.anchor.x)
        ? Math.max(0, Math.min(image.width - 1, Math.trunc(image.anchor.x)))
        : Math.floor(image.width / 2);
    const anchorY =
      image.anchor && Number.isFinite(image.anchor.y)
        ? Math.max(0, Math.min(image.height - 1, Math.trunc(image.anchor.y)))
        : Math.floor(image.height / 2);
    const left = Math.max(0, Math.min(image.width - width, anchorX - Math.trunc(width / 2)));
    const top = Math.max(0, Math.min(image.height - height, anchorY - Math.trunc(height / 2)));
    return {
      width,
      height,
      pixels: Array.from({ length: width * height }, (_, i) => {
        const x = left + (i % width),
          y = top + Math.trunc(i / width);
        const source = y * image.width + x;
        return image.mask?.length === image.width * image.height
          ? image.mask[source]
            ? 1
            : 0
          : image.data[source * 4 + 3] > 0
            ? 1
            : 0;
      }),
    };
  }
  const { extent, bitmap } = rasterizeBrushShape(brush.shape, brush.size, brush.angle, {
    maxSize: MAX_ASEPRITE_BRUSH_PREVIEW_SIZE,
    ellipseExtraOffsetSizes: ASEPRITE_BRUSH_PREVIEW_ELLIPSE_EXTRA_OFFSET_SIZES,
  });
  const width = Math.min(MAX_ASEPRITE_BRUSH_PREVIEW_SIZE, extent),
    offset = Math.trunc((width - extent - 1) / 2);
  return {
    width,
    height: width,
    pixels: Array.from(
      { length: width * width },
      (_, i) => bitmap[(Math.trunc(i / width) - offset) * extent + (i % width) - offset],
    ),
  };
}
