import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { Point } from "$/base/primitives";
import type { ClipboardImage, TilemapClipboard } from "$/clipboard/types";
import { activateTimelineCel } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import type { AsepriteTileset } from "$/import-export/aseprite/model";
import { rasterizeTilemap, refreshTilemapProjections, TILE_INDEX_MASK } from "$/tilemap/model";
import { cloneTileset } from "$/tilemap/tileset-clone";
import { layerEditable, type SpriteTimeline } from "$/timeline/timeline";

export function cloneClipboardTileset(set: AsepriteTileset): AsepriteTileset {
  return cloneTileset(set);
}
export function cloneTilemapClipboard(value: TilemapClipboard): TilemapClipboard {
  return {
    map: { ...value.map, tiles: value.map.tiles.slice() },
    selected: value.selected.slice(),
    tileset: cloneClipboardTileset(value.tileset),
  };
}
/** Match tile contents, never document-local Tileset ids. Preserve flip bits. */
export function mergeClipboardTileset(
  target: AsepriteTileset,
  source: AsepriteTileset,
  usedTiles?: Iterable<number>,
): { tileset: AsepriteTileset; remap: (tile: number) => number } {
  if (target.tileWidth !== source.tileWidth || target.tileHeight !== source.tileHeight)
    throw new Error("Tilemap paste requires matching tile dimensions");
  const stride = target.tileWidth * target.tileHeight * 4,
    blocks = Array.from({ length: target.tileCount }, (_, i) =>
      target.pixels.slice(i * stride, (i + 1) * stride),
    );
  const rawStride = target.asepritePixels ? target.asepritePixels.length / target.tileCount : 0;
  if (
    !!target.asepritePixels !== !!source.asepritePixels ||
    (rawStride && source.asepritePixels!.length / source.tileCount !== rawStride)
  )
    throw new Error("Tilemap paste requires compatible color modes");
  const raw = rawStride
    ? Array.from({ length: target.tileCount }, (_, i) =>
        target.asepritePixels!.slice(i * rawStride, (i + 1) * rawStride),
      )
    : undefined;
  const ids: number[] = [0],
    metadata =
      target.tileUserData || source.tileUserData
        ? Array.from({ length: target.tileCount }, (_, i) => target.tileUserData?.[i] ?? {})
        : undefined;
  const indices = usedTiles
    ? [...new Set([...usedTiles].map((v) => v & TILE_INDEX_MASK))]
    : Array.from({ length: source.tileCount }, (_, i) => i);
  for (const i of indices) {
    if (i === 0) continue;
    if (i >= source.tileCount) throw new Error("Invalid clipboard tile index");
    const block = source.pixels.subarray(i * stride, (i + 1) * stride),
      sourceSamples = raw
        ? source.asepritePixels!.subarray(i * rawStride, (i + 1) * rawStride)
        : undefined;
    let id = blocks.findIndex(
      (b, j) =>
        j > 0 &&
        (sourceSamples
          ? raw![j].every((v, k) => v === sourceSamples[k])
          : b.every((v, k) => v === block[k])),
    );
    if (id < 0) {
      id = blocks.length;
      if ((id + 1) * stride > MAX_IMAGE_PIXELS * 4)
        throw new RangeError("Tileset exceeds memory limit");
      blocks.push(block.slice());
      if (raw) raw.push(sourceSamples!.slice());
      if (metadata) metadata.push(source.tileUserData?.[i] ?? {});
    }
    ids[i] = id;
  }
  const pixels = new Uint8Array(blocks.length * stride);
  blocks.forEach((b, i) => pixels.set(b, i * stride));
  let asepritePixels: Uint8Array | undefined;
  if (raw) {
    asepritePixels = new Uint8Array(raw.length * rawStride);
    raw.forEach((b, i) => asepritePixels!.set(b, i * rawStride));
  }
  return {
    tileset: {
      ...target,
      tileCount: blocks.length,
      pixels,
      asepritePixels,
      ...(metadata ? { tileUserData: metadata } : {}),
    },
    remap: (tile) => {
      const id = ids[tile & TILE_INDEX_MASK];
      if (id === undefined) throw new Error("Invalid clipboard tile index");
      return id ? (id | (tile & ~TILE_INDEX_MASK)) >>> 0 : 0;
    },
  };
}
export function pasteTilemapClipboard(
  doc: EditorDocument,
  image: ClipboardImage,
  position: Point,
): boolean {
  const payload = image.tilemap,
    t = doc.timeline;
  if (
    !payload ||
    !t ||
    t.layers[t.activeLayer].kind !== "tilemap" ||
    !layerEditable(t, t.activeLayer)
  )
    return false;
  const set = t.tilesets?.find((s) => s.id === t.layers[t.activeLayer].tilesetId);
  if (!set) return false;
  const merged = mergeClipboardTileset(set, payload.tileset),
    old = t.frames[t.activeFrame].cels[t.activeLayer],
    map = old?.tilemap,
    w = set.tileWidth,
    h = set.tileHeight,
    bx = old?.x ?? t.gridBounds?.x ?? 0,
    by = old?.y ?? t.gridBounds?.y ?? 0,
    gx = Math.floor((position.x - bx) / w),
    gy = Math.floor((position.y - by) / h),
    left = Math.min(0, gx),
    top = Math.min(0, gy),
    width = Math.max(map?.width ?? 0, gx + payload.map.width) - left,
    height = Math.max(map?.height ?? 0, gy + payload.map.height) - top;
  if (width * w > 16384 || height * h > 16384 || width * w * height * h > 64 * 1024 * 1024)
    throw new RangeError("Tilemap paste is too large");
  const tiles = new Uint32Array(width * height);
  if (map)
    for (let y = 0; y < map.height; y++)
      tiles.set(map.tiles.subarray(y * map.width, (y + 1) * map.width), (y - top) * width - left);
  payload.map.tiles.forEach((tile, i) => {
    if (payload.selected[i])
      tiles[
        (gy + Math.floor(i / payload.map.width) - top) * width + gx + (i % payload.map.width) - left
      ] = merged.remap(tile);
  });
  const nextMap = { width, height, tiles },
    cel = {
      ...old,
      x: bx + left * w,
      y: by + top * h,
      opacity: old?.opacity ?? UINT8_MAX,
      zIndex: old?.zIndex ?? 0,
      tilemap: nextMap,
      pixels: rasterizeTilemap(nextMap, merged.tileset),
    };
  const next: SpriteTimeline = {
    ...t,
    tilesets: t.tilesets!.map((s) => (s.id === set.id ? merged.tileset : s)),
    frames: t.frames.map((f, fi) => ({
      ...f,
      cels: f.cels.map((c, li) =>
        fi === t.activeFrame && li === t.activeLayer
          ? cel
          : old?.tilemap && c?.tilemap === old.tilemap
            ? { ...c, tilemap: nextMap, x: c.x + left * w, y: c.y + top * h }
            : c,
      ),
    })),
  };
  doc.timeline = refreshTilemapProjections(next);
  activateTimelineCel(doc, t.activeFrame, t.activeLayer);
  return true;
}
