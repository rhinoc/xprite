import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import {
  FIXED_POINT_16_16_HALF,
  FIXED_POINT_16_16_MAX,
  FIXED_POINT_16_16_SCALE,
  UINT8_MAX,
  BITS_PER_BYTE,
} from "$/base/numeric-constants";
import {
  PixelResizeMethod,
  type PixelBuffer,
  type PixelMask,
  type Rect,
  type Rgba,
} from "$/base/primitives";
import { cropSampleImage, resizeSampleImage } from "$/color/image-transforms";
import {
  asepriteBackgroundSample,
  asepriteProjectionCache,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import { activateTimelineCel, ensureTimeline } from "$/document/document";
import { assertDimension } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import { CanvasAnchor, type SpriteResizeMethod } from "$/image-editing/types";
import { tilesetForLayer, type TilemapImage } from "$/tilemap/model";
import {
  resizeTilemapSets,
  rotateTilemap,
  cropTilemapCel,
  finishTilemapTransform,
  validateTilemapTransform,
} from "$/tilemap/operations/tile-document-transform";
import {
  renderTimelineFrame,
  isBackgroundLayer,
  LAYER_REFERENCE,
  type TimelineCel,
} from "$/timeline/timeline";

export { CanvasAnchor } from "$/image-editing/types";
export type { SpriteResizeMethod } from "$/image-editing/types";
function validateSize(width: number, height: number) {
  assertDimension(width, "width");
  assertDimension(height, "height");
  if (width * height > MAX_IMAGE_PIXELS)
    throw new RangeError(`Image exceeds ${MAX_IMAGE_PIXELS} pixels`);
}
function buffer(width: number, height: number): PixelBuffer {
  validateSize(width, height);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
/** CanvasSizeWindow::updateBorderFromSize: Aseprite integer division truncates
 * toward zero; an odd horizontal remainder belongs right, vertical goes top. */
export function canvasBoundsForAnchor(
  oldWidth: number,
  oldHeight: number,
  width: number,
  height: number,
  anchor: CanvasAnchor = CanvasAnchor.Center,
): Rect {
  validateSize(width, height);
  const dx = width - oldWidth,
    dy = height - oldHeight,
    col = anchor % 3,
    row = Math.floor(anchor / 3);
  const left = col === 0 ? 0 : col === 2 ? dx : Math.trunc(dx / 2);
  const top = row === 0 ? 0 : row === 2 ? dy : dy - Math.trunc(dy / 2);
  return { x: -left || 0, y: -top || 0, width, height };
}
function crop(image: PixelBuffer, bounds: Rect, fill: Rgba = [0, 0, 0, 0]) {
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    bounds.width === image.width &&
    bounds.height === image.height
  )
    return image;
  const result = buffer(bounds.width, bounds.height);
  for (let y = 0; y < bounds.height; y++)
    for (let x = 0; x < bounds.width; x++) {
      const sx = x + bounds.x,
        sy = y + bounds.y,
        i = (y * bounds.width + x) * 4;
      result.data.set(
        sx >= 0 && sy >= 0 && sx < image.width && sy < image.height
          ? image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4)
          : fill,
        i,
      );
    }
  return result;
}
function contentBounds(
  image: PixelBuffer,
  reference?: readonly number[],
  region: Rect = { x: 0, y: 0, width: image.width, height: image.height },
  asepriteSamples?: AsepriteImageSamples,
  maskIndex = 0,
): Rect | null {
  let l = image.width,
    t = image.height,
    r = -1,
    b = -1;
  for (let y = region.y; y < region.y + region.height; y++)
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * image.width + x) * 4;
      if (
        reference
          ? reference[3] === 0
            ? image.data[i + 3] === 0
            : reference.every((v, c) => image.data[i + c] === v)
          : asepriteSamples?.depth === 8
            ? asepriteSamples.data[y * image.width + x] === maskIndex
            : image.data[i + 3] === 0
      )
        continue;
      l = Math.min(l, x);
      t = Math.min(t, y);
      r = Math.max(r, x);
      b = Math.max(b, y);
    }
  return r < l ? null : { x: l, y: t, width: r - l + 1, height: b - t + 1 };
}
/** Match loadTimeline's unique-cel memory budget before allocating any image.
 * Sharing is counted once, but a transformed image and retained reference
 * image are distinct outputs even when they originally shared pixel storage. */
