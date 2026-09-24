import { UINT8_MAX } from "$/base/numeric-constants";

export interface ColorCurvePoint {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_MEDIAN_SIZE = 3;
export const MAX_MEDIAN_SIZE = 100;
const CHANNEL_COUNT = UINT8_MAX + 1;

export enum ConvolutionPreset {
  Identity = "identity",
  BoxBlur = "box-blur",
  GaussianBlur = "gaussian-blur",
  Sharpen = "sharpen",
  EdgeDetect = "edge-detect",
  Emboss = "emboss",
  HorizontalEdges = "horizontal-edges",
  VerticalEdges = "vertical-edges",
}

export interface ConvolutionKernel {
  readonly width: number;
  readonly height: number;
  readonly weights: readonly number[];
  readonly divisor: number;
  readonly bias: number;
  readonly channels: number;
}

/** Standard mathematical kernels, authored independently of application resources. */
export const CONVOLUTION_KERNELS: Readonly<Record<ConvolutionPreset, ConvolutionKernel>> = {
  [ConvolutionPreset.Identity]: {
    width: 1,
    height: 1,
    weights: [1],
    divisor: 1,
    bias: 0,
    channels: 7,
  },
  [ConvolutionPreset.BoxBlur]: {
    width: 3,
    height: 3,
    weights: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    divisor: 9,
    bias: 0,
    channels: 15,
  },
  [ConvolutionPreset.GaussianBlur]: {
    width: 3,
    height: 3,
    weights: [1, 2, 1, 2, 4, 2, 1, 2, 1],
    divisor: 16,
    bias: 0,
    channels: 15,
  },
  [ConvolutionPreset.Sharpen]: {
    width: 3,
    height: 3,
    weights: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    divisor: 1,
    bias: 0,
    channels: 7,
  },
  [ConvolutionPreset.EdgeDetect]: {
    width: 3,
    height: 3,
    weights: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    divisor: 1,
    bias: 0,
    channels: 7,
  },
  [ConvolutionPreset.Emboss]: {
    width: 3,
    height: 3,
    weights: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    divisor: 1,
    bias: 128,
    channels: 7,
  },
  [ConvolutionPreset.HorizontalEdges]: {
    width: 3,
    height: 3,
    weights: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
    divisor: 1,
    bias: 128,
    channels: 7,
  },
  [ConvolutionPreset.VerticalEdges]: {
    width: 3,
    height: 3,
    weights: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    divisor: 1,
    bias: 128,
    channels: 7,
  },
};

export function convolutionKernel(preset: ConvolutionPreset): ConvolutionKernel {
  if (!Object.prototype.hasOwnProperty.call(CONVOLUTION_KERNELS, preset))
    throw new RangeError("Unknown convolution matrix preset");
  const kernel = CONVOLUTION_KERNELS[preset];
  if (!kernel) throw new RangeError("Unknown convolution matrix preset");
  return kernel;
}

const byte = (value: number) => Math.max(0, Math.min(UINT8_MAX, Math.trunc(value)));

/** Points have unique input values; outside the range the nearest endpoint is held. */
export function normalizeColorCurve(points: readonly ColorCurvePoint[]): ColorCurvePoint[] {
  if (!Array.isArray(points) || !points.length || points.length > CHANNEL_COUNT)
    throw new RangeError("A color curve must contain between 1 and 256 points");
  const values = new Map<number, number>();
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      throw new RangeError("Color curve points must have finite coordinates");
    values.set(byte(point.x), byte(point.y));
  }
  return [...values].sort(([left], [right]) => left - right).map(([x, y]) => ({ x, y }));
}

export function colorCurveMap(points: readonly ColorCurvePoint[]): Uint8Array {
  const sorted = normalizeColorCurve(points);
  const map = new Uint8Array(CHANNEL_COUNT);
  let segment = 0;
  for (let input = 0; input < map.length; input++) {
    while (segment + 1 < sorted.length && input > sorted[segment + 1].x) segment++;
    const left = sorted[segment];
    const right = sorted[segment + 1];
    map[input] =
      input <= left.x || !right
        ? left.y
        : byte(left.y + Math.trunc(((right.y - left.y) * (input - left.x)) / (right.x - left.x)));
  }
  return map;
}

