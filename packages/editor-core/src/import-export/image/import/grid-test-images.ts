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
/**
 * Detailed pixel art: a dithered two-tone sky, outlined blobs with a lit and a shaded tone,
 * single-pixel highlights and scattered speckles, so many neighbouring cells share a colour while
 * others change every pixel.
 */
export function detailedSprite(width: number, height: number, seed = 7): PixelBuffer {
  const random = rng(seed);
  const image = blank(width, height);
  const paint = (x: number, y: number, color: readonly number[]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    image.data[o] = color[0];
    image.data[o + 1] = color[1];
    image.data[o + 2] = color[2];
    image.data[o + 3] = 255;
  };
  const tone = (color: readonly number[], factor: number) => color.map((v) => v * factor);
  const sky = PALETTE[1 + Math.floor(random() * (PALETTE.length - 1))];
  const band = height * (0.3 + random() * 0.4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const lower = y > band || (y > band - 3 && (x + y) % 2 === 0);
      paint(x, y, lower ? tone(sky, 0.7) : sky);
    }
  const outline = PALETTE[2];
  const blobs = 6 + Math.floor(random() * 6);
  for (let shape = 0; shape < blobs; shape++) {
    const color = PALETTE[3 + Math.floor(random() * (PALETTE.length - 3))];
    const rx = 3 + random() * width * 0.18,
      ry = 3 + random() * height * 0.18;
    const cx = random() * width,
      cy = random() * height;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        if (d > 1) continue;
        const edge = d > 1 - 1.2 / Math.min(rx, ry);
        const lit = (x - cx) / rx + (y - cy) / ry < -0.3;
        paint(x, y, edge ? outline : lit ? color : tone(color, 0.65));
      }
  }
  for (let i = 0; i < width * height * 0.02; i++)
    paint(Math.floor(random() * width), Math.floor(random() * height), PALETTE[1]);
  return image;
}
/**
 * Nearest resample onto `cuts` (output positions of every native cell boundary, first 0, last the
 * output length): output pixel centre x + 0.5 takes the native cell whose span contains it.
 */
function resampleOnCuts(
  source: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
): PixelBuffer {
  const out = blank(Math.round(cutsX[cutsX.length - 1]), Math.round(cutsY[cutsY.length - 1]));
  const index = (cuts: readonly number[], length: number) => {
    const map = new Int32Array(length);
    let cell = 0;
    for (let x = 0; x < length; x++) {
      while (cell < cuts.length - 2 && x + 0.5 >= cuts[cell + 1]) cell++;
      map[x] = cell;
    }
    return map;
  };
  const columns = index(cutsX, out.width),
    rows = index(cutsY, out.height);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      for (let c = 0; c < 4; c++)
        out.data[(y * out.width + x) * 4 + c] =
          source.data[(rows[y] * source.width + columns[x]) * 4 + c];
  return out;
}
const evenCuts = (cells: number, length: number) =>
  Array.from({ length: cells + 1 }, (_, i) => (i * length) / cells);