function transformBudget() {
  const seen = new Map<PixelBuffer, Set<string>>();
  let pixels = 0;
  return (image: PixelBuffer, key: string, width: number, height: number) => {
    validateSize(width, height);
    let keys = seen.get(image);
    if (!keys) {
      keys = new Set();
      seen.set(image, keys);
    }
    if (keys.has(key)) return;
    keys.add(key);
    pixels += width * height;
    if (pixels > MAX_IMAGE_PIXELS)
      throw new RangeError("Sprite cel memory exceeds the editor limit");
  };
}
function commit(
  doc: EditorDocument,
  timeline: NonNullable<EditorDocument["timeline"]>,
  width: number,
  height: number,
  selection: PixelMask | null,
) {
  doc.timeline = timeline;
  doc.width = width;
  doc.height = height;
  doc.selection = selection;
  activateTimelineCel(doc, timeline.activeFrame, timeline.activeLayer);
}
/** DocApi::cropSprite / cropCel. Transparent out-of-canvas content survives
 * unless trimOutside is checked. Background always fills and fits the canvas. */
export function resizeDocumentCanvas(
  doc: EditorDocument,
  bounds: Rect,
  trimOutside = false,
  background: Rgba = [0, 0, 0, UINT8_MAX],
  backgroundIndex?: number,
) {
  validateSize(bounds.width, bounds.height);
  if (!Number.isSafeInteger(bounds.x) || !Number.isSafeInteger(bounds.y))
    throw new RangeError("Canvas origin must be integral");
  const timeline = doc.timeline ?? ensureTimeline({ ...doc, layer: { ...doc.layer } }),
    cache = new Map<PixelBuffer, Map<string, PixelBuffer>>();
  const tileCrops = new Map<TilemapImage, TimelineCel | null>();
  const plan = transformBudget();
  for (const frame of timeline.frames)
    for (let index = 0; index < frame.cels.length; index++) {
      const cel = frame.cels[index];
      if (!cel) continue;
      const layer = timeline.layers[index],
        image = cel.pixels;
      if (cel.tilemap) {
        plan(image, "original", image.width, image.height);
        continue;
      }
      if (isBackgroundLayer(layer)) {
        const original =
          bounds.x === cel.x &&
          bounds.y === cel.y &&
          bounds.width === image.width &&
          bounds.height === image.height;
        plan(
          image,
          original ? "original" : `background:${bounds.x - cel.x},${bounds.y - cel.y}`,
          bounds.width,
          bounds.height,
        );
      } else if (!trimOutside || layer.flags & LAYER_REFERENCE)
        plan(image, "original", image.width, image.height);
      else {
        const x = Math.max(0, bounds.x - cel.x),
          y = Math.max(0, bounds.y - cel.y),
          right = Math.min(image.width, bounds.x + bounds.width - cel.x),
          bottom = Math.min(image.height, bounds.y + bounds.height - cel.y);
        if (right <= x || bottom <= y) continue;
        const content = contentBounds(
          image,
          undefined,
          { x, y, width: right - x, height: bottom - y },
          cel.asepriteSamples,
          timeline.transparentIndex ?? 0,
        );
        if (!content) continue;
        const original =
          content.x === 0 &&
          content.y === 0 &&
          content.width === image.width &&
          content.height === image.height;
        plan(
          image,
          original ? "original" : `crop:${x},${y},${right - x},${bottom - y}`,
          content.width,
          content.height,
        );
      }
    }

  const cachedCrop = (image: PixelBuffer, rect: Rect, fill?: Rgba) => {
    const key = [rect.x, rect.y, rect.width, rect.height, ...(fill ?? [])].join(",");
    let entries = cache.get(image);
    if (!entries) {
      entries = new Map();
      cache.set(image, entries);
    }
    let result = entries.get(key);
    if (!result) {
      result = crop(image, rect, fill);
      entries.set(key, result);
    }
    return result;
  };
  const sampleCache = new Map<AsepriteImageSamples, Map<string, AsepriteImageSamples>>(),
    projectAsepriteSamples = asepriteProjectionCache();
  const cachedSampleCrop = (image: AsepriteImageSamples, rect: Rect, fill: readonly number[]) => {
    let entries = sampleCache.get(image);
    if (!entries) {
      entries = new Map();
      sampleCache.set(image, entries);
    }
    const key = [rect.x, rect.y, rect.width, rect.height, ...fill].join(",");
    let result = entries.get(key);
    if (!result) {
      result = cropSampleImage(image, rect, fill);
      entries.set(key, result);
    }
    return result;
  };
  const frames = timeline.frames.map((frame) => ({
    ...frame,
    cels: frame.cels.map((cel, index): TimelineCel | null => {
      if (!cel) return null;
      const layer = timeline.layers[index];
      if (cel.tilemap && trimOutside) {
        let cropped = tileCrops.get(cel.tilemap);
        if (cropped === undefined) {
          const set = tilesetForLayer(timeline, index);
          cropped = cropTilemapCel(cel, set.tileWidth, set.tileHeight, bounds);
          tileCrops.set(cel.tilemap, cropped);
        }
        return cropped ? { ...cel, tilemap: cropped.tilemap, x: cropped.x, y: cropped.y } : null;
      }
      if (layer.flags & LAYER_REFERENCE) {
        const preciseBounds = cel.preciseBounds ?? {
          x: cel.x,
          y: cel.y,
          width: cel.pixels.width,
          height: cel.pixels.height,
        };
        return {
          ...cel,
          x: Math.trunc(preciseBounds.x - bounds.x),
          y: Math.trunc(preciseBounds.y - bounds.y),
          preciseBounds: {
            ...preciseBounds,
            x: preciseBounds.x - bounds.x,
            y: preciseBounds.y - bounds.y,
          },
        };
      }
      if (isBackgroundLayer(layer)) {
        const rect = { ...bounds, x: bounds.x - cel.x, y: bounds.y - cel.y };
        if (cel.asepriteSamples) {
          const asepriteSamples = cachedSampleCrop(
            cel.asepriteSamples,
            rect,
            asepriteBackgroundSample(
              cel.asepriteSamples.depth,
              background,
              paletteForColors(doc.palette),
              backgroundIndex,
            ),
          );
          return {
            ...cel,
            x: 0,
            y: 0,
            asepriteSamples,
            pixels: projectAsepriteSamples(asepriteSamples, frame.palette ?? doc.palette, -1),
          };
        }
        return {
          ...cel,
          x: 0,
          y: 0,
          pixels: cachedCrop(cel.pixels, rect, [
            background[0],
            background[1],
            background[2],
            UINT8_MAX,
          ]),
        };
      }
      if (!trimOutside) return { ...cel, x: cel.x - bounds.x, y: cel.y - bounds.y };
      const x = Math.max(bounds.x, cel.x),
        y = Math.max(bounds.y, cel.y),
        right = Math.min(bounds.x + bounds.width, cel.x + cel.pixels.width),
        bottom = Math.min(bounds.y + bounds.height, cel.y + cel.pixels.height);
      if (right <= x || bottom <= y) return null;
      let pixels = cachedCrop(cel.pixels, {
        x: x - cel.x,
        y: y - cel.y,
        width: right - x,
        height: bottom - y,
      });
      let asepriteSamples = cel.asepriteSamples
        ? cachedSampleCrop(
            cel.asepriteSamples,
            { x: x - cel.x, y: y - cel.y, width: right - x, height: bottom - y },
            cel.asepriteSamples.depth === 8 ? [timeline.transparentIndex ?? 0] : [0, 0],
          )
        : undefined;
      const content = contentBounds(
        pixels,
        undefined,
        undefined,
        asepriteSamples,
        timeline.transparentIndex ?? 0,
      );
      if (!content) return null;
      pixels = cachedCrop(pixels, content);
      if (asepriteSamples)
        asepriteSamples = cachedSampleCrop(
          asepriteSamples,
          content,
          asepriteSamples.depth === 8 ? [timeline.transparentIndex ?? 0] : [0, 0],
        );
      return {
        ...cel,
        x: x + content.x - bounds.x,
        y: y + content.y - bounds.y,
        pixels,
        asepriteSamples,
      };
    }),
  }));
  const selection = doc.selection
    ? { ...doc.selection, x: doc.selection.x - bounds.x, y: doc.selection.y - bounds.y }
    : null;
  // DocApi::cropSprite offsets any nonempty mask, even when hidden by
  // DeselectMask. SpriteSize/Rotate intentionally affect visible masks only.
  const hiddenSelection = doc.hiddenSelection
    ? {
        ...doc.hiddenSelection,
        x: doc.hiddenSelection.x - bounds.x,
        y: doc.hiddenSelection.y - bounds.y,
      }
    : doc.hiddenSelection;
  commit(
    doc,
    finishTilemapTransform({ ...timeline, frames }),
    bounds.width,
    bounds.height,
    selection,
  );
  doc.hiddenSelection = hiddenSelection;
}
/** Source fixup_image_transparent_colors: average only opaque/nonzero-alpha
 * immediate neighbors, without changing the immutable history image. */
