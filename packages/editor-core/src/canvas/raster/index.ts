import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type {
  BrushImage,
  PixelBuffer,
  PixelMask,
  Point,
  RasterResult,
  Rect,
  Rgba,
} from "$/base/primitives";
import { BrushImagePattern } from "$/base/primitives";
import { symmetryBrushMask } from "$/canvas/assistance/symmetry";
import { brushMask, line, polygon } from "$/canvas/raster/geometry";
import { shadePixel } from "$/canvas/raster/shading";
import type { RasterOptions } from "$/canvas/raster/types";
import { projectTiledPixel } from "$/canvas/tiled-canvas";
import { AsepriteInk } from "$/drawing/tool-settings";

export type { RasterOptions } from "$/canvas/raster/types";
export {
  brushMask,
  isValidBrushImage,
  lineStrokePoints,
  polygon,
  rasterizeBrushShape,
} from "$/canvas/raster/geometry";
/** Same integer rounding macro as pixman/ Aseprite MUL_UN8, including signed differences. */
export function mulUn8(a: number, b: number) {
  const t = a * b + 128;
  return ((t >> 8) + t) >> 8;
}
export function normalBlend(b: Rgba, s: Rgba, opacity: number): Rgba {
  const sa = mulUn8(s[3], opacity);
  if (!b[3]) return [s[0], s[1], s[2], sa];
  if (!s[3]) return b;
  const a = sa + b[3] - mulUn8(b[3], sa);
  return [
    b[0] + Math.trunc(((s[0] - b[0]) * sa) / a),
    b[1] + Math.trunc(((s[1] - b[1]) * sa) / a),
    b[2] + Math.trunc(((s[2] - b[2]) * sa) / a),
    a,
  ];
}
/** Aseprite geometric-brush ink policy. Omitted ink preserves the public raster API. */
export function inkBlend(
  background: Rgba,
  color: Rgba,
  opacity: number,
  ink: RasterOptions["ink"],
  options?: Pick<RasterOptions, "shade" | "shadeDirection">,
): Rgba {
  if (ink === AsepriteInk.Shading)
    return shadePixel(background, options?.shade, options?.shadeDirection);
  if (ink === AsepriteInk.CopyColor || (ink === AsepriteInk.Simple && color[3] === 0)) return color;
  const result = normalBlend(background, color, ink === AsepriteInk.Simple ? UINT8_MAX : opacity);
  return ink === AsepriteInk.LockAlpha ? [result[0], result[1], result[2], background[3]] : result;
}
export function mergeBlend(b: Rgba, s: Rgba, opacity: number): Rgba {
  const a = b[3] + mulUn8(s[3] - b[3], opacity);
  if (!a) return [0, 0, 0, 0];
  const c = !b[3] ? s : !s[3] ? b : null;
  return [
    c ? c[0] : b[0] + mulUn8(s[0] - b[0], opacity),
    c ? c[1] : b[1] + mulUn8(s[1] - b[1], opacity),
    c ? c[2] : b[2] + mulUn8(s[2] - b[2], opacity),
    a,
  ];
}
function mergeBlendInto(
  b: Rgba,
  s: Rgba,
  opacity: number,
  out: [number, number, number, number],
): Rgba {
  const a = b[3] + mulUn8(s[3] - b[3], opacity);
  if (!a) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return out;
  }
  if (!b[3] || !s[3]) {
    const source = !b[3] ? s : b;
    out[0] = source[0];
    out[1] = source[1];
    out[2] = source[2];
    out[3] = a;
    return out;
  }
  out[0] = b[0] + mulUn8(s[0] - b[0], opacity);
  out[1] = b[1] + mulUn8(s[1] - b[1], opacity);
  out[2] = b[2] + mulUn8(s[2] - b[2], opacity);
  out[3] = a;
  return out;
}
export function samplePixel(image: PixelBuffer, p: Point): Rgba {
  const x = Math.floor(p.x),
    y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}
export function allows(image: PixelBuffer, x: number, y: number, options: RasterOptions) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const c = options.clip;
  if (c && (x < c.x || y < c.y || x >= c.x + c.width || y >= c.y + c.height)) return false;
  const m = options.selection;
  return (
    !m ||
    (x >= m.x &&
      y >= m.y &&
      x < m.x + m.width &&
      y < m.y + m.height &&
      !!m.data[(y - m.y) * m.width + x - m.x])
  );
}
/** Central writer: history observes original pixels before any mutation, dirty bounds include actual changes only. */
export function pixelWriter(image: PixelBuffer, options: RasterOptions) {
  let packed: Uint32Array | null | undefined;
  let colorBytes: Uint8ClampedArray | undefined;
  let colorWord: Uint32Array | undefined;
  let left = Infinity,
    top = Infinity,
    right = -1,
    bottom = -1;
  const write = (x: number, y: number, color: Rgba, explicitIndex?: number) => {
    if (!allows(image, x, y, options)) return;
    if (explicitIndex === undefined)
      color = options.indexedPixelWriter?.resolve?.(x, y, color) ?? color;
    const changedIndex = options.indexedPixelWriter?.write(x, y, color, explicitIndex) ?? false;
    const i = (y * image.width + x) * 4;
    if (!changedIndex && color.every((v, c) => v === image.data[i + c])) return;
    options.beforeWrite?.({ x, y, width: 1, height: 1 });
    image.data.set(color, i);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  return {
    write,
    writeSolidSpan(x: number, y: number, end: number, color: Rgba) {
      if (options.indexedPixelWriter) {
        for (let px = Math.max(0, x); px <= Math.min(image.width - 1, end); px++)
          write(px, y, color);
        return;
      }
      if (packed === undefined)
        packed =
          image.data.byteOffset % 4 === 0 && image.data.byteLength % 4 === 0
            ? new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.byteLength / 4)
            : null;
      if (
        packed &&
        !options.selection &&
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        Number.isInteger(end)
      ) {
        const clip = options.clip;
        if (y < 0 || y >= image.height || (clip && (y < clip.y || y >= clip.y + clip.height)))
          return;
        const start = Math.max(0, x, clip ? Math.ceil(clip.x) : 0);
        const stop = Math.min(
          image.width - 1,
          end,
          clip ? Math.ceil(clip.x + clip.width) - 1 : image.width - 1,
        );
        colorBytes ??= new Uint8ClampedArray(4);
        colorWord ??= new Uint32Array(colorBytes.buffer);
        colorBytes.set(color);
        const value = colorWord[0],
          row = y * image.width;
        let first = start,
          last = stop;
        while (first <= last && packed[row + first] === value) first++;
        while (last >= first && packed[row + last] === value) last--;
        if (first > last) return;
        options.beforeWrite?.({ x: first, y, width: last - first + 1, height: 1 });
        packed.fill(value, row + first, row + last + 1);
        left = Math.min(left, first);
        top = Math.min(top, y);
        right = Math.max(right, last);
        bottom = Math.max(bottom, y);
        return;
      }
      let first = -1,
        last = -1;
      for (let px = x; px <= end; px++) {
        if (!allows(image, px, y, options)) continue;
        const i = (y * image.width + px) * 4;
        if (
          image.data[i] !== color[0] ||
          image.data[i + 1] !== color[1] ||
          image.data[i + 2] !== color[2] ||
          image.data[i + 3] !== color[3]
        ) {
          if (first < 0) first = px;
          last = px;
        }
      }
      if (first < 0) return;
      options.beforeWrite?.({
        x: first,
        y,
        width: last - first + 1,
        height: 1,
      });
      for (let px = first; px <= last; px++) {
        if (!allows(image, px, y, options)) continue;
        const i = (y * image.width + px) * 4;
        image.data[i] = color[0];
        image.data[i + 1] = color[1];
        image.data[i + 2] = color[2];
        image.data[i + 3] = color[3];
      }
      left = Math.min(left, first);
      top = Math.min(top, y);
      right = Math.max(right, last);
      bottom = Math.max(bottom, y);
    },
    result(): RasterResult {
      return {
        dirty:
          right < 0
            ? null
            : {
                x: left,
                y: top,
                width: right - left + 1,
                height: bottom - top + 1,
              },
      };
    },
  };
}
const opacityOf = (options: RasterOptions) =>
  Math.max(0, Math.min(UINT8_MAX, Math.round(options.opacity ?? UINT8_MAX)));