/** Non-integer square nearest upscale: cells alternate between two integer widths. */
export function fractionalUpscale(source: PixelBuffer, scale: number): PixelBuffer {
  return resampleOnCuts(
    source,
    evenCuts(source.width, Math.round(source.width * scale)),
    evenCuts(source.height, Math.round(source.height * scale)),
  );
}
/** Cuts whose cell size swells and shrinks smoothly (two sine waves) by up to `drift` of a cell. */
function driftCuts(cells: number, length: number, drift: number, random: () => number): number[] {
  const p0 = random() * 2 * Math.PI,
    p1 = random() * 2 * Math.PI;
  const sizes = Array.from({ length: cells }, (_, i) => {
    const t = i / Math.max(cells - 1, 1);
    return (
      1 +
      drift *
        (0.7 * Math.sin(2 * Math.PI * 1.3 * t + p0) + 0.3 * Math.sin(2 * Math.PI * 3.1 * t + p1))
    );
  });
  const total = sizes.reduce((a, b) => a + b, 0);
  const cuts = [0];
  for (const size of sizes) cuts.push(cuts[cuts.length - 1] + (size * length) / total);
  return cuts;
}
/** Nearest upscale whose cell size drifts smoothly across the image (a non-uniform grid). */
export function driftUpscale(
  source: PixelBuffer,
  scale: number,
  drift: number,
  seed = 17,
): PixelBuffer {
  const random = rng(seed);
  return resampleOnCuts(
    source,
    driftCuts(source.width, Math.round(source.width * scale), drift, random),
    driftCuts(source.height, Math.round(source.height * scale), drift, random),
  );
}
/** Nearest upscale whose every inner cut moves by up to `jitter` cells, as pixel-bench's jitter. */
export function jitterUpscale(
  source: PixelBuffer,
  scale: number,
  jitter: number,
  seed = 23,
): PixelBuffer {
  const random = rng(seed);
  const cuts = (cells: number) => {
    const length = Math.round(cells * scale);
    const base = length / cells;
    const out = Array.from({ length: cells + 1 }, (_, i) =>
      i === 0 || i === cells ? i * base : i * base + (random() * 2 - 1) * jitter * base,
    );
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1]);
    return out;
  };
  return resampleOnCuts(source, cuts(source.width), cuts(source.height));
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
/** Writes into out[o..o+3] the bilinear sample of `source` at source coordinates (sx, sy). */
function sampleBilinear(
  source: PixelBuffer,
  sx: number,
  sy: number,
  out: Uint8ClampedArray,
  o: number,
): void {
  const x0 = Math.floor(sx),
    y0 = Math.floor(sy);
  const x1 = Math.min(source.width - 1, x0 + 1),
    y1 = Math.min(source.height - 1, y0 + 1);
  const fx = sx - x0,
    fy = sy - y0;
  for (let c = 0; c < 4; c++) {
    const g = (xx: number, yy: number) => source.data[(yy * source.width + xx) * 4 + c];
    out[o + c] =
      (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) +
      (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
  }
}
export function upscaleBilinear(source: PixelBuffer, scale: number): PixelBuffer {
  const out = blank(source.width * scale, source.height * scale);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      sampleBilinear(source, x / scale, y / scale, out.data, (y * out.width + x) * 4);
  return out;
}
/** Bilinear resample with pixel-centre alignment (as image libraries do), by a possibly fractional factor. */
export function resampleBilinear(source: PixelBuffer, scale: number): PixelBuffer {
  const out = blank(Math.round(source.width * scale), Math.round(source.height * scale));
  const fx = source.width / out.width,
    fy = source.height / out.height;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      sampleBilinear(
        source,
        clamp((x + 0.5) * fx - 0.5, source.width - 1),
        clamp((y + 0.5) * fy - 0.5, source.height - 1),
        out.data,
        (y * out.width + x) * 4,
      );
  return out;
}
/** Float RGBA planes, so multi-stage soft fixtures quantise once at the end. */
interface Planes {
  width: number;
  height: number;
  data: Float32Array;
}
function bilinearPlanes(source: PixelBuffer, scale: number): Planes {
  const width = Math.round(source.width * scale),
    height = Math.round(source.height * scale);
  const data = new Float32Array(width * height * 4);
  const fx = source.width / width,
    fy = source.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(source.height - 1, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy),
      y1 = Math.min(source.height - 1, y0 + 1),
      ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(source.width - 1, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx),
        x1 = Math.min(source.width - 1, x0 + 1),
        tx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const g = (xx: number, yy: number) => source.data[(yy * source.width + xx) * 4 + c];
        data[(y * width + x) * 4 + c] =
          (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) +
          (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
      }
    }
  }
  return { width, height, data };
}
/** Separable Gaussian blur (radius 4 sigma) with replicated borders. */
function gaussPlanes(planes: Planes, sigma: number, channels = 4): Planes {
  const { width, height } = planes;
  const radius = Math.max(1, Math.ceil(4 * sigma));
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)),
  );
  const norm = kernel.reduce((a, b) => a + b, 0);
  const pass = (input: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(input.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < channels; c++) {
          let sum = 0;
          for (let d = -radius; d <= radius; d++) {
            const xx = horizontal ? Math.max(0, Math.min(width - 1, x + d)) : x,
              yy = horizontal ? y : Math.max(0, Math.min(height - 1, y + d));
            sum += kernel[d + radius] * input[(yy * width + xx) * channels + c];
          }
          out[(y * width + x) * channels + c] = sum / norm;
        }
    return out;
  };
  return { width, height, data: pass(pass(planes.data, true), false) };
}
/** Bilinear sample of every pixel at (x + dx, y + dy), with replicated borders. */
function displacePlanes(planes: Planes, dx: Float32Array, dy: Float32Array): Planes {
  const { width, height, data } = planes;
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const sx = Math.max(0, Math.min(width - 1, x + dx[i])),
        sy = Math.max(0, Math.min(height - 1, y + dy[i]));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        tx = sx - x0,
        ty = sy - y0;
      for (let c = 0; c < 4; c++) {
        const g = (xx: number, yy: number) => data[(yy * width + xx) * 4 + c];
        out[i * 4 + c] =
          (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) +
          (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
      }
    }
  return { width, height, data: out };
}
/** Smooth random field over width x height with peak magnitude 1: blurred noise at half size. */
function smoothField(width: number, height: number, sigma: number, random: () => number) {
  const hw = Math.max(2, width >> 1),
    hh = Math.max(2, height >> 1);
  const noise = new Float32Array(hw * hh);
  for (let i = 0; i < noise.length; i++)
    noise[i] = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const small = gaussPlanes({ width: hw, height: hh, data: noise }, sigma, 1).data;
  const field = new Float32Array(width * height);
  let peak = 0;
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(hh - 1, ((y + 0.5) * hh) / height - 0.5));
    const y0 = Math.floor(sy),
      y1 = Math.min(hh - 1, y0 + 1),
      ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(hw - 1, ((x + 0.5) * hw) / width - 0.5));
      const x0 = Math.floor(sx),
        x1 = Math.min(hw - 1, x0 + 1),
        tx = sx - x0;
      const v =
        (small[y0 * hw + x0] * (1 - tx) + small[y0 * hw + x1] * tx) * (1 - ty) +
        (small[y1 * hw + x0] * (1 - tx) + small[y1 * hw + x1] * tx) * ty;
      field[y * width + x] = v;
      peak = Math.max(peak, Math.abs(v));
    }
  }
  for (let i = 0; i < field.length; i++) field[i] /= peak || 1;
  return field;
}
function quantise(planes: Planes): PixelBuffer {
  return { width: planes.width, height: planes.height, data: Uint8ClampedArray.from(planes.data) };
}
/** pixel-bench's soft_bilinear: a centred bilinear upscale, then a Gaussian blur. */
export function softBilinear(source: PixelBuffer, scale: number, blur = 0.5): PixelBuffer {
  return quantise(gaussPlanes(bilinearPlanes(source, scale), blur));
}
/**
 * pixel-bench's mush: a centred bilinear upscale displaced by a smooth random field of up to
 * `amplitude` pixels (correlated over about a cell), a soft-focus blend and a Gaussian blur.
 */
export function mushWarp(
  source: PixelBuffer,
  scale: number,
  seed = 19,
  amplitude = 1.6,
  blur = 0.7,
): PixelBuffer {
  const random = rng(seed);
  const base = bilinearPlanes(source, scale);
  const sigma = Math.max(scale * 0.6, 1);
  const dx = smoothField(base.width, base.height, sigma, random),
    dy = smoothField(base.width, base.height, sigma, random);
  for (let i = 0; i < dx.length; i++) {
    dx[i] *= amplitude;
    dy[i] *= amplitude;
  }
  const moved = displacePlanes(base, dx, dy);
  const focus = gaussPlanes(moved, 0.6);
  for (let i = 0; i < moved.data.length; i++)
    moved.data[i] = 0.6 * moved.data[i] + 0.4 * focus.data[i];
  return quantise(gaussPlanes(moved, blur));
}
/** A soft "AI upscale": centred bilinear, a further blur and mild noise. */
export function mush(source: PixelBuffer, scale: number, seed = 13): PixelBuffer {
  return addNoise(boxBlur(resampleBilinear(source, scale), 1), 6, seed);
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