function fixTransparent(image: PixelBuffer): PixelBuffer {
  const data = image.data.slice();
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      if (data[i + 3]) continue;
      const sums = [0, 0, 0];
      let count = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(image.height - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(image.width - 1, x + 1); xx++) {
          const j = (yy * image.width + xx) * 4;
          if (!data[j + 3]) continue;
          count++;
          for (let c = 0; c < 3; c++) sums[c] += data[j + c];
        }
      if (count) for (let c = 0; c < 3; c++) data[i + c] = Math.trunc(sums[c] / count);
    }
  return { ...image, data };
}
function scale2x(image: PixelBuffer): PixelBuffer {
  const output = buffer(image.width * 2, image.height * 2),
    source = new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.length / 4),
    dest = new Uint32Array(output.data.buffer);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const p = source[y * image.width + x],
        a = y ? source[(y - 1) * image.width + x] : p,
        b = x < image.width - 1 ? source[y * image.width + x + 1] : p,
        c = x ? source[y * image.width + x - 1] : p,
        d = y < image.height - 1 ? source[(y + 1) * image.width + x] : p,
        i = y * 2 * output.width + x * 2;
      dest[i] = c === a && c !== d && a !== b ? a : p;
      dest[i + 1] = a === b && a !== c && b !== d ? b : p;
      dest[i + output.width] = d === c && d !== b && c !== a ? c : p;
      dest[i + output.width + 1] = b === d && b !== a && d !== c ? d : p;
    }
  return output;
}
// ARM's native compiler contracts bilinear multiply-adds. Dekker product
// residual keeps JS's separate arithmetic aligned with that single rounding.
function fusedMultiplyAdd(a: number, b: number, c: number): number {
  const p = a * b,
    split = 134217729,
    aa = split * a,
    ah = aa - (aa - a),
    al = a - ah,
    bb = split * b,
    bh = bb - (bb - b),
    bl = b - bh;
  const pe = ah * bh - p + ah * bl + al * bh + al * bl;
  const sum = p + c,
    z = sum - p,
    se = p - (sum - z) + (c - z);
  return sum + (pe + se);
}
export function resizeSpritePixels(
  image: PixelBuffer,
  width: number,
  height: number,
  method: SpriteResizeMethod,
  fixTransparentColors = true,
): PixelBuffer {
  const output = buffer(width, height);
  if (
    method !== PixelResizeMethod.Nearest &&
    method !== PixelResizeMethod.Bilinear &&
    method !== PixelResizeMethod.RotSprite
  )
    throw new RangeError("Unknown resize method");
  const source =
    method === PixelResizeMethod.Nearest || !fixTransparentColors ? image : fixTransparent(image);
  if (method === PixelResizeMethod.RotSprite) {
    // Axis-aligned specialization of rotsprite_image: three EPX passes,
    // fixed-point parallelogram sampling, then endpoint-aligned scale_image.
    let expanded = source;
    for (let n = 0; n < 3; n++) expanded = scale2x(expanded);
    const dx = Math.trunc((expanded.width / width / 8) * FIXED_POINT_16_16_SCALE),
      dy = Math.round((expanded.height * FIXED_POINT_16_16_SCALE - 1) / (height * 8));
    const stepX =
        width === 1 ? 0 : Math.round(((width * 8 - 1) / (width - 1)) * FIXED_POINT_16_16_SCALE),
      stepY =
        height === 1 ? 0 : Math.round(((height * 8 - 1) / (height - 1)) * FIXED_POINT_16_16_SCALE);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const bx = Math.floor((x * stepX + FIXED_POINT_16_16_HALF) / FIXED_POINT_16_16_SCALE),
          by = Math.floor((y * stepY + FIXED_POINT_16_16_HALF) / FIXED_POINT_16_16_SCALE);
        const sx = Math.min(
            expanded.width - 1,
            Math.floor(
              (Math.round((dx * FIXED_POINT_16_16_MAX) / FIXED_POINT_16_16_SCALE) + bx * dx) /
                FIXED_POINT_16_16_SCALE,
            ),
          ),
          sy = Math.min(
            expanded.height - 1,
            Math.floor((Math.round(dy / 2) + by * dy) / FIXED_POINT_16_16_SCALE),
          );
        const i = (sy * expanded.width + sx) * 4;
        output.data.set(expanded.data.subarray(i, i + 4), (y * width + x) * 4);
      }
    return output;
  }
  let v = 0;
  const du = width === 1 ? 0 : (source.width - 1) / (width - 1),
    dv = height === 1 ? 0 : (source.height - 1) / (height - 1);
  for (let y = 0; y < height; y++, v += dv) {
    let u = 0;
    for (let x = 0; x < width; x++, u += du) {
      const out = (y * width + x) * 4;
      if (method === PixelResizeMethod.Nearest) {
        const i =
          (Math.floor((y * source.height) / height) * source.width +
            Math.floor((x * source.width) / width)) *
          4;
        output.data.set(source.data.subarray(i, i + 4), out);
        continue;
      }
      const xx = Math.min(source.width - 1, Math.floor(u)),
        yy = Math.min(source.height - 1, Math.floor(v)),
        x2 = Math.min(source.width - 1, xx + 1),
        y2 = Math.min(source.height - 1, yy + 1),
        fx = u - xx,
        fy = v - yy;
      for (let c = 0; c < 4; c++)
        output.data[out + c] = Math.trunc(
          fusedMultiplyAdd(
            fusedMultiplyAdd(
              source.data[(yy * source.width + xx) * 4 + c],
              1 - fx,
              source.data[(yy * source.width + x2) * 4 + c] * fx,
            ),
            1 - fy,
            fusedMultiplyAdd(
              source.data[(y2 * source.width + xx) * 4 + c],
              1 - fx,
              source.data[(y2 * source.width + x2) * 4 + c] * fx,
            ) * fy,
          ),
        );
    }
  }
  return output;
}
function scaledMask(mask: PixelMask, scaleX: number, scaleY: number): PixelMask | null {
  const ow = mask.width + 2,
    oh = mask.height + 2,
    width = Math.max(1, Math.trunc(ow * scaleX)),
    height = Math.max(1, Math.trunc(oh * scaleY));
  validateSize(width, height);
  const data = new Uint8Array(width * height);
  let l = width,
    t = height,
    r = -1,
    b = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x * ow) / width) - 1,
        sy = Math.floor((y * oh) / height) - 1;
      if (
        sx >= 0 &&
        sy >= 0 &&
        sx < mask.width &&
        sy < mask.height &&
        mask.data[sy * mask.width + sx]
      ) {
        data[y * width + x] = UINT8_MAX;
        l = Math.min(l, x);
        t = Math.min(t, y);
        r = Math.max(r, x);
        b = Math.max(b, y);
      }
    }
  if (r < l) return null;
  const trimmed = new Uint8Array((r - l + 1) * (b - t + 1));
  for (let y = t; y <= b; y++)
    trimmed.set(data.subarray(y * width + l, y * width + r + 1), (y - t) * (r - l + 1));
  return {
    x: Math.trunc((mask.x - 1) * scaleX) + l,
    y: Math.trunc((mask.y - 1) * scaleY) + t,
    width: r - l + 1,
    height: b - t + 1,
    data: trimmed,
  };
}
export function resizeDocumentSprite(
  doc: EditorDocument,
  width: number,
  height: number,
  method: SpriteResizeMethod = PixelResizeMethod.Nearest,
) {
  validateSize(width, height);
  const timeline = doc.timeline ?? ensureTimeline({ ...doc, layer: { ...doc.layer } }),
    sx = width / doc.width,
    sy = height / doc.height,
    cache = new Map<PixelBuffer, PixelBuffer>();

  if (
    ![PixelResizeMethod.Nearest, PixelResizeMethod.Bilinear, PixelResizeMethod.RotSprite].includes(
      method,
    )
  )
    throw new RangeError("Unknown resize method");
  const plan = transformBudget();
  for (const frame of timeline.frames)
    for (let index = 0; index < frame.cels.length; index++) {
      const cel = frame.cels[index];
      if (!cel || cel.tilemap) continue;
      const image = cel.pixels;
      if (timeline.layers[index].flags & LAYER_REFERENCE)
        plan(image, "original", image.width, image.height);
      else {
        plan(
          image,
          "resize",
          Math.max(1, Math.trunc(image.width * sx)),
          Math.max(1, Math.trunc(image.height * sy)),
        );
        if (method === PixelResizeMethod.RotSprite) validateSize(image.width * 8, image.height * 8);
      }
    }

  const resizedTimeline = resizeTilemapSets(
    timeline,
    sx,
    sy,
    method,
    doc.palette ?? [],
    resizeSpritePixels,
  );
  const sampleCache = new Map<AsepriteImageSamples, AsepriteImageSamples>(),
    projectAsepriteSamples = asepriteProjectionCache();
  const frames = timeline.frames.map((frame) => ({
    ...frame,
    cels: frame.cels.map((cel, index) => {
      if (!cel) return null;
      if (cel.tilemap)
        return { ...cel, x: Math.trunc(cel.x * sx) || 0, y: Math.trunc(cel.y * sy) || 0 };
      if (timeline.layers[index].flags & LAYER_REFERENCE) {
        const b = cel.preciseBounds ?? {
          x: cel.x,
          y: cel.y,
          width: cel.pixels.width,
          height: cel.pixels.height,
        };
        return {
          ...cel,
          x: Math.trunc(b.x * sx),
          y: Math.trunc(b.y * sy),
          preciseBounds: { x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy },
        };
      }
      if (cel.asepriteSamples) {
        let asepriteSamples = sampleCache.get(cel.asepriteSamples);
        if (!asepriteSamples) {
          asepriteSamples = resizeSampleImage(
            cel.asepriteSamples,
            Math.max(1, Math.trunc(cel.asepriteSamples.width * sx)),
            Math.max(1, Math.trunc(cel.asepriteSamples.height * sy)),
            method,
            paletteForColors(frame.palette ?? doc.palette),
            isBackgroundLayer(timeline.layers[index]) ? -1 : (timeline.transparentIndex ?? 0),
            resizeSpritePixels,
            timeline.transparentIndex ?? 0,
          );
          sampleCache.set(cel.asepriteSamples, asepriteSamples);
        }
        return {
          ...cel,
          asepriteSamples,
          pixels: projectAsepriteSamples(
            asepriteSamples,
            frame.palette ?? doc.palette,
            isBackgroundLayer(timeline.layers[index]) ? -1 : (timeline.transparentIndex ?? 0),
          ),
          x: Math.trunc(cel.x * sx) || 0,
          y: Math.trunc(cel.y * sy) || 0,
        };
      }
      let pixels = cache.get(cel.pixels);
      if (!pixels) {
        pixels = resizeSpritePixels(
          cel.pixels,
          Math.max(1, Math.trunc(cel.pixels.width * sx)),
          Math.max(1, Math.trunc(cel.pixels.height * sy)),
          method,
        );
        cache.set(cel.pixels, pixels);
      }
      return { ...cel, pixels, x: Math.trunc(cel.x * sx) || 0, y: Math.trunc(cel.y * sy) || 0 };
    }),
  }));
  const selection = doc.selection ? scaledMask(doc.selection, sx, sy) : null;
  commit(doc, finishTilemapTransform({ ...resizedTimeline, frames }), width, height, selection);
}
/** Trim considers the rendered sprite over every frame, including solid
 * background border colors (autocrop.cpp), not the active layer alone. */