const brushCache = new Map<string, PixelMask>();
function cachedBrush(options: RasterOptions) {
  const b = options.brush,
    key = `${b.shape}:${b.size}:${b.angle}:${options.symmetryIndex ?? 0}`;
  // Image alpha may change independently of the geometric fields. Rebuild its
  // mask per raster operation so replacing/editing source pixels cannot leave
  // the shared stamp cache stale.
  if (b.shape === "image") return symmetryBrushMask(brushMask(b), options.symmetryIndex ?? 0);
  let mask = brushCache.get(key);
  if (!mask) {
    mask = symmetryBrushMask(brushMask(b), options.symmetryIndex ?? 0);
    if (brushCache.size >= 128) brushCache.delete(brushCache.keys().next().value!);
    brushCache.set(key, mask);
  }
  return mask;
}
/** Invert the orientation used by symmetryBrushMask to sample the custom
 * source bitmap in the same reflected/rotated orientation as its alpha mask. */
function imageBrushSourcePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  symmetry: NonNullable<RasterOptions["symmetryIndex"]>,
): Point {
  switch (symmetry) {
    case 1:
      return { x: width - 1 - x, y };
    case 2:
      return { x, y: height - 1 - y };
    case 3:
      return { x: width - 1 - x, y: height - 1 - y };
    case 4:
      return { x: width - 1 - y, y: x };
    case 5:
      return { x: y, y: x };
    case 6:
      return { x: y, y: height - 1 - x };
    case 7:
      return { x: width - 1 - y, y: height - 1 - x };
    default:
      return { x, y };
  }
}
const modulo = (value: number, size: number) => ((value % size) + size) % size;
type BrushPixelImage = Pick<
  BrushImage,
  | "width"
  | "height"
  | "data"
  | "asepriteSamples"
  | "palette"
  | "transparentIndex"
  | "sourceBackground"
>;
interface BrushPixelSample {
  color: Rgba;
  key: string;
  transparent: boolean;
  sourceTransparent?: boolean;
  paletteIndex?: number;
  indexedSource?: boolean;
  recolored?: boolean;
}
interface BrushImageSourceInfo {
  hasAlpha: boolean;
  backgroundKey?: string;
  mainKey?: string;
}
const brushImageSourceInfo = new WeakMap<object, BrushImageSourceInfo>();

/** Resolve the source pixel without discarding an indexed brush's raw index. */
function brushImagePixel(
  source: BrushPixelImage,
  x: number,
  y: number,
  destinationPalette?: readonly Rgba[],
  destinationTransparentIndex?: number,
): BrushPixelSample {
  const samples = source.asepriteSamples;
  if (
    samples &&
    samples.width === source.width &&
    samples.height === source.height &&
    samples.data.length === source.width * source.height * (samples.depth / BITS_PER_BYTE)
  ) {
    const index = y * source.width + x;
    if (samples.depth === 8) {
      const raw = samples.data[index];
      const sourceMaskIndex = source.sourceBackground ? -1 : (source.transparentIndex ?? 0);
      const sourceTransparent = raw === sourceMaskIndex;
      const destinationTransparent = raw === (destinationTransparentIndex ?? sourceMaskIndex);
      // Keep the source color available until ImageColor replacement runs.
      // A source pixel whose index happens to match the destination mask can
      // be recolored to an opaque index by Aseprite before it is painted.
      const color = sourceTransparent
        ? ([0, 0, 0, 0] as Rgba)
        : (destinationPalette?.[raw] ??
          source.palette?.[raw] ??
          ([
            source.data[index * 4],
            source.data[index * 4 + 1],
            source.data[index * 4 + 2],
            source.data[index * 4 + 3],
          ] as Rgba));
      return {
        color,
        key: `i:${raw}`,
        transparent: sourceTransparent || destinationTransparent,
        sourceTransparent,
        paletteIndex: raw,
        indexedSource: true,
      };
    }
    const value = samples.data[index * 2],
      alpha = samples.data[index * 2 + 1];
    return { color: [value, value, value, alpha], key: `g:${value}:${alpha}`, transparent: false };
  }
  const offset = (y * source.width + x) * 4;
  const color: Rgba = [
    source.data[offset],
    source.data[offset + 1],
    source.data[offset + 2],
    source.data[offset + 3],
  ];
  return { color, key: `r:${color[0]}:${color[1]}:${color[2]}:${color[3]}`, transparent: false };
}