function coordinate(value: number, size: number, wrap: boolean): number {
  return wrap ? ((value % size) + size) % size : Math.max(0, Math.min(size - 1, value));
}

type Samples = Uint8Array | Uint8ClampedArray;
type WritablePixel = (x: number, y: number) => boolean;

/** Sliding byte histograms use O(kernel height) work per move, without per-pixel sorting. */
export function medianSamples(
  source: Samples,
  width: number,
  height: number,
  stride: number,
  channels: readonly number[],
  kernelWidth: number,
  kernelHeight: number,
  tiledMode: number,
  writable: WritablePixel,
): Uint8ClampedArray {
  if (
    ![kernelWidth, kernelHeight].every(
      (size) => Number.isInteger(size) && size >= 1 && size <= MAX_MEDIAN_SIZE,
    )
  )
    throw new RangeError("Median neighborhood dimensions must be between 1 and 100");
  const output = new Uint8ClampedArray(source);
  const centerX = Math.floor(kernelWidth / 2);
  const centerY = Math.floor(kernelHeight / 2);
  const rank = Math.floor((kernelWidth * kernelHeight) / 2);
  const histogram = new Uint32Array(CHANNEL_COUNT);
  for (const channel of channels) {
    for (let y = 0; y < height; y++) {
      histogram.fill(0);
      let median = 0;
      let below = 0;
      const updateColumn = (column: number, delta: number) => {
        const sx = coordinate(column, width, !!(tiledMode & 1));
        for (let dy = -centerY; dy < kernelHeight - centerY; dy++) {
          const sy = coordinate(y + dy, height, !!(tiledMode & 2));
          const value = source[(sy * width + sx) * stride + channel];
          histogram[value] += delta;
          if (value < median) below += delta;
        }
      };
      for (let dx = -centerX; dx < kernelWidth - centerX; dx++) updateColumn(dx, 1);
      for (let x = 0; x < width; x++) {
        if (x) {
          updateColumn(x - centerX - 1, -1);
          updateColumn(x + kernelWidth - centerX - 1, 1);
        }
        while (below > rank) below -= histogram[--median];
        while (below + histogram[median] <= rank) below += histogram[median++];
        if (writable(x, y)) output[(y * width + x) * stride + channel] = median;
      }
    }
  }
  return output;
}

/** Transparent neighbors do not contaminate RGB; a zero effective divisor preserves the center. */
export function convolutionSamples(
  source: Samples,
  width: number,
  height: number,
  stride: number,
  channels: readonly number[],
  preset: ConvolutionPreset,
  tiledMode: number,
  writable: WritablePixel,
  transparent: (pixel: number) => boolean,
  options: {
    includeTransparentSamples?: boolean;
    kernelDivisorChannel?: number | null;
    useKernelDivisor?: boolean;
  } = {},
): Uint8ClampedArray {
  const kernel = convolutionKernel(preset);
  const output = new Uint8ClampedArray(source);
  if (!channels.length) return output;
  const kernelDivisorChannel =
    options.kernelDivisorChannel === undefined
      ? stride === 4
        ? 3
        : null
      : options.kernelDivisorChannel;
  const centerX = Math.floor(kernel.width / 2);
  const centerY = Math.floor(kernel.height / 2);
  const sums = new Float64Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!writable(x, y)) continue;
      sums.fill(0);
      let divisor = kernel.divisor;
      for (let ky = 0; ky < kernel.height; ky++) {
        const sy = coordinate(y + ky - centerY, height, !!(tiledMode & 2));
        for (let kx = 0; kx < kernel.width; kx++) {
          const weight = kernel.weights[ky * kernel.width + kx];
          if (!weight) continue;
          const sx = coordinate(x + kx - centerX, width, !!(tiledMode & 1));
          const pixel = sy * width + sx;
          const empty = transparent(pixel);
          if (empty) divisor -= weight;
          if (empty && !options.includeTransparentSamples) continue;
          for (const channel of channels)
            sums[channel] += source[pixel * stride + channel] * weight;
        }
      }
      if (!divisor) continue;
      for (const channel of channels) {
        const denominator =
          options.useKernelDivisor !== false && channel === kernelDivisorChannel
            ? kernel.divisor
            : divisor;
        output[(y * width + x) * stride + channel] = byte(
          Math.trunc(sums[channel] / denominator) + kernel.bias,
        );
      }
    }
  }
  return output;
}