export function trimDocumentCanvas(doc: EditorDocument): boolean {
  const timeline = doc.timeline ?? ensureTimeline({ ...doc, layer: { ...doc.layer } });
  let l = doc.width,
    t = doc.height,
    r = -1,
    b = -1;
  for (let fi = 0; fi < timeline.frames.length; fi++) {
    const image = renderTimelineFrame(timeline, doc.width, doc.height, fi, undefined, false),
      a = Array.from(image.data.subarray(0, 4)),
      z = Array.from(image.data.subarray(image.data.length - 4));
    let reference = a,
      ambiguous = false;
    for (const horizontal of [true, false]) {
      let first = true,
        last = true,
        transparent = false;
      const n = horizontal ? image.width : image.height;
      for (let i = 0; i < n; i++) {
        const p = horizontal ? i * 4 : i * image.width * 4,
          q = horizontal
            ? ((image.height - 1) * image.width + i) * 4
            : (i * image.width + image.width - 1) * 4;
        if (!image.data[p + 3] || !image.data[q + 3]) transparent = true;
        if (a.some((v, c) => image.data[p + c] !== v)) first = false;
        if (z.some((v, c) => image.data[q + c] !== v)) last = false;
      }
      if (transparent) {
        reference = [0, 0, 0, 0];
        break;
      }
      if (!first && last) reference = z;
      else if (first && last && a.some((v, c) => z[c] !== v)) {
        ambiguous = true;
        break;
      }
    }
    if (ambiguous) continue;
    const bounds = contentBounds(image, reference);
    if (!bounds) continue;
    l = Math.min(l, bounds.x);
    t = Math.min(t, bounds.y);
    r = Math.max(r, bounds.x + bounds.width - 1);
    b = Math.max(b, bounds.y + bounds.height - 1);
  }
  if (r < l) return false;
  resizeDocumentCanvas(doc, { x: l, y: t, width: r - l + 1, height: b - t + 1 });
  return true;
}
function rotateBytes(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  angle: 90 | -90 | 180,
) {
  const out = data.slice(),
    newWidth = angle === 180 ? width : height;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const xx = angle === 90 ? height - 1 - y : angle === -90 ? y : width - 1 - x,
        yy = angle === 90 ? x : angle === -90 ? width - 1 - x : height - 1 - y;
      out.set(
        data.subarray((y * width + x) * channels, (y * width + x + 1) * channels),
        (yy * newWidth + xx) * channels,
      );
    }
  return out;
}
export function rotateDocumentCanvas(doc: EditorDocument, angle: 90 | -90 | 180) {
  if (angle !== 90 && angle !== -90 && angle !== 180)
    throw new RangeError("Expected a right-angle rotation");
  const timeline = doc.timeline ?? ensureTimeline({ ...doc, layer: { ...doc.layer } }),
    cache = new Map<PixelBuffer, PixelBuffer>(),
    width = angle === 180 ? doc.width : doc.height,
    height = angle === 180 ? doc.height : doc.width;
  validateTilemapTransform(timeline, (w, h) => [w, h], angle !== 180);
  const mapCache = new Map<TilemapImage, TilemapImage>();
  const rotateRect = (b: Rect): Rect => ({
    x: angle === 90 ? doc.height - b.y - b.height : angle === -90 ? b.y : doc.width - b.x - b.width,
    y: angle === 90 ? b.x : angle === -90 ? doc.width - b.x - b.width : doc.height - b.y - b.height,
    width: angle === 180 ? b.width : b.height,
    height: angle === 180 ? b.height : b.width,
  });
  const sampleCache = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  const frames = timeline.frames.map((frame) => ({
    ...frame,
    cels: frame.cels.map((cel) => {
      if (!cel) return null;
      if (cel.tilemap) {
        let tilemap = mapCache.get(cel.tilemap);
        if (!tilemap) {
          tilemap = rotateTilemap(cel.tilemap, angle);
          mapCache.set(cel.tilemap, tilemap);
        }
        const b = rotateRect({
          x: cel.x,
          y: cel.y,
          width: cel.pixels.width,
          height: cel.pixels.height,
        });
        return { ...cel, tilemap, x: b.x, y: b.y };
      }
      let pixels = cache.get(cel.pixels);
      if (!pixels) {
        pixels = {
          width: angle === 180 ? cel.pixels.width : cel.pixels.height,
          height: angle === 180 ? cel.pixels.height : cel.pixels.width,
          data: rotateBytes(
            cel.pixels.data,
            cel.pixels.width,
            cel.pixels.height,
            4,
            angle,
          ) as Uint8ClampedArray,
        };
        cache.set(cel.pixels, pixels);
      }
      let asepriteSamples = cel.asepriteSamples;
      if (asepriteSamples) {
        let rotated = sampleCache.get(asepriteSamples);
        if (!rotated) {
          rotated = {
            ...asepriteSamples,
            width: angle === 180 ? asepriteSamples.width : asepriteSamples.height,
            height: angle === 180 ? asepriteSamples.height : asepriteSamples.width,
            data: rotateBytes(
              asepriteSamples.data,
              asepriteSamples.width,
              asepriteSamples.height,
              asepriteSamples.depth / BITS_PER_BYTE,
              angle,
            ) as Uint8Array,
          };
          sampleCache.set(asepriteSamples, rotated);
        }
        asepriteSamples = rotated;
      }
      const b = rotateRect(
        cel.preciseBounds ?? {
          x: cel.x,
          y: cel.y,
          width: cel.pixels.width,
          height: cel.pixels.height,
        },
      );
      return {
        ...cel,
        pixels,
        asepriteSamples,
        x: Math.trunc(b.x),
        y: Math.trunc(b.y),
        ...(cel.preciseBounds ? { preciseBounds: b } : {}),
      };
    }),
  }));
  const m = doc.selection,
    selection = m
      ? { ...rotateRect(m), data: rotateBytes(m.data, m.width, m.height, 1, angle) as Uint8Array }
      : null;
  commit(doc, finishTilemapTransform({ ...timeline, frames }), width, height, selection);
}