function sourceMaskAt(image: BrushImage, index: number): boolean {
  if (image.mask?.length === image.width * image.height) return !!image.mask[index];
  if (
    image.asepriteSamples?.depth === 8 &&
    image.asepriteSamples.width === image.width &&
    image.asepriteSamples.height === image.height &&
    image.asepriteSamples.data.length === image.width * image.height
  ) {
    const maskIndex = image.sourceBackground ? -1 : (image.transparentIndex ?? 0);
    return image.asepriteSamples.data[index] !== maskIndex;
  }
  return image.data[index * 4 + 3] > 0;
}

/** Aseprite chooses source main/background keys from the first two distinct
 * opaque pixels in the mask. Any alpha/mask pixel switches to tint-all mode. */
function imageBrushSourceInfo(image: BrushImage): BrushImageSourceInfo {
  const cached = brushImageSourceInfo.get(image);
  if (cached) return cached;
  let hasAlpha = false,
    backgroundKey: string | undefined,
    mainKey: string | undefined;
  for (let i = 0; i < image.width * image.height; i++) {
    if (!sourceMaskAt(image, i)) continue;
    const sample = brushImagePixel(image, i % image.width, Math.floor(i / image.width));
    const indexed =
      image.asepriteSamples?.depth === 8 &&
      image.asepriteSamples.width === image.width &&
      image.asepriteSamples.height === image.height;
    if (indexed ? sample.sourceTransparent : sample.color[3] !== UINT8_MAX) {
      hasAlpha = true;
      continue;
    }
    if (backgroundKey === undefined) backgroundKey = sample.key;
    else if (sample.key !== backgroundKey && mainKey === undefined) mainKey = sample.key;
  }
  if (mainKey === undefined) mainKey = backgroundKey;
  const info = { hasAlpha, backgroundKey, mainKey };
  brushImageSourceInfo.set(image, info);
  return info;
}

function applyImageBrushColors(
  image: BrushImage,
  sample: BrushPixelSample,
  info: BrushImageSourceInfo,
): BrushPixelSample {
  const colors = image.imageColors;
  if (!colors || sample.sourceTransparent) return sample;
  if (info.hasAlpha) {
    const replacement = colors.main ?? colors.background;
    if (!replacement) return sample;
    const replacementIndex = sample.indexedSource
      ? colors.main
        ? colors.mainIndex
        : colors.backgroundIndex
      : undefined;
    const sourceAlpha = sample.indexedSource
      ? sample.sourceTransparent
        ? 0
        : UINT8_MAX
      : sample.color[3];
    return {
      ...sample,
      color: [replacement[0], replacement[1], replacement[2], mulUn8(sourceAlpha, replacement[3])],
      paletteIndex: replacementIndex,
      recolored: true,
    };
  }
  if (colors.main && (sample.key !== info.backgroundKey || info.mainKey === info.backgroundKey)) {
    const sourceAlpha = sample.indexedSource ? UINT8_MAX : sample.color[3];
    return {
      ...sample,
      color: [colors.main[0], colors.main[1], colors.main[2], mulUn8(sourceAlpha, colors.main[3])],
      paletteIndex: sample.indexedSource ? colors.mainIndex : undefined,
      recolored: true,
    };
  }
  if (colors.background && sample.key === info.backgroundKey) {
    const sourceAlpha = sample.indexedSource ? UINT8_MAX : sample.color[3];
    return {
      ...sample,
      color: [
        colors.background[0],
        colors.background[1],
        colors.background[2],
        mulUn8(sourceAlpha, colors.background[3]),
      ],
      paletteIndex: sample.indexedSource ? colors.backgroundIndex : undefined,
      recolored: true,
    };
  }
  return sample;
}

function imageBrushSampleAt(
  image: BrushImage,
  alignedX: number,
  alignedY: number,
  localX: number,
  localY: number,
  symmetry: NonNullable<RasterOptions["symmetryIndex"]>,
  destinationPalette?: readonly Rgba[],
  destinationTransparentIndex?: number,
): BrushPixelSample {
  if (image.patternImage) {
    const pattern = image.patternImage;
    if (
      !Number.isSafeInteger(pattern.width) ||
      !Number.isSafeInteger(pattern.height) ||
      pattern.width < 1 ||
      pattern.height < 1 ||
      pattern.width * pattern.height * 4 > pattern.data.length
    )
      return { color: [0, 0, 0, 0], key: "invalid", transparent: true };
    const sample = brushImagePixel(
      pattern,
      modulo(localX, pattern.width),
      modulo(localY, pattern.height),
      destinationPalette,
      destinationTransparentIndex,
    );
    const transparent =
      sample.sourceTransparent ||
      (sample.indexedSource && sample.paletteIndex === destinationTransparentIndex) ||
      sample.color[3] === 0;
    return { ...sample, transparent, color: transparent ? [0, 0, 0, 0] : sample.color };
  }
  const sourcePoint = imageBrushSourcePoint(
    alignedX,
    alignedY,
    image.width,
    image.height,
    symmetry,
  );
  if (
    sourcePoint.x < 0 ||
    sourcePoint.y < 0 ||
    sourcePoint.x >= image.width ||
    sourcePoint.y >= image.height
  )
    return { color: [0, 0, 0, 0], key: "outside", transparent: true };
  const sample = applyImageBrushColors(
    image,
    brushImagePixel(
      image,
      sourcePoint.x,
      sourcePoint.y,
      destinationPalette,
      destinationTransparentIndex,
    ),
    imageBrushSourceInfo(image),
  );
  const transparent =
    sample.sourceTransparent ||
    (sample.indexedSource && sample.paletteIndex === destinationTransparentIndex) ||
    sample.color[3] === 0;
  return { ...sample, transparent, color: transparent ? [0, 0, 0, 0] : sample.color };
}

