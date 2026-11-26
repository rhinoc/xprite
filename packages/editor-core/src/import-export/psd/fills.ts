import { UINT8_MAX, type PixelBuffer, type Rgba } from "$/base";
import type {
  PsdGradientColorStop,
  PsdGradientFill,
  PsdGradientOpacityStop,
  PsdPattern,
  PsdPatternFill,
} from "$/import-export/psd/model";

const RGBA_CHANNELS = 4;
const DEG_TO_RAD = Math.PI / 180;
const EPSILON = 1e-6;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

function applyMidpoint(t: number, midpoint: number): number {
  const m = Math.max(0.05, Math.min(0.95, midpoint || 0.5));
  if (Math.abs(m - 0.5) < EPSILON) return t;
  if (t <= m) return 0.5 * (t / m);
  return 0.5 + 0.5 * ((t - m) / (1 - m));
}

export function sampleGradientColor(
  stops: readonly PsdGradientColorStop[],
  position: number,
): readonly [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return [stops[0].color[0], stops[0].color[1], stops[0].color[2]];
  const t = clamp01(position);
  if (t <= stops[0].location) return [stops[0].color[0], stops[0].color[1], stops[0].color[2]];
  const last = stops[stops.length - 1];
  if (t >= last.location) return [last.color[0], last.color[1], last.color[2]];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.location && t <= b.location) {
      const span = b.location - a.location;
      const local = span <= EPSILON ? 0 : (t - a.location) / span;
      const u = applyMidpoint(local, a.midpoint);
      return [
        clampByte(a.color[0] + (b.color[0] - a.color[0]) * u),
        clampByte(a.color[1] + (b.color[1] - a.color[1]) * u),
        clampByte(a.color[2] + (b.color[2] - a.color[2]) * u),
      ];
    }
  }
  return [last.color[0], last.color[1], last.color[2]];
}

function sampleGradientOpacity(stops: readonly PsdGradientOpacityStop[], position: number): number {
  if (stops.length === 0) return UINT8_MAX;
  if (stops.length === 1) return clampByte(stops[0].opacity * UINT8_MAX);
  const t = clamp01(position);
  if (t <= stops[0].location) return clampByte(stops[0].opacity * UINT8_MAX);
  const last = stops[stops.length - 1];
  if (t >= last.location) return clampByte(last.opacity * UINT8_MAX);

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.location && t <= b.location) {
      const span = b.location - a.location;
      const local = span <= EPSILON ? 0 : (t - a.location) / span;
      const u = applyMidpoint(local, a.midpoint);
      return clampByte((a.opacity + (b.opacity - a.opacity) * u) * UINT8_MAX);
    }
  }
  return clampByte(last.opacity * UINT8_MAX);
}

/** Renders a Photoshop gradient fill across `[0, width) × [0, height)`. */
export function rasterizeGradientFill(
  gradient: PsdGradientFill,
  width: number,
  height: number,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  const sortedColors = [...gradient.colorStops].sort((a, b) => a.location - b.location);
  const sortedOpacities = [...gradient.opacityStops].sort((a, b) => a.location - b.location);

  // Photoshop angles are counter-clockwise from +X (90° points up in screen coordinates, i.e. -Y).
  const rad = gradient.angle * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = -Math.sin(rad);
  const scale = Math.max(0.01, gradient.scale || 1);
  const cx = width * (0.5 + gradient.offsetX);
  const cy = height * (0.5 + gradient.offsetY);
  // Distance from center to bounding-box edge along the gradient axis.
  const halfExtent = Math.max(1, (Math.abs(cos) * width + Math.abs(sin) * height) * 0.5 * scale);
  const radialRadius = Math.max(1, Math.hypot(width, height) * 0.5 * scale);

  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx;
      let t: number;
      switch (gradient.style) {
        case "radial":
          t = Math.hypot(dx, dy) / radialRadius;
          break;
        case "reflected":
          t = Math.abs(dx * cos + dy * sin) / halfExtent;
          break;
        case "diamond": {
          const rx = dx * cos + dy * sin;
          const ry = -dx * sin + dy * cos;
          t = (Math.abs(rx) + Math.abs(ry)) / halfExtent;
          break;
        }
        case "angle": {
          const ang = Math.atan2(dy, dx) - Math.atan2(sin, cos);
          t = (((ang / (Math.PI * 2)) % 1) + 1) % 1;
          break;
        }
        case "linear":
        default:
          t = (dx * cos + dy * sin) / (halfExtent * 2) + 0.5;
          break;
      }
      t = clamp01(t);
      if (gradient.reverse) t = 1 - t;
      const [r, g, b] = sampleGradientColor(sortedColors, t);
      const a = sampleGradientOpacity(sortedOpacities, t);
      const offset = (y * width + x) * RGBA_CHANNELS;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { width, height, data };
}

