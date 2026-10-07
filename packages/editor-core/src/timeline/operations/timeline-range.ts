import { MAX_DOCUMENT_PIXEL_BYTES, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { mergeClipboardTileset } from "$/clipboard/tile";
import {
  encodeAsepriteSamples,
  expandAsepriteSamples,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import { cloneStoredPixelBuffer } from "$/document/pixel-storage";
import type { AsepriteTileset } from "$/import-export/aseprite/model";
import {
  rasterizeTilemap,
  refreshTilemapProjections,
  tilesetForLayer,
  rasterizeTilemapSamples,
  assertTilemapTimeline,
} from "$/tilemap/model";
import { layerSubtree, moveLayerTree } from "$/timeline/layer-operations";
import { layerEditable } from "$/timeline/timeline";
import type { SpriteTimeline, TimelineCel, TimelineRange } from "$/timeline/types";
export type { TimelineRange } from "$/timeline/types";
import { isBackgroundLayer, MAX_TIMELINE_FRAMES, MAX_TIMELINE_LAYERS } from "$/timeline/timeline";

export {
  timelineTags,
  timelineTagIndexAtFrame,
  withTimelineTags,
  validTimelineRange,
} from "$/timeline/tags";
import { BITS_PER_BYTE } from "$/base/numeric-constants";
import { timelineTags, withTimelineTags, validTimelineRange } from "$/timeline/tags";

/** Immutable, overlap-safe range operation. Pixels copied once per shared image,
 * retaining links inside a copied range without linking it to the source. */
export function transferTimelineRange(
  t: SpriteTimeline,
  range: TimelineRange,
  frameDelta: number,
  layerDelta: number,
  copy: boolean,
): SpriteTimeline {
  if (
    !validTimelineRange(t, range) ||
    !Number.isInteger(frameDelta) ||
    !Number.isInteger(layerDelta)
  )
    return t;
  const fs = [...new Set(range.frames)].sort((a, b) => a - b),
    ls = [
      ...new Set(
        range.kind === "layers" ? range.layers.flatMap((i) => layerSubtree(t, i)) : range.layers,
      ),
    ].sort((a, b) => a - b);
  if (range.kind === "layers" && !copy && range.layers.length === 1)
    return moveLayerTree(
      t,
      range.layers[0],
      Math.max(0, Math.min(t.layers.length - 1, range.layers[0] + layerDelta)),
    );
  if (copy) {
    const retained = new Set(t.frames.flatMap((f) => f.cels.flatMap((c) => (c ? [c.pixels] : []))));
    const copied = new Set(
      (range.kind === "layers" ? t.frames.map((_, i) => i) : fs).flatMap((f) =>
        (range.kind === "frames" ? t.layers.map((_, i) => i) : ls).flatMap((l) =>
          t.frames[f].cels[l] ? [t.frames[f].cels[l]!.pixels] : [],
        ),
      ),
    );
    if (
      [...retained, ...copied].reduce((sum, p) => sum + p.width * p.height * 4, 0) >
      MAX_DOCUMENT_PIXEL_BYTES
    )
      return t;
  }
  const tilemaps = new Map<
    NonNullable<TimelineCel["tilemap"]>,
    NonNullable<TimelineCel["tilemap"]>
  >();
  const images = new Map<TimelineCel["pixels"], TimelineCel["pixels"]>(),
    sampleImageCopies = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  const clone = (cel: TimelineCel | null): TimelineCel | null => {
    if (!cel || !copy) return cel;
    let pixels = images.get(cel.pixels);
    if (!pixels) {
      pixels = cloneStoredPixelBuffer(cel.pixels);
      images.set(cel.pixels, pixels);
    }
    let asepriteSamples = cel.asepriteSamples;
    if (asepriteSamples) {
      let clone = sampleImageCopies.get(asepriteSamples);
      if (!clone) {
        clone = { ...asepriteSamples, data: asepriteSamples.data.slice() };
        sampleImageCopies.set(asepriteSamples, clone);
      }
      asepriteSamples = clone;
    }
    let tilemap = cel.tilemap;
    if (tilemap) {
      let cloned = tilemaps.get(tilemap);
      if (!cloned) {
        cloned = { ...tilemap, tiles: tilemap.tiles.slice() };
        tilemaps.set(tilemap, cloned);
      }
      tilemap = cloned;
    }
    return {
      ...cel,
      tilemap,
      asepriteSamples,
      pixels,
      source: cel.source ? { ...cel.source, linkedFrame: undefined } : undefined,
    };
  };
  if (range.kind === "cels") {
    if (
      (!frameDelta && !layerDelta) ||
      fs.some((f) => f + frameDelta < 0 || f + frameDelta >= MAX_TIMELINE_FRAMES) ||
      ls.some((l) => l + layerDelta < 0 || l + layerDelta >= t.layers.length)
    )
      return t;
    if (
      ls.some(
        (l) =>
          !layerEditable(t, l) ||
          !layerEditable(t, l + layerDelta) ||
          isBackgroundLayer(t.layers[l]) ||
          isBackgroundLayer(t.layers[l + layerDelta]),
      )
    )
      return t;
    try {
      assertTilemapTimeline(t);
    } catch {
      return t;
    }
    if (ls.some((l) => t.layers[l].kind === "group" || t.layers[l + layerDelta].kind === "group"))
      return t;
    const frames = t.frames.map((f) => ({ ...f, cels: [...f.cels] }));
    while (frames.length <= fs[fs.length - 1] + frameDelta)
      frames.push({
        duration: frames[frames.length - 1].duration,
        palette: frames[frames.length - 1].palette,
        cels: t.layers.map(() => null),
      });
    if (!copy) for (const f of fs) for (const l of ls) frames[f].cels[l] = null;
    let next: SpriteTimeline = { ...t, frames };
    const converted = new Map<object, Map<string, { cel: TimelineCel; dx: number; dy: number }>>();
    for (const f of fs)
      for (const l of ls) {
        const source = t.frames[f].cels[l],
          dest = l + layerDelta,
          from = t.layers[l],
          to = t.layers[dest];
        if (
          !source ||
          (from.kind === to.kind && (from.kind !== "tilemap" || from.tilesetId === to.tilesetId))
        ) {
          frames[f + frameDelta].cels[dest] = clone(source);
          continue;
        }
        const key = source.tilemap ?? source.asepriteSamples ?? source.pixels;
        let cache = converted.get(key);
        if (!cache) {
          cache = new Map();
          converted.set(key, cache);
        }
        const set = to.kind === "tilemap" ? tilesetForLayer(next, dest) : undefined;
        const alignment =
          set && !source.tilemap
            ? `${(((source.x - (t.gridBounds?.x ?? 0)) % set.tileWidth) + set.tileWidth) % set.tileWidth},${(((source.y - (t.gridBounds?.y ?? 0)) % set.tileHeight) + set.tileHeight) % set.tileHeight}`
            : "";
        const cacheKey = `${dest}:${alignment}`,
          prior = cache.get(cacheKey);
        if (prior) {
          const payload = prior.cel;
          frames[f + frameDelta].cels[dest] = {
            ...source,
            tilemap: payload.tilemap,
            pixels:
              !payload.tilemap && payload.asepriteSamples
                ? {
                    width: payload.asepriteSamples.width,
                    height: payload.asepriteSamples.height,
                    data: expandAsepriteSamples(
                      payload.asepriteSamples,
                      paletteForColors(frames[f + frameDelta].palette),
                      t.transparentIndex ?? 0,
                    ),
                  }
                : payload.pixels,
            asepriteSamples: payload.asepriteSamples,
            x: source.x + prior.dx,
            y: source.y + prior.dy,
            source: undefined,
          };
          continue;
        }
        const result = transferCelPayload(t, next, source, l, dest, f + frameDelta, f);
        next = { ...next, tilesets: result.tilesets };
        frames[f + frameDelta].cels[dest] = result.cel;
        cache.set(cacheKey, {
          cel: result.cel,
          dx: result.cel.x - source.x,
          dy: result.cel.y - source.y,
        });
      }
    return {
      ...refreshTilemapProjections(next),
      activeFrame: fs[0] + frameDelta,
      activeLayer: ls[0] + layerDelta,
      range: {
        ...range,
        frames: fs.map((f) => f + frameDelta),
        layers: ls.map((l) => l + layerDelta),
      },
    };
  }
  const selected = range.kind === "frames" ? fs : ls,
    delta = range.kind === "frames" ? frameDelta : layerDelta;
  const count = range.kind === "frames" ? t.frames.length : t.layers.length;
  if (!delta && !copy) return t;
  if (
    copy &&
    count + selected.length > (range.kind === "frames" ? MAX_TIMELINE_FRAMES : MAX_TIMELINE_LAYERS)
  )
    return t;
  const destination = Math.max(
    0,
    Math.min(count - (copy ? 0 : selected.length), selected[0] + delta),
  );
  if (
    range.kind === "layers" &&
    (selected.some((l) => isBackgroundLayer(t.layers[l])) ||
      (destination === 0 && t.layers.some(isBackgroundLayer)))
  )
    return t;
  const order = Array.from({ length: count }, (_, i) => i).filter(
    (i) => copy || !selected.includes(i),
  );
  order.splice(destination, 0, ...selected);
  const selectedResult = selected.map((_, i) => destination + i);
  if (range.kind === "frames") {
    const frames = order.map((index, i) =>
      copy && i >= destination && i < destination + selected.length
        ? { ...t.frames[index], source: undefined, cels: t.frames[index].cels.map(clone) }
        : t.frames[index],
    );
    // DocApi::adjustTags: remove source frames, then fit inserted frames
    // inside the destination tag. Do not stretch a tag across unrelated frames.
    let tags = [...timelineTags(t)];
    if (!copy)
      for (const index of [...selected].reverse())
        tags = tags.flatMap((tag) => {
          const from = tag.from - (index < tag.from ? 1 : 0),
            to = tag.to - (index <= tag.to ? 1 : 0);
          return from > to ? [] : [{ ...tag, from, to }];
        });
    for (let i = 0; i < selected.length; i++) {
      const index = destination + i;
      tags = tags.map((tag) => ({
        ...tag,
        from: tag.from + (index < tag.from ? 1 : 0),
        to: tag.to + (index <= tag.to ? 1 : 0),
      }));
    }
    return withTimelineTags(
      { ...t, frames, activeFrame: destination, range: { ...range, frames: selectedResult } },
      tags,
    );
  }
  const ids = new Set(t.layers.map((l) => l.id));
  let layers = order.map((index, i) => {
    if (!copy || i < destination || i >= destination + selected.length) return t.layers[index];
    let n = 1;
    while (ids.has(`layer-${n}`)) n++;
    ids.add(`layer-${n}`);
    return {
      ...t.layers[index],
      source: t.layers[index].source ? { ...t.layers[index].source!, uuid: undefined } : undefined,
      id: `layer-${n}`,
      name: `${t.layers[index].name} Copy`,
    };
  });
  if (copy) {
    const ids = new Map(selected.map((old, i) => [t.layers[old].id, layers[destination + i].id]));
    layers = layers.map((l, i) =>
      i >= destination && i < destination + selected.length
        ? { ...l, parentId: ids.get(l.parentId ?? "") ?? l.parentId }
        : l,
    );
  }
  // Preserve parent-first contiguous hierarchy. Invalid multi-selection restacks leave the graph intact.
  let open: string[] = [];
  for (const l of layers) {
    if (l.parentId) {
      const depth = open.indexOf(l.parentId);
      if (depth < 0) return t;
      open = open.slice(0, depth + 1);
    } else open = [];
    if (l.kind === "group") open.push(l.id);
  }
  const frames = t.frames.map((f) => ({
    ...f,
    cels: order.map((index, i) =>
      copy && i >= destination && i < destination + selected.length
        ? clone(f.cels[index])
        : f.cels[index],
    ),
  }));
  return {
    ...t,
    layers,
    frames,
    activeLayer: destination,
    range: { ...range, layers: selectedResult },
  };
}

/** Rasterize a single cel's retained samples without palette round trips (duplicate
 * indexed colors must keep their original indices, including across frames). */
function asepriteCelRaster(
  t: SpriteTimeline,
  cel: TimelineCel,
  li: number,
  fi: number,
): AsepriteImageSamples | undefined {
  const depth = t.colorDepth;
  if (depth !== 8 && depth !== 16) return undefined;
  if (!cel.tilemap)
    return (
      cel.asepriteSamples ??
      encodeAsepriteSamples(
        cel.pixels,
        depth,
        paletteForColors(t.frames[fi]?.palette),
        t.transparentIndex ?? 0,
      )
    );
  const set = tilesetForLayer(t, li),
    w = set.tileWidth,
    h = set.tileHeight;
  const asepritePixels =
    set.asepritePixels ??
    encodeAsepriteSamples(
      { width: w, height: h * set.tileCount, data: new Uint8ClampedArray(set.pixels) },
      depth,
      paletteForColors(t.frames[fi]?.palette),
      t.transparentIndex ?? 0,
    ).data;
  return rasterizeTilemapSamples(
    cel.tilemap,
    { ...set, asepritePixels },
    depth,
    t.transparentIndex ?? 0,
  );
}

/** Transfer one cel with its position, opacity and retained samples. The image
 * conversion follows .refs/libresprite/src/app/util/create_cel_copy.cpp;
 * tilemap destinations reuse matching Tileset content. */
function transferCelPayload(
  source: SpriteTimeline,
  target: SpriteTimeline,
  cel: TimelineCel,
  from: number,
  to: number,
  fi: number,
  sourceFrame: number,
): { cel: TimelineCel; tilesets: SpriteTimeline["tilesets"] } {
  const sourceSet = cel.tilemap ? tilesetForLayer(source, from) : undefined,
    destSet = target.layers[to].kind === "tilemap" ? tilesetForLayer(target, to) : undefined;
  if (
    sourceSet &&
    destSet &&
    sourceSet.tileWidth === destSet.tileWidth &&
    sourceSet.tileHeight === destSet.tileHeight
  ) {
    const merged = mergeClipboardTileset(destSet, sourceSet, cel.tilemap!.tiles),
      map = { ...cel.tilemap!, tiles: cel.tilemap!.tiles.map(merged.remap) };
    return {
      cel: {
        ...cel,
        tilemap: map,
        asepriteSamples: undefined,
        source: undefined,
        pixels: rasterizeTilemap(
          map,
          merged.tileset,
          target.colorDepth,
          target.frames[fi].palette,
          target.transparentIndex,
        ),
      },
      tilesets: target.tilesets!.map((s) => (s.id === destSet.id ? merged.tileset : s)),
    };
  }
  const sourceSamples = asepriteCelRaster(source, cel, from, sourceFrame);
  const pixels = sourceSamples
    ? {
        width: sourceSamples.width,
        height: sourceSamples.height,
        data: expandAsepriteSamples(
          sourceSamples,
          paletteForColors(target.frames[fi].palette),
          target.transparentIndex ?? 0,
        ),
      }
    : cel.tilemap
      ? rasterizeTilemap(cel.tilemap, sourceSet!)
      : cel.pixels;
  if (!destSet) {
    let left = pixels.width,
      top = pixels.height,
      right = -1,
      bottom = -1;
    for (let yy = 0; yy < pixels.height; yy++)
      for (let xx = 0; xx < pixels.width; xx++) {
        const i = yy * pixels.width + xx,
          visible =
            sourceSamples?.depth === 8
              ? sourceSamples.data[i] !== (target.transparentIndex ?? 0)
              : sourceSamples?.depth === 16
                ? sourceSamples.data[i * 2 + 1] !== 0
                : pixels.data[i * 4 + 3] !== 0;
        if (visible) {
          left = Math.min(left, xx);
          top = Math.min(top, yy);
          right = Math.max(right, xx);
          bottom = Math.max(bottom, yy);
        }
      }
    if (right < left)
      return {
        cel: {
          ...cel,
          tilemap: undefined,
          source: undefined,
          asepriteSamples: sourceSamples,
          pixels,
        },
        tilesets: target.tilesets,
      };
    const width = right - left + 1,
      height = bottom - top + 1,
      data = new Uint8ClampedArray(width * height * 4),
      raw = sourceSamples
        ? new Uint8Array(width * height * (sourceSamples.depth / BITS_PER_BYTE))
        : undefined;
    for (let yy = 0; yy < height; yy++) {
      const at = (top + yy) * pixels.width + left;
      data.set(pixels.data.subarray(at * 4, (at + width) * 4), yy * width * 4);
      if (raw) {
        const stride = sourceSamples!.depth / BITS_PER_BYTE;
        raw.set(
          sourceSamples!.data.subarray(at * stride, (at + width) * stride),
          yy * width * stride,
        );
      }
    }
    return {
      cel: {
        ...cel,
        x: cel.x + left,
        y: cel.y + top,
        tilemap: undefined,
        source: undefined,
        asepriteSamples: sourceSamples
          ? { ...sourceSamples, width, height, data: raw! }
          : undefined,
        pixels: { width, height, data },
      },
      tilesets: target.tilesets,
    };
  }
  const w = destSet.tileWidth,
    h = destSet.tileHeight,
    bx = cel.tilemap ? cel.x : (target.gridBounds?.x ?? 0),
    by = cel.tilemap ? cel.y : (target.gridBounds?.y ?? 0);
  const x = bx + Math.floor((cel.x - bx) / w) * w,
    y = by + Math.floor((cel.y - by) / h) * h,
    width = Math.ceil((cel.x + pixels.width - x) / w),
    height = Math.ceil((cel.y + pixels.height - y) / h),
    count = width * height;
  if (width * w > 16384 || height * h > 16384 || (count + 1) * w * h > MAX_IMAGE_PIXELS)
    throw new RangeError("Transferred Tilemap exceeds memory limit");
  const rgba = new Uint8Array((count + 1) * w * h * 4),
    stride = sourceSamples ? sourceSamples.depth / BITS_PER_BYTE : 0,
    raw = sourceSamples ? new Uint8Array((count + 1) * w * h * stride) : undefined;
  if (raw && sourceSamples?.depth === 8) raw.fill(target.transparentIndex ?? 0);
  const tiles = new Uint32Array(count);
  for (let cell = 0; cell < count; cell++) {
    let empty = true;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const sx = x + (cell % width) * w + xx - cel.x,
          sy = y + Math.floor(cell / width) * h + yy - cel.y;
        if (sx < 0 || sy < 0 || sx >= pixels.width || sy >= pixels.height) continue;
        const src = sy * pixels.width + sx,
          dst = (cell + 1) * w * h + yy * w + xx;
        rgba.set(pixels.data.subarray(src * 4, src * 4 + 4), dst * 4);
        if (raw)
          raw.set(sourceSamples!.data.subarray(src * stride, (src + 1) * stride), dst * stride);
        if (
          sourceSamples?.depth === 8
            ? sourceSamples.data[src] !== (target.transparentIndex ?? 0)
            : sourceSamples?.depth === 16
              ? sourceSamples.data[src * 2 + 1] !== 0
              : pixels.data[src * 4 + 3] !== 0
        )
          empty = false;
      }
    tiles[cell] = empty ? 0 : cell + 1;
  }
  const temporary: AsepriteTileset = {
    ...destSet,
    tileCount: count + 1,
    pixels: rgba,
    asepritePixels: raw,
    tileUserData: undefined,
  };
  const merged = mergeClipboardTileset(destSet, temporary, tiles),
    map = { width, height, tiles: tiles.map(merged.remap) };
  return {
    cel: {
      ...cel,
      x,
      y,
      tilemap: map,
      asepriteSamples: undefined,
      source: undefined,
      pixels: rasterizeTilemap(
        map,
        merged.tileset,
        target.colorDepth,
        target.frames[fi].palette,
        target.transparentIndex,
      ),
    },
    tilesets: target.tilesets!.map((s) => (s.id === destSet.id ? merged.tileset : s)),
  };
}