function visitBrushStamp(
  image: PixelBuffer,
  cx: number,
  cy: number,
  options: RasterOptions,
  seen: Set<number> | undefined,
  visit: (
    x: number,
    y: number,
    brushX: number,
    brushY: number,
    alignedX: number,
    alignedY: number,
    localX: number,
    localY: number,
  ) => void,
  repeatCoverage = false,
  fixedPatternOrigin?: Point,
  cachedMask?: PixelMask,
) {
  const mask = cachedMask ?? cachedBrush(options),
    imageBrush = options.brush.shape === "image" ? options.brush.image : undefined,
    celOrigin = options.tiled?.origin ?? options.patternOrigin ?? { x: 0, y: 0 },
    alignment = imageBrush?.pattern ?? BrushImagePattern.AlignedToSource,
    sourceOrigin = imageBrush?.patternOrigin ?? { x: 0, y: 0 },
    stampProjected = projectTiledPixel(cx + mask.x, cy + mask.y, options.tiled),
    stampOrigin = {
      x: stampProjected.x + celOrigin.x,
      y: stampProjected.y + celOrigin.y,
    },
    firstOrigin = fixedPatternOrigin ?? options.brushPatternOrigin ?? stampOrigin,
    patternOrigin =
      alignment === BrushImagePattern.AlignedToSource
        ? sourceOrigin
        : alignment === BrushImagePattern.AlignedToDestination
          ? firstOrigin
          : stampOrigin;
  for (let my = 0; my < mask.height; my++)
    for (let mx = 0; mx < mask.width; mx++)
      if (mask.data[my * mask.width + mx]) {
        const { x, y } = projectTiledPixel(cx + mask.x + mx, cy + mask.y + my, options.tiled);
        if (!allows(image, x, y, options)) continue;
        const key = y * image.width + x;
        // Source tools with Overlap trace policy process every brush stamp.
        // Ordinary paint keeps its existing per-stroke coverage behavior.
        if (!repeatCoverage && !imageBrush && seen?.has(key)) continue;
        const localGlobalX = x + celOrigin.x,
          localGlobalY = y + celOrigin.y;
        const alignedX = imageBrush ? modulo(localGlobalX - patternOrigin.x, mask.width) : mx;
        const alignedY = imageBrush ? modulo(localGlobalY - patternOrigin.y, mask.height) : my;
        if (imageBrush && !mask.data[alignedY * mask.width + alignedX]) continue;
        seen?.add(key);
        visit(x, y, mx, my, alignedX, alignedY, x, y);
      }
}
function visitStroke(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
  visit: (
    x: number,
    y: number,
    brushX: number,
    brushY: number,
    alignedX: number,
    alignedY: number,
    localX: number,
    localY: number,
  ) => void,
  repeatCoverage = false,
) {
  const mask = cachedBrush(options),
    seen = repeatCoverage ? undefined : (options.coverage ?? new Set<number>()),
    imageBrush = options.brush.shape === "image" ? options.brush.image : undefined,
    celOrigin = options.tiled?.origin ?? options.patternOrigin ?? { x: 0, y: 0 },
    sourceOrigin = imageBrush?.patternOrigin ?? { x: 0, y: 0 },
    firstProjected = points.length
      ? projectTiledPixel(
          Math.floor(points[0].x) + mask.x,
          Math.floor(points[0].y) + mask.y,
          options.tiled,
        )
      : { x: sourceOrigin.x - celOrigin.x, y: sourceOrigin.y - celOrigin.y },
    firstOrigin = options.brushPatternOrigin ?? {
      x: firstProjected.x + celOrigin.x,
      y: firstProjected.y + celOrigin.y,
    };
  const stamp = (cx: number, cy: number) =>
    visitBrushStamp(image, cx, cy, options, seen, visit, repeatCoverage, firstOrigin, mask);
  if (points.length === 1) stamp(Math.floor(points[0].x), Math.floor(points[0].y));
  for (let i = 1; i < points.length; i++)
    line(
      Math.floor(points[i - 1].x),
      Math.floor(points[i - 1].y),
      Math.floor(points[i].x),
      Math.floor(points[i].y),
      stamp,
    );
}
export function paintStroke(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
): RasterResult {
  const w = pixelWriter(image, options),
    opacity = opacityOf(options);
  visitStroke(
    image,
    points,
    options,
    (x, y, _brushX, _brushY, alignedX, alignedY, localX, localY) => {
      paintBrushPixel(image, w, options, x, y, alignedX, alignedY, localX, localY, opacity);
    },
  );
  return w.result();
}

function paintBrushPixel(
  image: PixelBuffer,
  writer: ReturnType<typeof pixelWriter>,
  options: RasterOptions,
  x: number,
  y: number,
  alignedX: number,
  alignedY: number,
  localX: number,
  localY: number,
  opacity: number,
) {
  const imageBrush = options.brush.shape === "image" ? options.brush.image : undefined;
  if (imageBrush) {
    const symmetry = options.symmetryIndex ?? 0;
    const source = imageBrushSampleAt(
      imageBrush,
      alignedX,
      alignedY,
      localX,
      localY,
      symmetry,
      options.destinationPalette,
      options.destinationTransparentIndex,
    );
    const color = source.color;
    const destination = options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y });
    const paletteIndex =
      options.indexedPixelWriter &&
      source.indexedSource &&
      source.paletteIndex !== undefined &&
      color[3] === UINT8_MAX
        ? source.paletteIndex
        : undefined;
    if (options.ink === AsepriteInk.CopyColor) {
      // Aseprite's image Copy ink leaves transparent RGB/Grayscale source
      // pixels untouched and copies opaque/semitransparent source pixels.
      const copyPixel = source.indexedSource ? !source.transparent : color[3] !== 0;
      if (copyPixel)
        writer.write(
          x,
          y,
          color,
          options.indexedPixelWriter && source.indexedSource ? source.paletteIndex : undefined,
        );
    } else if (options.ink === AsepriteInk.LockAlpha) {
      const blended = normalBlend(destination, color, opacity);
      const destinationIndex = options.indexedPixelWriter?.read(x, y);
      const preserveIndex =
        opacity === UINT8_MAX &&
        destination[3] === UINT8_MAX &&
        paletteIndex !== undefined &&
        (options.destinationTransparentIndex === undefined ||
          destinationIndex !== options.destinationTransparentIndex);
      writer.write(
        x,
        y,
        [blended[0], blended[1], blended[2], destination[3]],
        preserveIndex ? paletteIndex : undefined,
      );
    } else if (options.ink === AsepriteInk.Shading) {
      const shadeMatches =
        !!color[3] &&
        !!options.shade?.some((shade) => shade.every((value, channel) => value === color[channel]));
      if (shadeMatches)
        writer.write(x, y, shadePixel(destination, options.shade, options.shadeDirection));
    } else {
      // Image brushes retain opacity with both Simple and Alpha inks, unlike
      // geometric brushes whose Simple ink is forced to fully opaque.
      writer.write(
        x,
        y,
        normalBlend(destination, color, opacity),
        opacity === UINT8_MAX ? paletteIndex : undefined,
      );
    }
    return;
  }
  writer.write(
    x,
    y,
    inkBlend(
      options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y }),
      options.colorAt?.(x, y) ?? options.color,
      opacity,
      options.ink,
      options,
    ),
  );
}

