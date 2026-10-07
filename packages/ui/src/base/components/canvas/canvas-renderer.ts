import { UINT8_MAX } from "$/base/utils/numeric-constants";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface/geometry";

export interface CanvasPixelSource {
  readonly width: number;
  readonly height: number;
  /** Borrowed pixels: rendering never mutates or transfers their buffer. */
  readonly data: Uint8ClampedArray;
}
export interface SurfaceChecker {
  readonly cellSize: number;
  readonly light: readonly [number, number, number];
  readonly dark: readonly [number, number, number];
}
const RGBA_CHANNELS = 4;
const RGB_CHANNELS = 3;
const ALPHA_CHANNEL = 3;
/** Nearest-neighbor presentation preserves the source palette at every device ratio.
 * Layout remains CSS pixels; backing dimensions include DPR and external CSS scale. */
export class CanvasRenderer {
  readonly layout: ReturnType<typeof surfaceLayout>;
  pixelWidth: number;
  pixelHeight: number;
  private output: ImageData | null = null;
  private horizontal = new Int32Array(0);
  private vertical = new Int32Array(0);
  constructor(
    readonly bounds: SurfaceBounds,
    readonly viewport: SurfaceViewport = DEFAULT_SURFACE_VIEWPORT,
  ) {
    this.layout = surfaceLayout(bounds, viewport);
    this.pixelWidth = this.layout.width;
    this.pixelHeight = this.layout.height;
    this.configure();
  }
  setPixelRatio(x: number, y = x) {
    const width = Math.max(
      1,
      Math.round(this.layout.width * (Number.isFinite(x) && x > 0 ? x : 1)),
    );
    const height = Math.max(
      1,
      Math.round(this.layout.height * (Number.isFinite(y) && y > 0 ? y : 1)),
    );
    if (width === this.pixelWidth && height === this.pixelHeight) return;
    this.pixelWidth = width;
    this.pixelHeight = height;
    this.output = null;
    this.configure();
  }
  private configure() {
    this.horizontal = Int32Array.from({ length: this.pixelWidth }, (_, x) =>
      Math.floor(
        ((2 * this.layout.left * this.pixelWidth + (2 * x + 1) * this.layout.width) *
          this.viewport.sceneWidth -
          2 * this.pixelWidth * this.viewport.width * this.bounds.x) /
          (2 * this.pixelWidth * this.viewport.width),
      ),
    );
    this.vertical = Int32Array.from({ length: this.pixelHeight }, (_, y) =>
      Math.floor(
        ((2 * this.layout.top * this.pixelHeight + (2 * y + 1) * this.layout.height) *
          this.viewport.sceneHeight -
          2 * this.pixelHeight * this.viewport.height * this.bounds.y) /
          (2 * this.pixelHeight * this.viewport.height),
      ),
    );
  }
  /** Resolve a physical output pixel to the same source sample used by render. */
  sourcePoint(x: number, y: number): { x: number; y: number } {
    return { x: this.horizontal[x] ?? -1, y: this.vertical[y] ?? -1 };
  }
  /** Reuses the output until dimensions change. */
  render(source: CanvasPixelSource, checker?: SurfaceChecker): ImageData {
    this.output ??= new ImageData(this.pixelWidth, this.pixelHeight);
    const result = this.output.data;
    if (checker) return this.renderChecker(source, checker);
    const packed =
      source.data.byteOffset % 4 === 0
        ? new Uint32Array(source.data.buffer, source.data.byteOffset, source.data.byteLength / 4)
        : null;
    if (packed) {
      const destination = new Uint32Array(result.buffer);
      // Clear the destination once; only edge samples remain zero. The inner
      // loop can then stay branch-free for the valid source span.
      destination.fill(0);
      let xStart = 0;
      while (xStart < this.pixelWidth && this.horizontal[xStart] < 0) xStart++;
      let xEnd = this.pixelWidth;
      while (xEnd > xStart && this.horizontal[xEnd - 1] >= source.width) xEnd--;

      let previousSourceRow = -1;
      let previousTargetRow = -1;
      for (let y = 0; y < this.pixelHeight; y++) {
        const sy = this.vertical[y];
        if (sy < 0 || sy >= source.height) {
          previousSourceRow = -1;
          previousTargetRow = -1;
          continue;
        }
        const targetRow = y * this.pixelWidth;
        // Upscaled physical rows often sample the same scene row. Copy the
        // completed packed row rather than resolving every source pixel again.
        if (sy === previousSourceRow) {
          destination.copyWithin(targetRow, previousTargetRow, previousTargetRow + this.pixelWidth);
        } else {
          const sourceRow = sy * source.width;
          for (let x = xStart; x < xEnd; x++)
            destination[targetRow + x] = packed[sourceRow + this.horizontal[x]];
        }
        previousSourceRow = sy;
        previousTargetRow = targetRow;
      }
      return this.output;
    }

    for (let y = 0; y < this.pixelHeight; y++) {
      const sy = this.vertical[y];
      // Upscaled physical rows often sample the same scene row. Copy its exact
      // bytes rather than resolving every source pixel again.
      if (y > 0 && sy === this.vertical[y - 1]) {
        result.copyWithin(
          y * this.pixelWidth * 4,
          (y - 1) * this.pixelWidth * 4,
          y * this.pixelWidth * 4,
        );
        continue;
      }
      for (let x = 0; x < this.pixelWidth; x++) {
        const sx = this.horizontal[x],
          target = y * this.pixelWidth + x;
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) {
          result.fill(0, target * 4, target * 4 + 4);
        } else {
          const index = sy * source.width + sx;
          for (let c = 0; c < 4; c++) result[target * 4 + c] = source.data[index * 4 + c];
        }
      }
    }
    return this.output;
  }

  private renderChecker(source: CanvasPixelSource, checker: SurfaceChecker): ImageData {
    if (!Number.isSafeInteger(checker.cellSize) || checker.cellSize < 1)
      throw new RangeError("Checker cell size must be a positive integer.");
    const output = this.output!;
    const result = output.data;
    for (let y = 0; y < this.pixelHeight; y++) {
      const sy = this.vertical[y];
      const row = y * this.pixelWidth * RGBA_CHANNELS;
      if (y > 0 && sy === this.vertical[y - 1]) {
        result.copyWithin(row, row - this.pixelWidth * RGBA_CHANNELS, row);
        continue;
      }
      for (let x = 0; x < this.pixelWidth; x++) {
        const sx = this.horizontal[x];
        const target = row + x * RGBA_CHANNELS;
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) {
          result.fill(0, target, target + RGBA_CHANNELS);
          continue;
        }
        const offset = (sy * source.width + sx) * RGBA_CHANNELS;
        const alpha = source.data[offset + ALPHA_CHANNEL];
        if (alpha === UINT8_MAX) {
          for (let c = 0; c < RGBA_CHANNELS; c++) result[target + c] = source.data[offset + c];
          continue;
        }
        const background =
          (Math.floor((sx + this.bounds.x) / checker.cellSize) +
            Math.floor((sy + this.bounds.y) / checker.cellSize)) %
          2
            ? checker.light
            : checker.dark;
        for (let c = 0; c < RGB_CHANNELS; c++)
          result[target + c] = alpha
            ? Math.round(
                (source.data[offset + c] * alpha + background[c] * (UINT8_MAX - alpha)) / UINT8_MAX,
              )
            : background[c];
        result[target + ALPHA_CHANNEL] = UINT8_MAX;
      }
    }
    return output;
  }
}
