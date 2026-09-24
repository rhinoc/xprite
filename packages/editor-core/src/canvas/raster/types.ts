import type { Brush, PixelBuffer, PixelMask, Point, Rect, Rgba } from "$/base/primitives";
import type { AsepriteInk } from "$/drawing/tool-settings";

export interface RasterOptions {
  indexedPixelWriter?: {
    resolve?: (x: number, y: number, color: Rgba) => Rgba;
    read: (x: number, y: number) => number | undefined;
    write: (x: number, y: number, color: Rgba, explicitIndex?: number) => boolean;
  };
  /** Destination palette used when an indexed image-brush sample is expanded. */
  destinationPalette?: readonly Rgba[];
  /** Mask index used by the current destination pixel format for image brushes. */
  destinationTransparentIndex?: number;
  symmetryIndex?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  shade?: readonly Rgba[];
  shadeDirection?: "left" | "right";
  /** Per-pointer displacement used by LibreSprite's Jumble Ink neighborhood. */
  jumbleOffset?: Point;
  patternOrigin?: Point;
  /** Per-stroke destination anchor for image brushes using destination alignment. */
  brushPatternOrigin?: Point;
  colorAt?: (x: number, y: number) => Rgba;
  sourcePixel?: (x: number, y: number) => Rgba;
  /** Optional pixel source used to find fill regions while pixels are written to `image`. */
  referenceImage?: PixelBuffer;
  tiled?: { mode: 0 | 1 | 2 | 3; width: number; height: number; origin: Point };
  ink?: AsepriteInk;
  color: Rgba;
  /** Background layers are opaque: erasing blends toward the active background color. */
  eraseColor?: Rgba;
  brush: Brush;
  opacity?: number;
  clip?: Rect;
  selection?: PixelMask;
  beforeWrite?: (rect: Rect) => void;
  coverage?: Set<number>;
}