export interface SprayStrokeResult extends RasterResult {
  remainder: number;
  brushPatternOrigin?: Point;
}
const sprayDirections = Array.from({ length: 1024 }, (_, index) => {
  const angle = (index / 1024) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
/** Source SprayPointShape density and radial distribution, with cached brush
 * masks and no per-particle coverage allocation. */
export interface SprayRasterPath {
  points: readonly PressurePoint[];
  options: RasterOptions;
}
export type PressurePoint = Point & { pressure?: number };
function pressureBrushOptions(options: RasterOptions, pressure: number | undefined): RasterOptions {
  if (pressure === undefined || options.brush.shape === "image") return options;
  const size = Math.max(
    1,
    Math.trunc(options.brush.size * Math.max(0, Math.min(1, pressure)) + 0.5),
  );
  return size === options.brush.size ? options : { ...options, brush: { ...options.brush, size } };
}
/** Reuse particle and source buffers across pointer moves. */
export class SprayStrokeScratch {
  private xs = new Int32Array(256);
  private ys = new Int32Array(256);
  private pathIndexes = new Uint8Array(256);
  private pressures = new Float32Array(256);
  private sourceColors = new Uint8Array(1024);
  private readonly sourceIndexes = new Map<number, number>();
  count = 0;
  reset() {
    this.count = 0;
    this.sourceIndexes.clear();
  }
  addDot(x: number, y: number, pathIndex: number, pressure: number) {
    if (this.count === this.xs.length) {
      const capacity = this.count * 2;
      const xs = new Int32Array(capacity),
        ys = new Int32Array(capacity),
        pathIndexes = new Uint8Array(capacity),
        pressures = new Float32Array(capacity);
      xs.set(this.xs);
      ys.set(this.ys);
      pathIndexes.set(this.pathIndexes);
      pressures.set(this.pressures);
      this.xs = xs;
      this.ys = ys;
      this.pathIndexes = pathIndexes;
      this.pressures = pressures;
    }
    this.xs[this.count] = x;
    this.ys[this.count] = y;
    this.pathIndexes[this.count] = pathIndex;
    this.pressures[this.count] = pressure;
    this.count++;
  }
  captureSourcePixel(image: PixelBuffer, x: number, y: number) {
    const key = y * image.width + x;
    if (this.sourceIndexes.has(key)) return;
    const needed = (this.sourceIndexes.size + 1) * 4;
    if (needed > this.sourceColors.length) {
      const colors = new Uint8Array(Math.max(needed, this.sourceColors.length * 2));
      colors.set(this.sourceColors);
      this.sourceColors = colors;
    }
    const colorIndex = this.sourceIndexes.size,
      source = key * 4,
      target = colorIndex * 4;
    this.sourceIndexes.set(key, colorIndex);
    this.sourceColors[target] = image.data[source];
    this.sourceColors[target + 1] = image.data[source + 1];
    this.sourceColors[target + 2] = image.data[source + 2];
    this.sourceColors[target + 3] = image.data[source + 3];
  }
  sourceColorAt(imageWidth: number, x: number, y: number, color: [number, number, number, number]) {
    const index = this.sourceIndexes.get(y * imageWidth + x);
    if (index === undefined) color[0] = color[1] = color[2] = color[3] = 0;
    else {
      const offset = index * 4;
      color[0] = this.sourceColors[offset];
      color[1] = this.sourceColors[offset + 1];
      color[2] = this.sourceColors[offset + 2];
      color[3] = this.sourceColors[offset + 3];
    }
    return color;
  }
  forEachDot(visit: (x: number, y: number, pathIndex: number, pressure: number) => void) {
    for (let i = 0; i < this.count; i++)
      visit(this.xs[i], this.ys[i], this.pathIndexes[i], this.pressures[i]);
  }
}
/** Source SprayPointShape density and radial distribution. Each overlap step
 * reads one fixed source image, then writes all spray particles over it. */
export function sprayStroke(
  image: PixelBuffer,
  paths: readonly SprayRasterPath[],
  scratch: SprayStrokeScratch,
  width: number,
  speed: number,
  remainder = 0,
  brushPatternOrigin?: Point,
): SprayStrokeResult {
  if (!paths.length) return { dirty: null, remainder, brushPatternOrigin };
  const sprayWidth = Math.max(1, Math.min(32, Math.round(width))),
    spraySpeed = Math.max(1, Math.min(100, Math.round(speed))),
    rate = (((sprayWidth * sprayWidth) / 4) * spraySpeed) / 100;
  scratch.reset();
  let pointRemainder = Math.max(0, Math.min(0.999999999, remainder));
  let firstOrigin = brushPatternOrigin ?? paths[0].options.brushPatternOrigin;
  const sprayAt = (x: number, y: number, pathIndex: number, pressure: number) => {
    const stampOptions = pressureBrushOptions(paths[pathIndex].options, pressure);
    const total = rate + pointRemainder;
    const count = Math.floor(total);
    pointRemainder = total - count;
    for (let i = 0; i < count; i++) {
      const direction = sprayDirections[Math.floor(Math.random() * sprayDirections.length)];
      const radius = Math.random() * sprayWidth;
      const dotX = x + Math.trunc(radius * direction[0]);
      const dotY = y + Math.trunc(radius * direction[1]);
      if (!firstOrigin) {
        const mask = cachedBrush(stampOptions);
        const projected = projectTiledPixel(dotX + mask.x, dotY + mask.y, stampOptions.tiled);
        const origin = stampOptions.tiled?.origin ?? stampOptions.patternOrigin ?? { x: 0, y: 0 };
        firstOrigin = { x: projected.x + origin.x, y: projected.y + origin.y };
      }
      scratch.addDot(dotX, dotY, pathIndex, pressure);
    }
  };
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const points = paths[pathIndex].points;
    if (points.length === 1)
      sprayAt(Math.floor(points[0].x), Math.floor(points[0].y), pathIndex, points[0].pressure ?? 1);
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1],
        to = points[i];
      const steps = Math.max(
        Math.abs(Math.floor(to.x) - Math.floor(from.x)),
        Math.abs(Math.floor(to.y) - Math.floor(from.y)),
      );
      let step = 0;
      line(Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y), (x, y) => {
        const t = steps ? step++ / steps : 1;
        sprayAt(
          x,
          y,
          pathIndex,
          (from.pressure ?? 1) + ((to.pressure ?? 1) - (from.pressure ?? 1)) * t,
        );
      });
    }
  }
  // TracePolicy::Overlap keeps the source fixed until every mirrored stroke
  // in this pointer event has finished.
  scratch.forEachDot((x, y, pathIndex, pressure) => {
    visitBrushStamp(
      image,
      x,
      y,
      pressureBrushOptions(paths[pathIndex].options, pressure),
      undefined,
      (px, py) => scratch.captureSourcePixel(image, px, py),
      true,
      firstOrigin,
    );
  });
  const sourceColor: [number, number, number, number] = [0, 0, 0, 0];
  const drawOptions = paths.map((path) => ({
    ...path.options,
    sourcePixel: (x: number, y: number) => scratch.sourceColorAt(image.width, x, y, sourceColor),
  }));
  const writers = paths.map((path) => pixelWriter(image, path.options)),
    opacities = paths.map((path) => opacityOf(path.options));
  scratch.forEachDot((x, y, pathIndex, pressure) => {
    const options = {
      ...drawOptions[pathIndex],
      brush: pressureBrushOptions(drawOptions[pathIndex], pressure).brush,
    };
    visitBrushStamp(
      image,
      x,
      y,
      options,
      undefined,
      (px, py, _brushX, _brushY, alignedX, alignedY, localX, localY) =>
        paintBrushPixel(
          image,
          writers[pathIndex],
          options,
          px,
          py,
          alignedX,
          alignedY,
          localX,
          localY,
          opacities[pathIndex],
        ),
      true,
      firstOrigin,
    );
  });
  let dirty: Rect | null = null;
  for (const writer of writers) {
    const next = writer.result().dirty;
    if (!next) continue;
    if (!dirty) dirty = next;
    else {
      const x = Math.min(dirty.x, next.x),
        y = Math.min(dirty.y, next.y);
      dirty = {
        x,
        y,
        width: Math.max(dirty.x + dirty.width, next.x + next.width) - x,
        height: Math.max(dirty.y + dirty.height, next.y + next.height) - y,
      };
    }
  }
  return { dirty, remainder: pointRemainder, brushPatternOrigin: firstOrigin };
}

