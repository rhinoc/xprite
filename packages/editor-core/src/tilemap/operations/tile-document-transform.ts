import { MAX_DOCUMENT_PIXEL_BYTES, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { BITS_PER_BYTE } from "$/base/numeric-constants";
import type { Rect, PixelBuffer, Rgba } from "$/base/primitives";
import { PixelResizeMethod } from "$/base/primitives";
import { cropSampleImage, resizeSampleImage } from "$/color/image-transforms";
import { expandAsepriteSamples, paletteForColors } from "$/color/samples";
import { assertDimension } from "$/document/pixel-validation";
import {
  tilesetForLayer,
  refreshTilemapProjections,
  assertTilemapTimeline,
  TILE_INDEX_MASK,
  type TilemapImage,
} from "$/tilemap/model";
import type { SpriteTimeline, TimelineCel } from "$/timeline/timeline";

/** Preflight includes map projections (deduplicated by map/set/palette) and tileset storage. */
export function validateTilemapTransform(
  t: SpriteTimeline,
  dimensions: (w: number, h: number) => [number, number],
  rotate = false,
) {
  let bytes = 0;
  const images = new Set<PixelBuffer>();
  const seen = new Map<TilemapImage, Set<string>>();
  const add = (w: number, h: number, channels: number) => {
    assertDimension(w, "width");
    assertDimension(h, "height");
    bytes += w * h * channels;
    if (bytes > MAX_DOCUMENT_PIXEL_BYTES)
      throw new RangeError("Tilemap transform exceeds memory limit");
  };
  for (const set of t.tilesets ?? []) {
    const [w, h] = dimensions(set.tileWidth, set.tileHeight);
    add(w, h * set.tileCount, 4 + (set.asepritePixels ? t.colorDepth! / BITS_PER_BYTE : 0));
  }
  for (let fi = 0; fi < t.frames.length; fi++)
    t.frames[fi].cels.forEach((c, li) => {
      if (!c) return;
      if (!c.tilemap) {
        if (!images.has(c.pixels)) {
          images.add(c.pixels);
          const [w, h] = dimensions(c.pixels.width, c.pixels.height);
          add(w, h, 4 + (c.asepriteSamples ? c.asepriteSamples.depth / BITS_PER_BYTE : 0));
        }
        return;
      }
      const set = tilesetForLayer(t, li),
        [w, h] = dimensions(set.tileWidth, set.tileHeight),
        key = `${set.id}:${t.colorDepth === 8 ? fi : 0}`;
      let keys = seen.get(c.tilemap);
      if (!keys) {
        keys = new Set();
        seen.set(c.tilemap, keys);
        add(c.tilemap.width, c.tilemap.height, 4);
      }
      if (keys.has(key)) return;
      keys.add(key);
      add(
        (rotate ? c.tilemap.height : c.tilemap.width) * w,
        (rotate ? c.tilemap.width : c.tilemap.height) * h,
        4,
      );
    });
}
export function resizeTilemapSets(
  t: SpriteTimeline,
  sx: number,
  sy: number,
  method: PixelResizeMethod,
  palette: readonly Rgba[],
  resize: (
    p: PixelBuffer,
    w: number,
    h: number,
    m: PixelResizeMethod,
    fixTransparent?: boolean,
  ) => PixelBuffer,
): SpriteTimeline {
  const dimensions = (w: number, h: number): [number, number] => [
    Math.max(1, Math.trunc(w * sx)),
    Math.max(1, Math.trunc(h * sy)),
  ];
  validateTilemapTransform(t, dimensions);
  const tilesets = t.tilesets?.map((set) => {
    const [w, h] = dimensions(set.tileWidth, set.tileHeight),
      rw = Math.max(1, Math.round(set.tileWidth * sx)),
      rh = Math.max(1, Math.round(set.tileHeight * sy)),
      stride = set.tileWidth * set.tileHeight,
      pixels = new Uint8Array(w * h * set.tileCount * 4),
      depth = t.colorDepth,
      channels = depth === 8 || depth === 16 ? depth / BITS_PER_BYTE : 0,
      asepritePixels =
        set.asepritePixels && channels
          ? new Uint8Array(w * h * set.tileCount * channels)
          : undefined;
    if (asepritePixels && depth === 8) asepritePixels.fill(t.transparentIndex ?? 0);
    for (let i = 1; i < set.tileCount; i++) {
      if (method === PixelResizeMethod.RotSprite && stride * 64 > MAX_IMAGE_PIXELS)
        throw new RangeError("RotSprite tile exceeds memory limit");
      if (asepritePixels && set.asepritePixels && (depth === 8 || depth === 16)) {
        const resized = resizeSampleImage(
          {
            depth,
            width: set.tileWidth,
            height: set.tileHeight,
            data: set.asepritePixels.subarray(i * stride * channels, (i + 1) * stride * channels),
          },
          rw,
          rh,
          method,
          paletteForColors(t.frames[0].palette ?? palette),
          t.transparentIndex ?? 0,
          resize,
          t.transparentIndex ?? 0,
        );
        const sourceSamples = cropSampleImage(
          resized,
          { x: 0, y: 0, width: w, height: h },
          depth === 8 ? [t.transparentIndex ?? 0] : [0, 0],
        );
        asepritePixels.set(sourceSamples.data, i * w * h * channels);
        pixels.set(
          expandAsepriteSamples(
            sourceSamples,
            paletteForColors(t.frames[0].palette ?? palette),
            t.transparentIndex ?? 0,
          ),
          i * w * h * 4,
        );
      } else {
        const block = resize(
          {
            width: set.tileWidth,
            height: set.tileHeight,
            data: new Uint8ClampedArray(set.pixels.subarray(i * stride * 4, (i + 1) * stride * 4)),
          },
          rw,
          rh,
          method,
        );
        for (let y = 0; y < h; y++)
          pixels.set(block.data.subarray(y * rw * 4, (y * rw + w) * 4), (i * w * h + y * w) * 4);
      }
    }
    for (let i = 0; i < pixels.length; i += 4) if (!pixels[i + 3]) pixels.fill(0, i, i + 4);
    return { ...set, tileWidth: w, tileHeight: h, pixels, asepritePixels };
  });
  return { ...t, tilesets };
}
/** Aseprite rotate_image moves packed tile words verbatim; tile artwork is unchanged. */
export function rotateTilemap(map: TilemapImage, angle: 90 | -90 | 180): TilemapImage {
  const width = angle === 180 ? map.width : map.height,
    height = angle === 180 ? map.height : map.width,
    tiles = new Uint32Array(width * height);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const xx = angle === 90 ? map.height - 1 - y : angle === -90 ? y : map.width - 1 - x,
        yy = angle === 90 ? x : angle === -90 ? map.width - 1 - x : map.height - 1 - y;
      tiles[yy * width + xx] = map.tiles[y * map.width + x];
    }
  return { width, height, tiles };
}
export function cropTilemapCel(
  cel: TimelineCel,
  tw: number,
  th: number,
  b: Rect,
): TimelineCel | null {
  const map = cel.tilemap!;
  let l = Math.max(0, Math.floor((b.x - cel.x) / tw)),
    top = Math.max(0, Math.floor((b.y - cel.y) / th)),
    r = Math.min(map.width, Math.ceil((b.x + b.width - cel.x) / tw)),
    bottom = Math.min(map.height, Math.ceil((b.y + b.height - cel.y) / th));
  if (r <= l || bottom <= top) return null;
  let ll = r,
    tt = bottom,
    rr = l,
    bb = top;
  for (let y = top; y < bottom; y++)
    for (let x = l; x < r; x++)
      if (map.tiles[y * map.width + x] & TILE_INDEX_MASK) {
        ll = Math.min(ll, x);
        tt = Math.min(tt, y);
        rr = Math.max(rr, x + 1);
        bb = Math.max(bb, y + 1);
      }
  if (rr <= ll || bb <= tt) return null;
  [l, top, r, bottom] = [ll, tt, rr, bb];
  const width = r - l,
    height = bottom - top;
  let tilemap = map;
  if (l || top || width !== map.width || height !== map.height) {
    const tiles = new Uint32Array(width * height);
    for (let y = 0; y < height; y++)
      tiles.set(
        map.tiles.subarray((y + top) * map.width + l, (y + top) * map.width + r),
        y * width,
      );
    tilemap = { width, height, tiles };
  }
  return { ...cel, tilemap, x: cel.x + l * tw - b.x, y: cel.y + top * th - b.y };
}
export function finishTilemapTransform(t: SpriteTimeline) {
  const next = refreshTilemapProjections(t);
  assertTilemapTimeline(next);
  return next;
}
