import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import type { AsepriteTileset } from "$/import-export/aseprite/model";
import { TilesetMode, type TilemapImage } from "$/tilemap/types";
import type { SpriteTimeline, TimelineCel } from "$/timeline/timeline";
export { TilesetMode } from "$/tilemap/types";
export type { TilemapImage } from "$/tilemap/types";
import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, Point, Rgba } from "$/base/primitives";
import {
  encodeAsepriteSamples,
  expandAsepriteSamples,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";

export const TILE_INDEX_MASK = 0x1fffffff,
  TILE_X_FLIP = 0x80000000,
  TILE_Y_FLIP = 0x40000000,
  TILE_DIAGONAL_FLIP = 0x20000000;
export type TilemapEditMode = TilesetMode;
function size(width: number, height: number) {
  assertDimension(width, "tilemap width");
  assertDimension(height, "tilemap height");
  assertPixelCount(width, height);
}
export function tilesetForLayer(t: SpriteTimeline, li: number): AsepriteTileset {
  const set = t.tilesets?.find((s) => s.id === t.layers[li]?.tilesetId);
  if (!set) throw new Error("Missing Tileset");
  return set;
}
function setPixels(
  set: AsepriteTileset,
  depth?: 8 | 16 | 32,
  palette?: readonly Rgba[],
  transparentIndex = 0,
): Uint8Array | Uint8ClampedArray {
  return set.asepritePixels && (depth === 8 || depth === 16)
    ? expandAsepriteSamples(
        {
          depth,
          width: set.tileWidth,
          height: set.tileHeight * set.tileCount,
          data: set.asepritePixels,
        },
        paletteForColors(palette),
        transparentIndex,
      )
    : set.pixels;
}
/** Diagonal flip flags transpose the common square of a rectangular tile. */
function sourcePoint(
  x: number,
  y: number,
  w: number,
  h: number,
  tile: number,
): [number, number] | null {
  let sx = tile & TILE_X_FLIP ? w - 1 - x : x,
    sy = tile & TILE_Y_FLIP ? h - 1 - y : y;
  if (tile & TILE_DIAGONAL_FLIP) {
    [sx, sy] = [sy, sx];
    if (sx >= Math.min(w, h) || sy >= Math.min(w, h)) return null;
  }
  return [sx, sy];
}
/** Read the canonical index of a projected tile pixel without expanding the tile image. */
export function tilemapIndexedPixelAt(
  timeline: SpriteTimeline,
  layerIndex: number,
  local: Point,
): number | undefined {
  const map = timeline.frames[timeline.activeFrame].cels[layerIndex]?.tilemap;
  const set = timeline.tilesets?.find(
    (entry) => entry.id === timeline.layers[layerIndex].tilesetId,
  );
  if (timeline.colorDepth !== 8 || !map || !set?.asepritePixels) return undefined;
  const cellX = Math.floor(local.x / set.tileWidth);
  const cellY = Math.floor(local.y / set.tileHeight);
  if (cellX < 0 || cellY < 0 || cellX >= map.width || cellY >= map.height) return undefined;
  const tile = map.tiles[cellY * map.width + cellX];
  const index = tile & TILE_INDEX_MASK;
  if (!index) return timeline.transparentIndex ?? 0;
  const source = sourcePoint(
    local.x - cellX * set.tileWidth,
    local.y - cellY * set.tileHeight,
    set.tileWidth,
    set.tileHeight,
    tile,
  );
  if (!source) return timeline.transparentIndex ?? 0;
  return set.asepritePixels[(index * set.tileHeight + source[1]) * set.tileWidth + source[0]];
}

export function rasterizeTilemap(
  map: TilemapImage,
  set: AsepriteTileset,
  depth?: 8 | 16 | 32,
  palette?: readonly Rgba[],
  transparentIndex = 0,
): PixelBuffer {
  const w = set.tileWidth,
    h = set.tileHeight,
    width = map.width * w,
    height = map.height * h;
  size(width, height);
  if (map.tiles.length !== map.width * map.height) throw new Error("Invalid tilemap cells");
  const data = new Uint8ClampedArray(width * height * 4),
    src = setPixels(set, depth, palette, transparentIndex);
  for (let cell = 0; cell < map.tiles.length; cell++) {
    const tile = map.tiles[cell],
      id = tile & TILE_INDEX_MASK;
    if (!id) continue;
    if (id >= set.tileCount) throw new RangeError("Tile index outside Tileset");
    const ox = (cell % map.width) * w,
      oy = Math.floor(cell / map.width) * h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = sourcePoint(x, y, w, h, tile);
        if (!p) continue;
        const at = ((id * h + p[1]) * w + p[0]) * 4;
        data.set(src.subarray(at, at + 4), ((oy + y) * width + ox + x) * 4);
      }
  }
  return { width, height, data };
}
export function refreshTilemapProjections(t: SpriteTimeline): SpriteTimeline {
  const cache = new Map<TilemapImage, Map<AsepriteTileset, Map<unknown, PixelBuffer>>>();
  return {
    ...t,
    frames: t.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel, li) => {
        if (!cel?.tilemap) return cel;
        let bySet = cache.get(cel.tilemap);
        if (!bySet) {
          bySet = new Map();
          cache.set(cel.tilemap, bySet);
        }
        const set = tilesetForLayer(t, li);
        let byPalette = bySet.get(set);
        if (!byPalette) {
          byPalette = new Map();
          bySet.set(set, byPalette);
        }
        const key = t.colorDepth === 8 ? frame.palette : set;
        let pixels = byPalette.get(key);
        if (!pixels) {
          pixels = rasterizeTilemap(
            cel.tilemap,
            set,
            t.colorDepth,
            frame.palette,
            t.transparentIndex,
          );
          byPalette.set(key, pixels);
        }
        return { ...cel, pixels, asepriteSamples: undefined };
      }),
    })),
  };
}
function replaceCel(t: SpriteTimeline, fi: number, li: number, cel: TimelineCel): SpriteTimeline {
  const old = t.frames[fi].cels[li];
  return {
    ...t,
    frames: t.frames.map((f, i) => ({
      ...f,
      cels: f.cels.map((c, l) =>
        i === fi && l === li
          ? cel
          : old?.tilemap && c?.tilemap === old.tilemap
            ? { ...c, tilemap: cel.tilemap, x: c.x + cel.x - old.x, y: c.y + cel.y - old.y }
            : c,
      ),
    })),
  };
}
export function setTileAt(
  t: SpriteTimeline,
  fi: number,
  li: number,
  gridX: number,
  gridY: number,
  tile: number,
): SpriteTimeline {
  const set = tilesetForLayer(t, li);
  if (
    !Number.isInteger(gridX) ||
    !Number.isInteger(gridY) ||
    (tile & TILE_INDEX_MASK) >= set.tileCount
  )
    throw new RangeError("Invalid tile placement");
  const old = t.frames[fi].cels[li],
    map = old?.tilemap;
  const left = Math.min(0, gridX),
    top = Math.min(0, gridY),
    width = Math.max(map?.width ?? 0, gridX + 1) - left,
    height = Math.max(map?.height ?? 0, gridY + 1) - top;
  size(width * set.tileWidth, height * set.tileHeight);
  const tiles = new Uint32Array(width * height);
  if (map)
    for (let y = 0; y < map.height; y++)
      tiles.set(map.tiles.subarray(y * map.width, (y + 1) * map.width), (y - top) * width - left);
  tiles[(gridY - top) * width + gridX - left] = tile >>> 0;
  const cel = {
    ...old,
    x: (old?.x ?? t.gridBounds?.x ?? 0) + left * set.tileWidth,
    y: (old?.y ?? t.gridBounds?.y ?? 0) + top * set.tileHeight,
    opacity: old?.opacity ?? UINT8_MAX,
    zIndex: old?.zIndex ?? 0,
    tilemap: { width, height, tiles },
    pixels: old?.pixels ?? { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  };
  return refreshTilemapProjections(replaceCel(t, fi, li, cel));
}
export interface TilemapLayerOptions {
  name?: string;
  tilesetName?: string;
  tileWidth: number;
  tileHeight: number;
  tilesetId?: number;
  baseIndex?: number;
  matchFlags?: number;
  width?: number;
  height?: number;
}
export function createTilemapLayer(
  t: SpriteTimeline,
  options: TilemapLayerOptions,
): SpriteTimeline {
  size(options.tileWidth, options.tileHeight);
  let sets = t.tilesets ?? [],
    set =
      options.tilesetId === undefined ? undefined : sets.find((s) => s.id === options.tilesetId);
  if (options.tilesetId !== undefined && !set) throw new Error("Missing Tileset");
  if (!set) {
    set = {
      id: Math.max(-1, ...sets.map((s) => s.id)) + 1,
      name: options.tilesetName ?? options.name ?? "Tileset",
      flags: 2 | 4 | ((options.matchFlags ?? 0) & 0x38),
      tileWidth: options.tileWidth,
      tileHeight: options.tileHeight,
      tileCount: 1,
      baseIndex: options.baseIndex ?? 1,
      pixels: new Uint8Array(options.tileWidth * options.tileHeight * 4),
      asepritePixels:
        t.colorDepth === 8
          ? new Uint8Array(options.tileWidth * options.tileHeight).fill(t.transparentIndex ?? 0)
          : t.colorDepth === 16
            ? new Uint8Array(options.tileWidth * options.tileHeight * 2)
            : undefined,
    };
    sets = [...sets, set];
  }
  const li = t.layers.length;
  return {
    ...t,
    tilesets: sets,
    layers: [
      ...t.layers,
      {
        id: `tilemap-${Date.now()}-${li}`,
        kind: "tilemap",
        tilesetId: set.id,
        name: options.name ?? "Tilemap",
        visible: true,
        locked: false,
        opacity: UINT8_MAX,
        flags: 3,
      },
    ],
    frames: t.frames.map((f) => ({ ...f, cels: [...f.cels, null] })),
    activeLayer: li,
  };
}
function same(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function sampleBlock(pixels: PixelBuffer, x: number, y: number, w: number, h: number) {
  const result = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      if (xx + x < 0 || yy + y < 0 || xx + x >= pixels.width || yy + y >= pixels.height) continue;
      const at = ((yy + y) * pixels.width + xx + x) * 4;
      result.set(pixels.data.subarray(at, at + 4), (yy * w + xx) * 4);
    }
  return result;
}
export function commitTilemapPixels(
  t: SpriteTimeline,
  fi: number,
  li: number,
  pixels: PixelBuffer,
  x: number,
  y: number,
  mode: TilemapEditMode = TilesetMode.Auto,
  asepriteSamples?: AsepriteImageSamples,
): SpriteTimeline {
  if (tilesetForLayer(t, li).external && !(tilesetForLayer(t, li).flags & 2))
    throw new Error("External Tileset has no embedded pixels to edit");
  if (asepriteSamples && (t.colorDepth === 8 || t.colorDepth === 16))
    return commitTilemapSamples(t, fi, li, pixels, x, y, mode, asepriteSamples);
  const set = tilesetForLayer(t, li),
    old = t.frames[fi].cels[li],
    w = set.tileWidth,
    h = set.tileHeight,
    bx = old?.x ?? t.gridBounds?.x ?? 0,
    by = old?.y ?? t.gridBounds?.y ?? 0;
  if (mode === TilesetMode.Manual && !old?.tilemap) return t;
  const left = mode === TilesetMode.Manual ? 0 : Math.floor((x - bx) / w),
    top = mode === TilesetMode.Manual ? 0 : Math.floor((y - by) / h),
    right =
      mode === TilesetMode.Manual ? old!.tilemap!.width : Math.ceil((x + pixels.width - bx) / w),
    bottom =
      mode === TilesetMode.Manual ? old!.tilemap!.height : Math.ceil((y + pixels.height - by) / h),
    width = right - left,
    height = bottom - top;
  size(width * w, height * h);
  const usage = new Map<number, number>(),
    seenMaps = new Set<TilemapImage>();
  for (const f of t.frames)
    f.cels.forEach((c, l) => {
      if (c?.tilemap && t.layers[l].tilesetId === set.id && !seenMaps.has(c.tilemap)) {
        seenMaps.add(c.tilemap);
        c.tilemap.tiles.forEach((v) => {
          const id = v & TILE_INDEX_MASK;
          usage.set(id, (usage.get(id) ?? 0) + 1);
        });
      }
    });
  const stride = w * h * 4,
    source = setPixels(set, t.colorDepth, t.frames[fi].palette, t.transparentIndex),
    blocks = Array.from(
      { length: set.tileCount },
      (_, i) => new Uint8Array(source.slice(i * stride, (i + 1) * stride)),
    ),
    tiles = new Uint32Array(width * height),
    modified = new Set<number>();
  for (let gy = 0; gy < height; gy++)
    for (let gx = 0; gx < width; gx++) {
      const ox = gx + left,
        oy = gy + top,
        previous =
          old?.tilemap && ox >= 0 && oy >= 0 && ox < old.tilemap.width && oy < old.tilemap.height
            ? old.tilemap.tiles[oy * old.tilemap.width + ox]
            : 0,
        id = previous & TILE_INDEX_MASK;
      const block = sampleBlock(pixels, bx + ox * w - x, by + oy * h - y, w, h);
      for (let at = 0; at < block.length; at += 4)
        if (block[at + 3] === 0) block.fill(0, at, at + 4);
      if (mode === TilesetMode.Manual) {
        tiles[gy * width + gx] = previous;
        if (!id) continue;
        const target = blocks[id].slice();
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            const p = sourcePoint(xx, yy, w, h, previous);
            if (p) {
              const at = (yy * w + xx) * 4,
                original = (id * w * h + p[1] * w + p[0]) * 4;
              if (
                !same(
                  block.subarray(at, at + 4),
                  new Uint8Array(source.subarray(original, original + 4)),
                )
              )
                target.set(block.subarray(at, at + 4), (p[1] * w + p[0]) * 4);
            }
          }
        blocks[id] = target;
        continue;
      }
      // Preserve existing flipped references when the visual tile did not change.
      if (
        id &&
        same(
          block,
          new Uint8Array(
            rasterizeTilemap(
              { width: 1, height: 1, tiles: Uint32Array.of(previous) },
              { ...set, pixels: new Uint8Array(source), asepritePixels: undefined },
            ).data,
          ),
        )
      ) {
        tiles[gy * width + gx] = previous;
        continue;
      }
      modified.add(id);
      let matchFlags = 0;
      let match = block.every((v, i) => i % 4 !== 3 || v === 0)
        ? 0
        : blocks.findIndex((b, i) => i > 0 && same(b, block));
      if (match < 0) {
        const flipped = findFlippedTile(block, blocks, w, h, set.flags);
        if (flipped) {
          match = flipped.id;
          matchFlags = flipped.flags;
        }
      }
      if (match < 0) {
        if (mode === TilesetMode.Auto && id > 0 && usage.get(id) === 1) {
          match = id;
          blocks[id] = block;
        } else {
          match = blocks.length;
          blocks.push(block);
        }
      }
      tiles[gy * width + gx] = (match | matchFlags) >>> 0;
      if (mode === TilesetMode.Auto && match !== id) {
        usage.set(id, (usage.get(id) ?? 0) - 1);
        usage.set(match, (usage.get(match) ?? 0) + 1);
      }
    }
  if (blocks.length * stride > MAX_IMAGE_PIXELS * 4)
    throw new RangeError("Tileset exceeds memory limit");
  let bytes = new Uint8Array(blocks.length * stride);
  blocks.forEach((b, i) => bytes.set(b, i * stride));
  let nextSet = {
    ...set,
    tileCount: blocks.length,
    pixels: bytes,
    asepritePixels: undefined as Uint8Array | undefined,
  };
  if (t.colorDepth === 8 || t.colorDepth === 16)
    nextSet = {
      ...nextSet,
      asepritePixels: encodeAsepriteSamples(
        { width: w, height: h * blocks.length, data: new Uint8ClampedArray(bytes) },
        t.colorDepth,
        paletteForColors(t.frames[fi].palette),
        t.transparentIndex ?? 0,
        set.asepritePixels
          ? {
              depth: t.colorDepth,
              width: w,
              height: h * blocks.length,
              data: (() => {
                const data = new Uint8Array(
                  w * h * blocks.length * (t.colorDepth! / BITS_PER_BYTE),
                );
                data.set(set.asepritePixels!);
                return data;
              })(),
            }
          : undefined,
      ).data,
    };
  let next = replaceCel(
    { ...t, tilesets: t.tilesets!.map((s) => (s.id === set.id ? nextSet : s)) },
    fi,
    li,
    {
      ...old,
      x: bx + left * w,
      y: by + top * h,
      opacity: old?.opacity ?? UINT8_MAX,
      zIndex: old?.zIndex ?? 0,
      pixels,
      tilemap: { width, height, tiles },
    },
  );
  if (mode === TilesetMode.Auto) {
    const used = new Set<number>();
    for (const f of next.frames)
      f.cels.forEach((c, l) => {
        if (next.layers[l].tilesetId === set.id)
          c?.tilemap?.tiles.forEach((v) => used.add(v & TILE_INDEX_MASK));
      });
    const order = blocks.map((_, i) => i).filter((i) => i === 0 || !modified.has(i) || used.has(i));
    if (order.length < blocks.length) next = reorderTileset(next, set.id, order);
  }
  return mode === TilesetMode.Manual
    ? refreshTilemapProjections(next)
    : trimTilemapCel(next, fi, li);
}
export function convertLayerToTilemap(
  t: SpriteTimeline,
  li: number,
  options: TilemapLayerOptions,
): SpriteTimeline {
  const layer = t.layers[li];
  if (!layer || layer.kind === "group" || layer.kind === "tilemap" || layer.flags & (8 | 64))
    throw new Error("Only transparent image layers can become Tilemaps");
  const created = createTilemapLayer(t, options),
    id = created.layers[created.layers.length - 1].tilesetId;
  let next: SpriteTimeline = {
    ...t,
    tilesets: created.tilesets,
    layers: t.layers.map((l, i) => (i === li ? { ...l, kind: "tilemap", tilesetId: id } : l)),
  };
  const seen = new Map<PixelBuffer, TimelineCel>();
  for (let fi = 0; fi < t.frames.length; fi++) {
    const c = t.frames[fi].cels[li];
    if (!c) continue;
    const linked = seen.get(c.pixels);
    if (linked) {
      next = replaceCel(next, fi, li, { ...c, tilemap: linked.tilemap, pixels: linked.pixels });
      continue;
    }
    next = commitTilemapPixels(next, fi, li, c.pixels, c.x, c.y, TilesetMode.Stack);
    seen.set(c.pixels, next.frames[fi].cels[li]!);
  }
  return refreshTilemapProjections(next);
}
export function rasterizeTilemapLayer(t: SpriteTimeline, li: number): SpriteTimeline {
  t = refreshTilemapProjections(t);
  return {
    ...t,
    layers: t.layers.map((l, i) => (i === li ? { ...l, kind: "image", tilesetId: undefined } : l)),
    frames: t.frames.map((f) => ({
      ...f,
      cels: f.cels.map((c, l) =>
        l === li && c ? { ...c, tilemap: undefined, source: undefined } : c,
      ),
    })),
  };
}
/** Order lists retained original indices. Missing tiles are deleted and all references become empty. */
export function reorderTileset(
  t: SpriteTimeline,
  id: number,
  order: readonly number[],
  remapReferences = true,
): SpriteTimeline {
  const set = t.tilesets?.find((s) => s.id === id);
  if (
    !set ||
    order[0] !== 0 ||
    new Set(order).size !== order.length ||
    order.some((i) => !Number.isInteger(i) || i < 0 || i >= set.tileCount)
  )
    throw new RangeError("Invalid Tileset order");
  const stride = set.tileWidth * set.tileHeight * 4,
    pixels = new Uint8Array(order.length * stride),
    remap = new Map(order.map((v, i) => [v, i]));
  order.forEach((v, i) =>
    pixels.set(set.pixels.subarray(v * stride, (v + 1) * stride), i * stride),
  );
  let asepritePixels: Uint8Array | undefined;
  if (set.asepritePixels) {
    const ns = set.asepritePixels.length / set.tileCount;
    asepritePixels = new Uint8Array(ns * order.length);
    order.forEach((v, i) =>
      asepritePixels!.set(set.asepritePixels!.subarray(v * ns, (v + 1) * ns), i * ns),
    );
  }
  const cache = new Map<TilemapImage, TilemapImage>();
  return refreshTilemapProjections({
    ...t,
    tilesets: t.tilesets!.map((s) =>
      s.id === id
        ? {
            ...s,
            tileCount: order.length,
            pixels,
            asepritePixels,
            tileUserData: s.tileUserData ? order.map((i) => s.tileUserData![i]) : undefined,
          }
        : s,
    ),
    frames: t.frames.map((f) => ({
      ...f,
      cels: f.cels.map((c, l) => {
        if (!remapReferences || !c?.tilemap || t.layers[l].tilesetId !== id) return c;
        let map = cache.get(c.tilemap);
        if (!map) {
          map = {
            ...c.tilemap,
            tiles: c.tilemap.tiles.map((v) => {
              const n = remap.get(v & TILE_INDEX_MASK) ?? 0;
              return n ? (n | (v & ~TILE_INDEX_MASK)) >>> 0 : 0;
            }),
          };
          cache.set(c.tilemap, map);
        }
        return { ...c, tilemap: map };
      }),
    })),
  });
}
/** Color Bar drag changes tileset slots; tilemap references keep their indices. */
export function moveTilesetTiles(
  t: SpriteTimeline,
  id: number,
  indices: readonly number[],
  beforeIndex: number,
  copy = false,
): SpriteTimeline {
  const set = t.tilesets?.find((s) => s.id === id);
  if (!set || !Number.isInteger(beforeIndex) || beforeIndex < 0 || beforeIndex > set.tileCount)
    throw new RangeError("Invalid Tileset drop");
  const picked = [...new Set(indices)].sort((a, b) => a - b);
  if (!picked.length || picked.some((i) => !Number.isInteger(i) || i < 0 || i >= set.tileCount))
    return t;
  const before = Math.max(1, beforeIndex);
  if (!copy) {
    const moved = picked.filter((i) => i !== 0);
    if (!moved.length) return t;
    const chosen = new Set(moved),
      order = Array.from({ length: set.tileCount }, (_, i) => i).filter((i) => !chosen.has(i));
    const at = before - moved.filter((i) => i < before).length;
    order.splice(at, 0, ...moved);
    return order.every((value, index) => value === index) ? t : reorderTileset(t, id, order, false);
  }
  if (set.tileWidth * set.tileHeight * (set.tileCount + picked.length) > MAX_IMAGE_PIXELS)
    throw new RangeError("Tileset exceeds memory limit");
  const stride = set.tileWidth * set.tileHeight * 4,
    pixels = new Uint8Array(set.pixels.length + picked.length * stride);
  pixels.set(set.pixels);
  picked.forEach((source, index) =>
    pixels.set(
      set.pixels.subarray(source * stride, (source + 1) * stride),
      (set.tileCount + index) * stride,
    ),
  );
  let asepritePixels: Uint8Array | undefined;
  if (set.asepritePixels) {
    const ns = set.asepritePixels.length / set.tileCount;
    asepritePixels = new Uint8Array(set.asepritePixels.length + picked.length * ns);
    asepritePixels.set(set.asepritePixels);
    picked.forEach((source, index) =>
      asepritePixels!.set(
        set.asepritePixels!.subarray(source * ns, (source + 1) * ns),
        (set.tileCount + index) * ns,
      ),
    );
  }
  const expanded = {
    ...t,
    tilesets: t.tilesets!.map((s) =>
      s.id === id
        ? {
            ...s,
            pixels,
            asepritePixels,
            tileCount: set.tileCount + picked.length,
            tileUserData: s.tileUserData
              ? [...s.tileUserData, ...picked.map((i) => s.tileUserData![i])]
              : undefined,
          }
        : s,
    ),
  };
  const order = Array.from({ length: set.tileCount }, (_, i) => i);
  order.splice(before, 0, ...picked.map((_, i) => set.tileCount + i));
  return reorderTileset(expanded, id, order, false);
}
/** Color Bar's Remap Tiles finds each old tile image in the current set. */
export function remapTilesetReferencesByContent(
  t: SpriteTimeline,
  id: number,
  oldSet: AsepriteTileset,
): SpriteTimeline {
  const set = t.tilesets?.find((s) => s.id === id);
  if (!set || set.tileWidth !== oldSet.tileWidth || set.tileHeight !== oldSet.tileHeight)
    throw new RangeError("Tileset size changed");
  const hasAsepriteSamples = !!set.asepritePixels && !!oldSet.asepritePixels;
  const current = hasAsepriteSamples ? set.asepritePixels! : set.pixels,
    old = hasAsepriteSamples ? oldSet.asepritePixels! : oldSet.pixels;
  const stride = current.length / set.tileCount,
    oldStride = old.length / oldSet.tileCount;
  if (!Number.isInteger(stride) || stride !== oldStride)
    throw new RangeError("Tileset samples changed");
  const hash = (bytes: Uint8Array, start: number) => {
    let value = 2166136261;
    for (let i = 0; i < stride; i++) value = Math.imul(value ^ bytes[start + i], 16777619);
    return value >>> 0;
  };
  const matches = new Map<number, number[]>();
  for (let index = 0; index < set.tileCount; index++) {
    const key = hash(current, index * stride),
      bucket = matches.get(key) ?? [];
    bucket.push(index);
    matches.set(key, bucket);
  }
  const remap = Array.from({ length: oldSet.tileCount }, (_, index) => {
    if (index === 0) return 0;
    const start = index * stride,
      bucket = matches.get(hash(old, start)) ?? [];
    for (const candidate of bucket) {
      const target = candidate * stride;
      let equal = true;
      for (let i = 0; i < stride; i++)
        if (old[start + i] !== current[target + i]) {
          equal = false;
          break;
        }
      if (equal) return candidate;
    }
    return 0;
  });
  const cache = new Map<TilemapImage, TilemapImage>();
  return refreshTilemapProjections({
    ...t,
    frames: t.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel, li) => {
        if (!cel?.tilemap || t.layers[li].tilesetId !== id) return cel;
        let map = cache.get(cel.tilemap);
        if (!map) {
          map = {
            ...cel.tilemap,
            tiles: cel.tilemap.tiles.map((tile) => {
              const index = tile & TILE_INDEX_MASK,
                next = remap[index] ?? 0;
              return next ? (next | (tile & ~TILE_INDEX_MASK)) >>> 0 : 0;
            }),
          };
          cache.set(cel.tilemap, map);
        }
        return { ...cel, tilemap: map };
      }),
    })),
  });
}
export function deleteTilesetTile(t: SpriteTimeline, id: number, index: number): SpriteTimeline {
  const set = t.tilesets?.find((s) => s.id === id);
  if (!set || index <= 0 || index >= set.tileCount) throw new RangeError("Cannot delete this tile");
  return reorderTileset(
    t,
    id,
    Array.from({ length: set.tileCount }, (_, i) => i).filter((i) => i !== index),
  );
}
/** Coordinates are relative to the original cel grid, even when a negative cell grows it. */
export function setTilesAt(
  t: SpriteTimeline,
  fi: number,
  li: number,
  points: readonly { x: number; y: number; tile: number }[],
  origin?: { x: number; y: number },
): SpriteTimeline {
  if (!points.length) return t;
  const set = tilesetForLayer(t, li),
    old = t.frames[fi].cels[li],
    map = old?.tilemap;
  let left = 0,
    top = 0,
    right = map?.width ?? 0,
    bottom = map?.height ?? 0;
  for (const p of points) {
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      (p.tile & TILE_INDEX_MASK) >= set.tileCount
    )
      throw new RangeError("Invalid tile placement");
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x + 1);
    bottom = Math.max(bottom, p.y + 1);
  }
  const width = right - left,
    height = bottom - top;
  size(width * set.tileWidth, height * set.tileHeight);
  const tiles = new Uint32Array(width * height);
  if (map)
    for (let y = 0; y < map.height; y++)
      tiles.set(map.tiles.subarray(y * map.width, (y + 1) * map.width), (y - top) * width - left);
  for (const p of points) tiles[(p.y - top) * width + p.x - left] = p.tile >>> 0;
  return refreshTilemapProjections(
    replaceCel(t, fi, li, {
      ...old,
      x: (origin?.x ?? old?.x ?? t.gridBounds?.x ?? 0) + left * set.tileWidth,
      y: (origin?.y ?? old?.y ?? t.gridBounds?.y ?? 0) + top * set.tileHeight,
      opacity: old?.opacity ?? UINT8_MAX,
      zIndex: old?.zIndex ?? 0,
      tilemap: { width, height, tiles },
      pixels: old?.pixels ?? { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    }),
  );
}
export function duplicateTilesetTile(t: SpriteTimeline, id: number, index: number): SpriteTimeline {
  const set = t.tilesets?.find((s) => s.id === id);
  if (!set || !Number.isInteger(index) || index < 0 || index >= set.tileCount)
    throw new RangeError("Invalid tile");
  if (set.tileWidth * set.tileHeight * (set.tileCount + 1) > MAX_IMAGE_PIXELS)
    throw new RangeError("Tileset exceeds memory limit");
  const stride = set.tileWidth * set.tileHeight * 4,
    pixels = new Uint8Array(set.pixels.length + stride);
  pixels.set(set.pixels);
  pixels.set(set.pixels.subarray(index * stride, (index + 1) * stride), set.pixels.length);
  let asepritePixels: Uint8Array | undefined;
  if (set.asepritePixels) {
    const ns = set.asepritePixels.length / set.tileCount;
    asepritePixels = new Uint8Array(set.asepritePixels.length + ns);
    asepritePixels.set(set.asepritePixels);
    asepritePixels.set(
      set.asepritePixels.subarray(index * ns, (index + 1) * ns),
      set.asepritePixels.length,
    );
  }
  return {
    ...t,
    tilesets: t.tilesets!.map((s) =>
      s.id === id
        ? {
            ...s,
            pixels,
            asepritePixels,
            tileCount: s.tileCount + 1,
            tileUserData: s.tileUserData ? [...s.tileUserData, s.tileUserData[index]] : undefined,
          }
        : s,
    ),
  };
}