export interface JumbleRasterPath {
  points: readonly PressurePoint[];
  options: RasterOptions;
}
/** Reusable per-editor buffers avoid a full-cel copy or large temporary object
 * graph on every pointer move. */
export class JumbleStrokeScratch {
  sourceColors = new Uint8Array(1024 * 8);
  count = 0;
  private readonly lastOperation = new Map<number, number>();
  reset() {
    this.count = 0;
    this.lastOperation.clear();
  }
  append(target: number, source: Uint8ClampedArray, targetOffset: number, sampleOffset: number) {
    if (this.count * 8 === this.sourceColors.length) {
      const colors = new Uint8Array(this.sourceColors.length * 2);
      colors.set(this.sourceColors);
      this.sourceColors = colors;
    }
    const offset = this.count * 8;
    this.sourceColors[offset] = source[targetOffset];
    this.sourceColors[offset + 1] = source[targetOffset + 1];
    this.sourceColors[offset + 2] = source[targetOffset + 2];
    this.sourceColors[offset + 3] = source[targetOffset + 3];
    this.sourceColors[offset + 4] = source[sampleOffset];
    this.sourceColors[offset + 5] = source[sampleOffset + 1];
    this.sourceColors[offset + 6] = source[sampleOffset + 2];
    this.sourceColors[offset + 7] = source[sampleOffset + 3];
    this.lastOperation.set(target, this.count);
    this.count++;
  }
  operations(): IterableIterator<[number, number]> {
    return this.lastOperation.entries();
  }
}
function visitPressureStroke(
  image: PixelBuffer,
  points: readonly PressurePoint[],
  options: RasterOptions,
  visit: (x: number, y: number) => void,
) {
  if (!points.length) return;
  const firstMask = cachedBrush(pressureBrushOptions(options, points[0].pressure)),
    celOrigin = options.tiled?.origin ?? options.patternOrigin ?? { x: 0, y: 0 },
    projected = projectTiledPixel(
      Math.floor(points[0].x) + firstMask.x,
      Math.floor(points[0].y) + firstMask.y,
      options.tiled,
    ),
    firstOrigin = options.brushPatternOrigin ?? {
      x: projected.x + celOrigin.x,
      y: projected.y + celOrigin.y,
    };
  const stamp = (x: number, y: number, pressure: number) => {
    const stampOptions = pressureBrushOptions(options, pressure);
    visitBrushStamp(
      image,
      x,
      y,
      stampOptions,
      undefined,
      (px, py) => visit(px, py),
      true,
      firstOrigin,
    );
  };
  if (points.length === 1)
    stamp(Math.floor(points[0].x), Math.floor(points[0].y), points[0].pressure ?? 1);
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1],
      to = points[i];
    const steps = Math.max(
      Math.abs(Math.floor(to.x) - Math.floor(from.x)),
      Math.abs(Math.floor(to.y) - Math.floor(from.y)),
    );
    let step = 0;
    line(Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y), (x, y) => {
      const t = steps ? step++ / steps : 1;
      stamp(x, y, (from.pressure ?? 1) + ((to.pressure ?? 1) - (from.pressure ?? 1)) * t);
    });
  }
}
/** LibreSprite JumbleInkProcessing samples a 3x3 neighborhood from the
 * pre-step source, shifts against pointer velocity, then merges into the
 * destination. All mirrored paths are sampled before any path writes. */
