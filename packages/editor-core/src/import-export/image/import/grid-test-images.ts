import type { PixelBuffer } from "$/base/primitives";

/** Deterministic synthetic images shared by the grid detection tests. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function blank(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
const PALETTE = [
  [86, 40, 90],
  [232, 232, 240],
  [30, 30, 40],
  [200, 60, 50],
  [240, 190, 70],
  [70, 120, 200],
  [60, 170, 90],
  [140, 100, 70],
  [250, 140, 160],
  [110, 110, 130],
  [20, 200, 220],
  [180, 180, 60],
] as const;
/** A flat-coloured blocky sprite: background, then overlapping rectangles and ellipses. */
export function sprite(size: number, seed = 7): PixelBuffer {
  const random = rng(seed);
  const image = blank(size, size);
  const paint = (x: number, y: number, color: readonly number[]) => {
    const o = (y * size + x) * 4;
    image.data[o] = color[0];
    image.data[o + 1] = color[1];
    image.data[o + 2] = color[2];
    image.data[o + 3] = 255;
  };
  for (let i = 0; i < size * size; i++) paint(i % size, Math.floor(i / size), PALETTE[0]);
  for (let shape = 0; shape < 40; shape++) {
    const color = PALETTE[1 + Math.floor(random() * (PALETTE.length - 1))];
    const w = 3 + Math.floor(random() * size * 0.3),
      h = 3 + Math.floor(random() * size * 0.3);
    const x0 = Math.floor(random() * (size - w)),
      y0 = Math.floor(random() * (size - h));
    const round = random() < 0.5;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (round) {
          const dx = (x - x0 + 0.5) / w - 0.5,
            dy = (y - y0 + 0.5) / h - 0.5;
          if (dx * dx + dy * dy > 0.25) continue;
        }
        paint(x, y, color);
      }
  }
  return image;
}
export function checkerboard(cell: number, cells: number): PixelBuffer {
  const size = cell * cells;
  const image = blank(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 255 : 0;
      image.data[o] = image.data[o + 1] = image.data[o + 2] = v;
      image.data[o + 3] = 255;
    }
  return image;
}
/** Nearest-neighbour upscale by a possibly fractional factor. */
export function upscaleNearest(source: PixelBuffer, fx: number, fy = fx): PixelBuffer {
  const out = blank(Math.round(source.width * fx), Math.round(source.height * fy));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(x / fx)),
        sy = Math.min(source.height - 1, Math.floor(y / fy));
      for (let c = 0; c < 4; c++)
        out.data[(y * out.width + x) * 4 + c] = source.data[(sy * source.width + sx) * 4 + c];
    }
  return out;
}
export function upscaleBilinear(source: PixelBuffer, scale: number): PixelBuffer {
  const out = blank(source.width * scale, source.height * scale);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const sx = x / scale,
        sy = y / scale;
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const x1 = Math.min(source.width - 1, x0 + 1),
        y1 = Math.min(source.height - 1, y0 + 1);
      const fx = sx - x0,
        fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const g = (xx: number, yy: number) => source.data[(yy * source.width + xx) * 4 + c];
        out.data[(y * out.width + x) * 4 + c] =
          (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) +
          (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
      }
    }
  return out;
}
/** Separable box blur with the given radius (radius 1 smears each edge over about 3 pixels). */
export function boxBlur(source: PixelBuffer, radius: number): PixelBuffer {
  const { width, height } = source;
  const pass = (input: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(input.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 4; c++) {
          let sum = 0,
            n = 0;
          for (let d = -radius; d <= radius; d++) {
            const xx = horizontal ? x + d : x,
              yy = horizontal ? y : y + d;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += input[(yy * width + xx) * 4 + c];
            n++;
          }
          out[(y * width + x) * 4 + c] = sum / n;
        }
    return out;
  };
  return { width, height, data: pass(pass(source.data, true), false) };
}
export function gradient(width: number, height: number): PixelBuffer {
  const image = blank(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      image.data[o] = (x / width) * 255;
      image.data[o + 1] = (y / height) * 255;
      image.data[o + 2] = 128;
      image.data[o + 3] = 255;
    }
  return image;
}
/** Smooth, photo-like colour field: low-frequency waves plus a few soft blobs, no hard edges. */
export function smoothPhoto(width: number, height: number): PixelBuffer {
  const image = blank(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = y / height,
        o = (y * width + x) * 4;
      const blob = Math.exp(-(((u - 0.4) ** 2 + (v - 0.55) ** 2) / 0.03));
      image.data[o] = 128 + 90 * Math.sin(u * 7 + v * 3) + 30 * Math.sin(u * 23) + 50 * blob;
      image.data[o + 1] = 128 + 90 * Math.sin(v * 5 - u * 2) + 30 * Math.cos(v * 19);
      image.data[o + 2] = 128 + 80 * Math.cos(u * 4 + v * 6) - 40 * blob;
      image.data[o + 3] = 255;
    }
  return image;
}
/** Textured "photo": noise at several scales, so it has edges everywhere. */
export function texturePhoto(width: number, height: number, seed = 3): PixelBuffer {
  const random = rng(seed);
  const image = blank(width, height);
  const base = smoothPhoto(width, height);
  for (let i = 0; i < width * height; i++)
    for (let c = 0; c < 3; c++)
      image.data[i * 4 + c] = base.data[i * 4 + c] + (random() - 0.5) * 70;
  for (let i = 0; i < width * height; i++) image.data[i * 4 + 3] = 255;
  return image;
}
export function addNoise(source: PixelBuffer, amplitude: number, seed = 11): PixelBuffer {
  const random = rng(seed);
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++) data[i + c] += (random() - 0.5) * 2 * amplitude;
  return { width: source.width, height: source.height, data };
}
/** Cells of 15 to 17 pixels with a margin, like a hand-resized sprite. */
export function jitterWithMargin(source: PixelBuffer, margin = 3, seed = 5): PixelBuffer {
  const random = rng(seed);
  const widths = Array.from({ length: source.width }, () => 15 + Math.floor(random() * 3));
  const heights = Array.from({ length: source.height }, () => 15 + Math.floor(random() * 3));
  const width = widths.reduce((a, b) => a + b, 0) + margin * 2;
  const height = heights.reduce((a, b) => a + b, 0) + margin * 2;
  const out = blank(width, height);
  const edge = (source.data[0] << 0) | 0;
  void edge;
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = 255;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
    out.data[i * 4 + 3] = 255;
  }
  let y = margin;
  for (let sy = 0; sy < source.height; sy++) {
    let x = margin;
    for (let sx = 0; sx < source.width; sx++) {
      for (let yy = y; yy < y + heights[sy]; yy++)
        for (let xx = x; xx < x + widths[sx]; xx++)
          for (let c = 0; c < 4; c++)
            out.data[(yy * width + xx) * 4 + c] = source.data[(sy * source.width + sx) * 4 + c];
      x += widths[sx];
    }
    y += heights[sy];
  }
  return out;
}
/** A smooth backdrop with hard-edged, anti-aliased shapes at arbitrary positions (no pixel grid). */
export function vectorShapes(width: number, height: number, seed = 21): PixelBuffer {
  const random = rng(seed);
  const image = smoothPhoto(width, height);
  for (let shape = 0; shape < 30; shape++) {
    const cx = random() * width,
      cy = random() * height,
      rx = 15 + random() * 80,
      ry = 15 + random() * 80;
    const color = [random() * 255, random() * 255, random() * 255];
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y < Math.min(height, cy + ry + 1); y++)
      for (let x = Math.max(0, Math.floor(cx - rx - 1)); x < Math.min(width, cx + rx + 1); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const cover = Math.max(0, Math.min(1, (1 - d) * Math.min(rx, ry)));
        for (let c = 0; c < 3; c++) {
          const o = (y * width + x) * 4 + c;
          image.data[o] = image.data[o] * (1 - cover) + color[c] * cover;
        }
      }
  }
  return image;
}