function findFlippedTile(
  block: Uint8Array,
  blocks: readonly Uint8Array[],
  w: number,
  h: number,
  matchFlags: number,
): { id: number; flags: number } | undefined {
  const allowed =
    (matchFlags & 8 ? TILE_X_FLIP : 0) |
    (matchFlags & 16 ? TILE_Y_FLIP : 0) |
    (matchFlags & 32 ? TILE_DIAGONAL_FLIP : 0);
  if (!allowed) return undefined;
  const variants = [
    TILE_X_FLIP,
    TILE_Y_FLIP,
    TILE_X_FLIP | TILE_Y_FLIP,
    TILE_DIAGONAL_FLIP,
    TILE_X_FLIP | TILE_DIAGONAL_FLIP,
    TILE_X_FLIP | TILE_Y_FLIP | TILE_DIAGONAL_FLIP,
    TILE_Y_FLIP | TILE_DIAGONAL_FLIP,
  ];
  for (const flags of variants) {
    if ((flags & allowed) >>> 0 !== flags >>> 0) continue;
    for (let id = 1; id < blocks.length; id++) {
      let matches = true;
      for (let y = 0; y < h && matches; y++)
        for (let x = 0; x < w && matches; x++) {
          const point = sourcePoint(x, y, w, h, flags),
            at = (y * w + x) * 4,
            src = point ? (point[1] * w + point[0]) * 4 : -1;
          for (let ch = 0; ch < 4; ch++) {
            if (block[at + ch] !== (src < 0 ? 0 : blocks[id][src + ch])) {
              matches = false;
              break;
            }
          }
        }
      if (matches) return { id, flags };
    }
  }
  return undefined;
}
/** Validate graph and aggregate retained storage without allocating raster projections. */
export function assertTilemapTimeline(t: SpriteTimeline): void {
  const sets = new Map<number, AsepriteTileset>(),
    arrays = new Set<ArrayBufferView>(),
    maps = new Map<TilemapImage, Set<AsepriteTileset>>();
  let bytes = 0;
  const retain = (data: ArrayBufferView) => {
    if (arrays.has(data)) return;
    arrays.add(data);
    bytes += data.byteLength;
    if (bytes > MAX_IMAGE_PIXELS * 4)
      throw new RangeError("Tilemap document memory exceeds the editor limit");
  };
  for (const set of t.tilesets ?? []) {
    if (!Number.isSafeInteger(set.id) || set.id < 0 || set.id > 0xffffffff || sets.has(set.id))
      throw new RangeError("Invalid or duplicate Tileset ID");
    sets.set(set.id, set);
    size(set.tileWidth, set.tileHeight);
    if (
      !Number.isSafeInteger(set.tileCount) ||
      set.tileCount < 1 ||
      set.tileCount > TILE_INDEX_MASK ||
      set.tileWidth * set.tileHeight * set.tileCount > MAX_IMAGE_PIXELS
    )
      throw new RangeError("Invalid Tileset size");
    if (
      !(set.pixels instanceof Uint8Array) ||
      set.pixels.length !== set.tileWidth * set.tileHeight * set.tileCount * 4
    )
      throw new RangeError("Invalid Tileset RGBA pixels");
    retain(set.pixels);
    if (set.asepritePixels) {
      if (
        !(set.asepritePixels instanceof Uint8Array) ||
        (t.colorDepth !== 8 && t.colorDepth !== 16) ||
        set.asepritePixels.length !==
          set.tileWidth * set.tileHeight * set.tileCount * (t.colorDepth / BITS_PER_BYTE)
      )
        throw new RangeError("Invalid Aseprite tileset samples");
      retain(set.asepritePixels);
    }
  }
  for (let li = 0; li < t.layers.length; li++) {
    const layer = t.layers[li],
      set = layer.kind === "tilemap" ? sets.get(layer.tilesetId!) : undefined;
    if (layer.kind === "tilemap" && !set)
      throw new Error("Tilemap layer references a missing Tileset");
    for (const frame of t.frames) {
      const cel = frame.cels[li];
      if (!cel) continue;
      retain(cel.pixels.data);
      const map = cel.tilemap;
      if ((layer.kind === "tilemap" && !map) || (map && !set))
        throw new Error("Cel type does not match Tilemap layer");
      if (!map || !set) continue;
      size(map.width, map.height);
      size(map.width * set.tileWidth, map.height * set.tileHeight);
      if (!(map.tiles instanceof Uint32Array) || map.tiles.length !== map.width * map.height)
        throw new RangeError("Invalid tilemap cell grid");
      retain(map.tiles);
      let checked = maps.get(map);
      if (!checked) {
        checked = new Set();
        maps.set(map, checked);
      }
      if (checked.has(set)) continue;
      checked.add(set);
      for (const value of map.tiles)
        if ((value & TILE_INDEX_MASK) >= set.tileCount)
          throw new RangeError("Tile index outside Tileset");
    }
  }
}