export function jumbleStroke(
  image: PixelBuffer,
  paths: readonly JumbleRasterPath[],
  scratch: JumbleStrokeScratch,
): RasterResult {
  const first = paths[0];
  if (!first) return { dirty: null };
  scratch.reset();
  for (const path of paths) {
    const options = path.options;
    const offset = options.jumbleOffset ?? { x: 0, y: 0 };
    visitPressureStroke(image, path.points, options, (x, y) => {
      const sample = projectTiledPixel(
        x + Math.floor(Math.random() * 3) - 1 - offset.x,
        y + Math.floor(Math.random() * 3) - 1 - offset.y,
        options.tiled,
      );
      const sx = Math.max(0, Math.min(image.width - 1, sample.x));
      const sy = Math.max(0, Math.min(image.height - 1, sample.y));
      const target = y * image.width + x;
      scratch.append(target, image.data, target * 4, (sy * image.width + sx) * 4);
    });
  }
  const writer = pixelWriter(image, first.options),
    opacity = opacityOf(first.options),
    destination: [number, number, number, number] = [0, 0, 0, 0],
    sampled: [number, number, number, number] = [0, 0, 0, 0],
    blended: [number, number, number, number] = [0, 0, 0, 0];
  for (const [target, operation] of scratch.operations()) {
    const colorOffset = operation * 8;
    for (let channel = 0; channel < 4; channel++) {
      destination[channel] = scratch.sourceColors[colorOffset + channel];
      sampled[channel] = scratch.sourceColors[colorOffset + 4 + channel];
    }
    writer.write(
      target % image.width,
      Math.floor(target / image.width),
      mergeBlendInto(destination, sampled, opacity, blended),
    );
  }
  return writer.result();
}

export function eraseStroke(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
): RasterResult {
  const w = pixelWriter(image, options),
    opacity = opacityOf(options);
  visitStroke(
    image,
    points,
    options,
    (x, y, _brushX, _brushY, alignedX, alignedY, localX, localY) => {
      const imageBrush = options.brush.shape === "image" ? options.brush.image : undefined;
      const c = imageBrush
        ? samplePixel(image, { x, y })
        : (options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y }));
      const imageOpacity = imageBrush
        ? imageBrushSampleAt(
            imageBrush,
            alignedX,
            alignedY,
            localX,
            localY,
            options.symmetryIndex ?? 0,
            options.destinationPalette,
            options.destinationTransparentIndex,
          ).color[3]
        : opacity;
      if (imageBrush && imageOpacity === 0) return;
      w.write(
        x,
        y,
        imageBrush
          ? [c[0], c[1], c[2], mulUn8(c[3], UINT8_MAX - imageOpacity)]
          : options.eraseColor
            ? normalBlend(c, options.eraseColor, imageOpacity)
            : [c[0], c[1], c[2], mulUn8(c[3], UINT8_MAX - imageOpacity)],
      );
    },
  );
  return w.result();
}
export enum ReplaceColorMode {
  Rgba = "rgba",
  Gray = "gray",
  Indexed = "indexed",
}
/** LibreSprite ReplaceFgWithBg: match source RGB (or gray value/index), then
 * merge the background color over that source using the ink opacity. */
export function replaceColorStroke(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
  foreground: Rgba,
  background: Rgba,
  mode: ReplaceColorMode,
  foregroundIndex?: number,
  backgroundIndex?: number,
): RasterResult {
  const writer = pixelWriter(image, options),
    opacity = opacityOf(options);
  visitStroke(image, points, options, (x, y) => {
    const source = options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y });
    const indexedMatch =
      mode === ReplaceColorMode.Indexed &&
      foregroundIndex !== undefined &&
      options.indexedPixelWriter?.read(x, y) === foregroundIndex;
    const transparentMatch = source[3] === 0 && foreground[3] === 0;
    const colorMatch =
      source[3] > 0 &&
      foreground[3] > 0 &&
      (mode === ReplaceColorMode.Gray
        ? source[0] === foreground[0]
        : source[0] === foreground[0] &&
          source[1] === foreground[1] &&
          source[2] === foreground[2]);
    const matched =
      mode === ReplaceColorMode.Indexed ? indexedMatch : transparentMatch || colorMatch;
    if (matched) {
      writer.write(
        x,
        y,
        mergeBlend(source, background, opacity),
        mode === ReplaceColorMode.Indexed && opacity === UINT8_MAX ? backgroundIndex : undefined,
      );
    }
  });
  return writer.result();
}
export function paintLine(image: PixelBuffer, start: Point, end: Point, options: RasterOptions) {
  return paintStroke(image, [start, end], options);
}
/** Return the inclusive pixel corners used by Aseprite's two-point rectangle tool. */
export function rectanglePath(start: Point, end: Point): Point[] {
  const x1 = Math.floor(start.x),
    y1 = Math.floor(start.y),
    x2 = Math.floor(end.x),
    y2 = Math.floor(end.y);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
    { x: x1, y: y1 },
  ];
}
/** Paint one outlined rectangle as a closed stroke. A shared coverage set keeps
 * the four corners from receiving opacity more than once. */
export function paintRectangle(
  image: PixelBuffer,
  start: Point,
  end: Point,
  options: RasterOptions,
): RasterResult {
  return paintStroke(image, rectanglePath(start, end), {
    ...options,
    coverage: options.coverage ?? new Set<number>(),
  });
}
/** Exact in-place fills use the replacement pixels as their visited markers.
 * Eligibility guarantees that a written pixel can no longer match the source;
 * masks, indexed destinations and independent reference images use the general
 * path, where a separate visited map is required. */
function fillExactSolid(
  image: PixelBuffer,
  x: number,
  y: number,
  options: RasterOptions,
  writer: ReturnType<typeof pixelWriter>,
): RasterResult {
  const data = image.data,
    packed = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4),
    target = packed[y * image.width + x],
    transparent = data[(y * image.width + x) * 4 + 3] === 0,
    color = new Uint8ClampedArray(options.color),
    replacement = new Uint32Array(color.buffer)[0];
  if (!transparent && target === replacement) return writer.result();
  const clip = options.clip,
    minX = Math.max(0, clip ? Math.ceil(clip.x) : 0),
    minY = Math.max(0, clip ? Math.ceil(clip.y) : 0),
    maxX = Math.min(image.width - 1, clip ? Math.ceil(clip.x + clip.width) - 1 : image.width - 1),
    maxY = Math.min(
      image.height - 1,
      clip ? Math.ceil(clip.y + clip.height) - 1 : image.height - 1,
    ),
    matches = transparent
      ? (index: number) => data[index * 4 + 3] === 0
      : (index: number) => packed[index] === target,
    queue = [y * image.width + x];
  while (queue.length) {
    const seed = queue.pop()!;
    if (!matches(seed)) continue;
    const py = Math.floor(seed / image.width),
      row = py * image.width;
    let left = seed - row,
      right = left;
    while (left > minX && matches(row + left - 1)) left--;
    while (right < maxX && matches(row + right + 1)) right++;
    writer.writeSolidSpan(left, py, right, options.color);
    for (let ny = py - 1; ny <= py + 1; ny += 2) {
      if (ny < minY || ny > maxY) continue;
      let inRun = false;
      const nextRow = ny * image.width;
      for (let sx = left; sx <= right; sx++) {
        const candidate = matches(nextRow + sx);
        if (candidate && !inRun) queue.push(nextRow + sx);
        inRun = candidate;
      }
    }
  }
  return writer.result();
}