/** Tiles a Photoshop pattern fill across `[0, width) × [0, height)` in document coordinates. */
export function rasterizePatternFill(
  patternFill: PsdPatternFill,
  patterns: ReadonlyMap<string, PsdPattern>,
  width: number,
  height: number,
  originX = 0,
  originY = 0,
): PixelBuffer | null {
  const pattern = patterns.get(patternFill.patternId);
  if (!pattern || pattern.pixels.width <= 0 || pattern.pixels.height <= 0) return null;
  const pw = pattern.pixels.width;
  const ph = pattern.pixels.height;
  const src = pattern.pixels.data;
  const scale = Math.max(0.01, patternFill.scale || 1);
  const invScale = 1 / scale;
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);

  const useBilinear = Math.abs(scale - 1) > 1e-4;
  for (let y = 0; y < height; y++) {
    const fy = (y + originY - patternFill.phaseY) * invScale;
    if (!useBilinear) {
      const py = ((Math.floor(fy) % ph) + ph) % ph;
      for (let x = 0; x < width; x++) {
        const px = ((Math.floor((x + originX - patternFill.phaseX) * invScale) % pw) + pw) % pw;
        const srcOffset = (py * pw + px) * RGBA_CHANNELS;
        const dstOffset = (y * width + x) * RGBA_CHANNELS;
        data[dstOffset] = src[srcOffset];
        data[dstOffset + 1] = src[srcOffset + 1];
        data[dstOffset + 2] = src[srcOffset + 2];
        data[dstOffset + 3] = src[srcOffset + 3];
      }
      continue;
    }
    const sy = fy - 0.5;
    const y0 = ((Math.floor(sy) % ph) + ph) % ph;
    const y1 = (y0 + 1) % ph;
    const wy = sy - Math.floor(sy);
    for (let x = 0; x < width; x++) {
      const sx = (x + originX - patternFill.phaseX) * invScale - 0.5;
      const x0 = ((Math.floor(sx) % pw) + pw) % pw;
      const x1 = (x0 + 1) % pw;
      const wx = sx - Math.floor(sx);
      const o00 = (y0 * pw + x0) * RGBA_CHANNELS;
      const o10 = (y0 * pw + x1) * RGBA_CHANNELS;
      const o01 = (y1 * pw + x0) * RGBA_CHANNELS;
      const o11 = (y1 * pw + x1) * RGBA_CHANNELS;
      const w00 = (1 - wx) * (1 - wy);
      const w10 = wx * (1 - wy);
      const w01 = (1 - wx) * wy;
      const w11 = wx * wy;
      const dstOffset = (y * width + x) * RGBA_CHANNELS;
      data[dstOffset] = clampByte(
        src[o00] * w00 + src[o10] * w10 + src[o01] * w01 + src[o11] * w11,
      );
      data[dstOffset + 1] = clampByte(
        src[o00 + 1] * w00 + src[o10 + 1] * w10 + src[o01 + 1] * w01 + src[o11 + 1] * w11,
      );
      data[dstOffset + 2] = clampByte(
        src[o00 + 2] * w00 + src[o10 + 2] * w10 + src[o01 + 2] * w01 + src[o11 + 2] * w11,
      );
      data[dstOffset + 3] = clampByte(
        src[o00 + 3] * w00 + src[o10 + 3] * w10 + src[o01 + 3] * w01 + src[o11 + 3] * w11,
      );
    }
  }
  return { width, height, data };
}

export function createSolidColorBuffer(width: number, height: number, color: Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  const [r, g, b, a] = color;
  for (let i = 0; i < data.length; i += RGBA_CHANNELS) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}