/** Crop the reference grid, never the tile image, and move linked cel origins together. */
export function trimTilemapCel(t: SpriteTimeline, fi: number, li: number): SpriteTimeline {
  const cel = t.frames[fi]?.cels[li],
    map = cel?.tilemap;
  if (!cel || !map) return t;
  const set = tilesetForLayer(t, li);
  let left = map.width,
    top = map.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.tiles[y * map.width + x] & TILE_INDEX_MASK) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) {
    left = top = right = bottom = 0;
  }
  const width = right - left + 1,
    height = bottom - top + 1;
  if (left === 0 && top === 0 && width === map.width && height === map.height)
    return refreshTilemapProjections(t);
  const tiles = new Uint32Array(width * height);
  for (let y = 0; y < height; y++)
    tiles.set(
      map.tiles.subarray((y + top) * map.width + left, (y + top) * map.width + left + width),
      y * width,
    );
  return refreshTilemapProjections(
    replaceCel(t, fi, li, {
      ...cel,
      x: cel.x + left * set.tileWidth,
      y: cel.y + top * set.tileHeight,
      tilemap: { width, height, tiles },
    }),
  );
}

/** Render Aseprite tile samples without a palette round trip (duplicate indices matter). */
export function rasterizeTilemapSamples(
  map: TilemapImage,
  set: AsepriteTileset,
  depth: 8 | 16,
  transparentIndex = 0,
): AsepriteImageSamples {
  const width = map.width * set.tileWidth,
    height = map.height * set.tileHeight,
    bpp = depth / BITS_PER_BYTE,
    data = new Uint8Array(width * height * bpp);
  if (depth === 8) data.fill(transparentIndex);
  const source = set.asepritePixels;
  if (!source) throw new Error("Tileset has no Aseprite samples");
  for (let cell = 0; cell < map.tiles.length; cell++) {
    const tile = map.tiles[cell],
      id = tile & TILE_INDEX_MASK;
    if (!id) continue;
    for (let y = 0; y < set.tileHeight; y++)
      for (let x = 0; x < set.tileWidth; x++) {
        const p = sourcePoint(x, y, set.tileWidth, set.tileHeight, tile);
        if (!p) continue;
        const at = ((id * set.tileHeight + p[1]) * set.tileWidth + p[0]) * bpp,
          to =
            ((Math.floor(cell / map.width) * set.tileHeight + y) * width +
              (cell % map.width) * set.tileWidth +
              x) *
            bpp;
        data.set(source.subarray(at, at + bpp), to);
      }
  }
  return { depth, width, height, data };
}
function commitTilemapSamples(
  t: SpriteTimeline,
  fi: number,
  li: number,
  pixels: PixelBuffer,
  x: number,
  y: number,
  mode: TilemapEditMode,
  asepriteSamples: AsepriteImageSamples,
): SpriteTimeline {
  const depth = t.colorDepth as 8 | 16,
    set = tilesetForLayer(t, li),
    mask = t.transparentIndex ?? 0,
    bpp = depth / BITS_PER_BYTE;
  if (
    asepriteSamples.depth !== depth ||
    asepriteSamples.width !== pixels.width ||
    asepriteSamples.height !== pixels.height
  )
    throw new Error("Aseprite tile patch dimensions/depth mismatch");
  // Use an injective surrogate color per Aseprite sample so matching, flips, Auto
  // reuse and Manual writes share one algorithm without collapsing equal colors.
  const surrogate = (samples: Uint8Array) => {
    const out = new Uint8Array((samples.length / bpp) * 4);
    for (let i = 0; i < samples.length / bpp; i++) {
      const v = samples[i * bpp],
        a = depth === 8 ? (v === mask ? 0 : UINT8_MAX) : samples[i * bpp + 1];
      out.set([v, depth === 16 ? a : 0, 0, a], i * 4);
    }
    return out;
  };
  const samples =
    set.asepritePixels ??
    encodeAsepriteSamples(
      {
        width: set.tileWidth,
        height: set.tileHeight * set.tileCount,
        data: new Uint8ClampedArray(set.pixels),
      },
      depth,
      paletteForColors(t.frames[fi].palette),
      mask,
    ).data;
  const fake = { ...set, pixels: surrogate(samples), asepritePixels: undefined };
  const proxy = refreshTilemapProjections({
    ...t,
    colorDepth: 32,
    tilesets: t.tilesets!.map((s) => (s.id === set.id ? fake : s)),
  });
  const result = commitTilemapPixels(
      proxy,
      fi,
      li,
      { ...pixels, data: new Uint8ClampedArray(surrogate(asepriteSamples.data)) },
      x,
      y,
      mode,
    ),
    updated = tilesetForLayer(result, li),
    data = new Uint8Array(updated.tileCount * set.tileWidth * set.tileHeight * bpp);
  for (let i = 0; i < data.length / bpp; i++) {
    data[i * bpp] = depth === 8 && !updated.pixels[i * 4 + 3] ? mask : updated.pixels[i * 4];
    if (depth === 16) data[i * bpp + 1] = updated.pixels[i * 4 + 1];
  }
  const restored = {
    ...updated,
    asepritePixels: data,
    pixels: new Uint8Array(
      expandAsepriteSamples(
        { depth, width: set.tileWidth, height: set.tileHeight * updated.tileCount, data },
        paletteForColors(t.frames[fi].palette),
        mask,
      ),
    ),
  };
  return refreshTilemapProjections({
    ...result,
    colorDepth: depth,
    tilesets: result.tilesets!.map((s) => (s.id === set.id ? restored : s)),
  });
}