export function floodFill(
  image: PixelBuffer,
  point: Point,
  options: RasterOptions & { tolerance: number; contiguous: boolean },
): RasterResult {
  const x = Math.floor(point.x),
    y = Math.floor(point.y),
    w = pixelWriter(image, options);
  if (!allows(image, x, y, options)) return w.result();
  const referenceCandidate = options.referenceImage,
    referenceImage =
      referenceCandidate &&
      referenceCandidate.width === image.width &&
      referenceCandidate.height === image.height
        ? referenceCandidate
        : image,
    target = samplePixel(referenceImage, { x, y }),
    t = Math.max(0, Math.min(UINT8_MAX, options.tolerance)),
    opacity = opacityOf(options),
    data = referenceImage.data;
  const exact =
    t === 0 && target[3] !== 0 && data.byteOffset % 4 === 0
      ? new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)
      : null;
  const targetWord = exact?.[y * image.width + x];
  const matches = (px: number, py: number) => {
    if (!allows(image, px, py, options)) return false;
    if (exact) return exact[py * image.width + px] === targetWord;
    const i = (py * image.width + px) * 4;
    if (!data[i + 3] && !target[3]) return true;
    return (
      Math.abs(data[i] - target[0]) <= t &&
      Math.abs(data[i + 1] - target[1]) <= t &&
      Math.abs(data[i + 2] - target[2]) <= t &&
      Math.abs(data[i + 3] - target[3]) <= t
    );
  };
  const solid =
    options.ink !== AsepriteInk.LockAlpha &&
    options.ink !== AsepriteInk.Shading &&
    !options.colorAt &&
    options.color[3] === UINT8_MAX &&
    opacity === UINT8_MAX;
  if (
    options.contiguous &&
    solid &&
    t === 0 &&
    referenceImage === image &&
    Number.isInteger(image.width) &&
    Number.isInteger(image.height) &&
    !options.selection &&
    !options.indexedPixelWriter &&
    data.byteOffset % 4 === 0 &&
    data.byteLength % 4 === 0
  )
    return fillExactSolid(image, x, y, options, w);
  const apply = (px: number, py: number) =>
    w.write(
      px,
      py,
      solid
        ? options.color
        : inkBlend(
            samplePixel(image, { x: px, y: py }),
            options.color,
            opacity,
            options.ink,
            options,
          ),
    );
  if (!options.contiguous) {
    for (let py = 0; py < image.height; py++)
      for (let px = 0; px < image.width; px++) if (matches(px, py)) apply(px, py);
  } else {
    // Aseprite-style horizontal runs: queue spans rather than four neighbour objects per pixel.
    const visited = new Uint8Array(image.width * image.height),
      queue: number[] = [y * image.width + x];
    while (queue.length) {
      const key = queue.pop()!,
        px = key % image.width,
        py = Math.floor(key / image.width);
      if (visited[key] || !matches(px, py)) continue;
      let left = px,
        right = px;
      while (left > 0 && !visited[py * image.width + left - 1] && matches(left - 1, py)) left--;
      while (
        right + 1 < image.width &&
        !visited[py * image.width + right + 1] &&
        matches(right + 1, py)
      )
        right++;
      visited.fill(1, py * image.width + left, py * image.width + right + 1);
      if (solid) w.writeSolidSpan(left, py, right, options.color);
      else for (let sx = left; sx <= right; sx++) apply(sx, py);
      for (let ny = py - 1; ny <= py + 1; ny += 2) {
        if (ny < 0 || ny >= image.height) continue;
        let inRun = false;
        for (let sx = left; sx <= right; sx++) {
          const candidate = !visited[ny * image.width + sx] && matches(sx, ny);
          if (candidate && !inRun) queue.push(ny * image.width + sx);
          inRun = candidate;
        }
      }
    }
  }
  return w.result();
}
export function polygonMask(points: readonly Point[], width: number, height: number): PixelMask {
  const data = new Uint8Array(width * height);
  if (points.length)
    polygon(
      points.map((p) => [Math.floor(p.x), Math.floor(p.y)] as const),
      (x, y, end) => {
        if (y < 0 || y >= height || end < 0 || x >= width) return;
        data.fill(1, y * width + Math.max(0, x), y * width + Math.min(width, end + 1));
      },
    );
  return { x: 0, y: 0, width, height, data };
}
export function fillPolygon(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
): RasterResult {
  const mask = polygonMask(points, image.width, image.height),
    w = pixelWriter(image, options),
    opacity = opacityOf(options);
  for (let i = 0; i < mask.data.length; i++)
    if (mask.data[i]) {
      const x = i % image.width,
        y = Math.floor(i / image.width);
      w.write(
        x,
        y,
        inkBlend(
          options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y }),
          options.colorAt?.(x, y) ?? options.color,
          opacity,
          options.ink,
          options,
        ),
      );
    }
  return w.result();
}
export function blurStroke(
  image: PixelBuffer,
  points: readonly Point[],
  options: RasterOptions,
): RasterResult {
  const w = pixelWriter(image, options),
    opacity = opacityOf(options),
    pending: { x: number; y: number; color: Rgba }[] = [];
  visitStroke(image, points, options, (x, y) => {
    let r = 0,
      g = 0,
      b = 0,
      a = 0,
      count = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.max(0, Math.min(image.width - 1, x + dx)),
          ny = Math.max(0, Math.min(image.height - 1, y + dy));
        const c = options.sourcePixel?.(nx, ny) ?? samplePixel(image, { x: nx, y: ny });
        if (c[3]) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
          count++;
        }
      }
    if (count)
      pending.push({
        x,
        y,
        color: mergeBlend(
          options.sourcePixel?.(x, y) ?? samplePixel(image, { x, y }),
          [Math.trunc(r / count), Math.trunc(g / count), Math.trunc(b / count), Math.trunc(a / 9)],
          opacity,
        ),
      });
  });
  for (const p of pending) w.write(p.x, p.y, p.color);
  return w.result();
}
export function alphaBounds(image: PixelBuffer): Rect | null {
  let x0 = image.width,
    y0 = image.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.data[(y * image.width + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
