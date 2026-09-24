import { UINT8_MAX, UINT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import {
  assertDimension,
  assertPixelBuffer,
  assertPixelCount,
  type EditorProject,
} from "$/document";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";

export const DEFAULT_IMPORTED_FRAME_DURATION_MS = 100;
export const MIN_IMPORTED_FRAME_DURATION_MS = 1;
export const MAX_IMPORTED_FRAME_DURATION_MS = UINT16_MAX;
export const MAX_IMPORTED_ANIMATION_FRAMES = 10_000;
/** Full composed frames are retained by the document, recents, and recovery. */
export const MAX_IMPORTED_ANIMATION_RGBA_BYTES = 128 * 1024 * 1024;
const RGBA_CHANNELS = 4;
const IMPORTED_LAYER_FLAGS = 3;

export interface RasterAnimationFrame {
  readonly pixels: PixelBuffer;
  readonly durationMs: number;
}

export interface RasterAnimation {
  /** Total complete plays; zero means infinite. */
  readonly loopCount?: number;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly RasterAnimationFrame[];
}

export function assertImportedFrameDuration(durationMs: number) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < MIN_IMPORTED_FRAME_DURATION_MS ||
    durationMs > MAX_IMPORTED_FRAME_DURATION_MS
  )
    throw new RangeError(
      `Imported frame duration must be between ${MIN_IMPORTED_FRAME_DURATION_MS} and ${MAX_IMPORTED_FRAME_DURATION_MS} ms`,
    );
}

/** Call before allocating any composed animation frames, including native decode paths. */
export function assertRasterAnimationCapacity(width: number, height: number, frameCount: number) {
  assertDimension(width, "Animation width");
  assertDimension(height, "Animation height");
  assertPixelCount(width, height, "Animation frame");
  if (!Number.isSafeInteger(frameCount) || frameCount < 1)
    throw new RangeError("An animation must contain at least one frame");
  if (
    frameCount > MAX_IMPORTED_ANIMATION_FRAMES ||
    width * height * RGBA_CHANNELS * frameCount > MAX_IMPORTED_ANIMATION_RGBA_BYTES
  ) {
    throw new RangeError(
      `Animation exceeds the import limit (${MAX_IMPORTED_ANIMATION_FRAMES} frames, ` +
        `${MAX_IMPORTED_ANIMATION_RGBA_BYTES / (1024 * 1024)} MiB of composed RGBA pixels)`,
    );
  }
}

/** Import a fully composed raster animation as editable, independent cels. */
export function rasterAnimationProject(animation: RasterAnimation): EditorProject {
  if (animation.loopCount !== undefined) assertAnimationLoopCount(animation.loopCount);
  assertRasterAnimationCapacity(animation.width, animation.height, animation.frames.length);
  for (const [index, frame] of animation.frames.entries()) {
    assertPixelBuffer(frame.pixels, `Animation frame ${index + 1}`);
    if (frame.pixels.width !== animation.width || frame.pixels.height !== animation.height)
      throw new RangeError(`Animation frame ${index + 1} does not match the canvas dimensions`);
    assertImportedFrameDuration(frame.durationMs);
  }
  return {
    image: animation.frames[0].pixels,
    timeline: {
      ...(animation.loopCount === undefined ? {} : { loopCount: animation.loopCount }),
      colorDepth: 32,
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        {
          id: "imported-animation-layer",
          name: "Layer 1",
          visible: true,
          locked: false,
          opacity: UINT8_MAX,
          flags: IMPORTED_LAYER_FLAGS,
        },
      ],
      frames: animation.frames.map(({ pixels, durationMs }) => ({
        duration: durationMs,
        cels: [{ pixels, x: 0, y: 0, opacity: UINT8_MAX, zIndex: 0 }],
      })),
    },
  };
}
