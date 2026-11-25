import { UINT8_MAX, type Rgba } from "$/base";
import { rgbToLab, type Lab } from "$/color";

type OutlineOffset = readonly [number, number];
const TILED_X = 1;
const TILED_Y = 2;
const MAX_CACHED_MATCHES = 4096;

/** Read the original edge and its neighbors. Inside edges also sample the pixel being replaced. */
export function selectiveOutlineSampler(
  width: number,
  height: number,
  offsets: readonly OutlineOffset[],
  tiledMode: number,
  outside: boolean,
  emptyAt: (pixel: number) => boolean,
  colorAt: (pixel: number) => Rgba,
): (x: number, y: number) => Lab | undefined {
  const samples: number[] = [];
  const wrapX = (tiledMode & TILED_X) !== 0;
  const wrapY = (tiledMode & TILED_Y) !== 0;
  return (x, y) => {
    const pixel = y * width + x;
    if (emptyAt(pixel) !== outside) return;
    samples.length = 0;
    if (!outside) samples.push(pixel);
    let edge = false;
    for (const [dx, dy] of offsets) {
      let nx = x + dx;
      let ny = y + dy;
      if (nx < 0) nx = wrapX ? width - 1 : 0;
      else if (nx >= width) nx = wrapX ? 0 : width - 1;
      if (ny < 0) ny = wrapY ? height - 1 : 0;
      else if (ny >= height) ny = wrapY ? 0 : height - 1;
      const neighbor = ny * width + nx;
      const empty = emptyAt(neighbor);
      if (empty !== outside) edge = true;
      if (!empty && !samples.includes(neighbor)) samples.push(neighbor);
    }
    if (!edge) return;

    // Prefer fully opaque samples. An edge made only of translucent pixels
    // still has a color, so weight those samples by their alpha.
    let lightness = 0;
    let a = 0;
    let b = 0;
    let weight = 0;
    let opaque = false;
    let centerLightness = Infinity;
    for (const sample of samples) {
      const [red, green, blue, alpha] = colorAt(sample);
      if (opaque && alpha !== UINT8_MAX) continue;
      if (!opaque && alpha === UINT8_MAX) {
        lightness = a = b = weight = 0;
        opaque = true;
      }
      const lab = rgbToLab(red, green, blue);
      if (sample === pixel) centerLightness = lab[0];
      lightness += lab[0] * alpha;
      a += lab[1] * alpha;
      b += lab[2] * alpha;
      weight += alpha;
    }
    if (!weight) return;
    const meanLightness = lightness / weight;
    // Brighter neighbors can tint an inside edge without making it lighter.
    const scale = meanLightness > centerLightness ? centerLightness / meanLightness : 1;
    return [meanLightness * scale, (a / weight) * scale, (b / weight) * scale];
  };
}

export function darkenOutlineSample([lightness, a, b]: Lab, scale: number): Lab {
  return [lightness * scale, a * scale, b * scale];
}

/** Indexed output always uses an opaque entry. If no darker shade exists,
 * use the darkest opaque entry, or leave the pixel alone if there is none. */
export function selectiveOutlinePaletteMatcher(
  colors: readonly Rgba[],
  transparentIndex: number,
  scale: number,
) {
  const entries: { index: number; lab: Lab }[] = [];
  let darkest: { index: number; lightness: number } | undefined;
  for (let index = 0; index < colors.length && index <= UINT8_MAX; index++) {
    const color = colors[index];
    if (index === transparentIndex || color?.[3] !== UINT8_MAX) continue;
    const lab = rgbToLab(color[0], color[1], color[2]);
    const lightness = lab[0];
    entries.push({ index, lab });
    if (!darkest || lightness < darkest.lightness) darkest = { index, lightness };
  }
  const cache = new Map<string, number>();
  return (sample: Lab): number | undefined => {
    if (!darkest) return;
    const key = sample.join();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const [lightness, a, b] = darkenOutlineSample(sample, scale);
    let index = darkest.index;
    let distance = Infinity;
    for (const entry of entries) {
      const [entryL, entryA, entryB] = entry.lab;
      if (entryL >= sample[0]) continue;
      const nextDistance = (entryL - lightness) ** 2 + (entryA - a) ** 2 + (entryB - b) ** 2;
      if (nextDistance < distance) {
        index = entry.index;
        distance = nextDistance;
      }
    }
    if (cache.size < MAX_CACHED_MATCHES) cache.set(key, index);
    return index;
  };
}
