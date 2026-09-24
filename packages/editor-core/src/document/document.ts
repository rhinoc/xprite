import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import { tilemapIndexedPixelAt } from "$/tilemap/model";
import {
  LAYER_REFERENCE,
  effectiveLayerVisible,
  isBackgroundLayer,
  layerEditable,
  type SpriteTimeline,
} from "$/timeline/timeline";

export function ensureTimeline(doc: EditorDocument): SpriteTimeline {
  if (doc.timeline) return doc.timeline;
  const layer = doc.layer;
  return (doc.timeline = {
    composeGroups: false,
    activeLayer: 0,
    activeFrame: 0,
    layers: [
      {
        id: "layer-1",
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity ?? UINT8_MAX,
        flags: (layer.visible ? 1 : 0) | (layer.locked ? 0 : 2),
      },
    ],
    frames: [
      {
        duration: 100,
        cels: [
          {
            pixels: layer.pixels,
            x: layer.x,
            y: layer.y,
            opacity: layer.celOpacity ?? UINT8_MAX,
            zIndex: layer.zIndex ?? 0,
          },
        ],
      },
    ],
  });
}
/** Flush the active raster-tool projection into immutable timeline containers.
 * Pixels themselves retain their tile-history identity, including linked cels. */
export function syncTimeline(doc: EditorDocument) {
  const timeline = doc.timeline;
  if (!timeline) return;
  const { activeLayer: li, activeFrame: fi } = timeline,
    layer = doc.layer,
    old = timeline.layers[li],
    frame = timeline.frames[fi],
    cel = frame.cels[li];
  const changedLayer =
    old.name !== layer.name ||
    old.visible !== layer.visible ||
    old.opacity !== (layer.opacity ?? UINT8_MAX);
  const shouldCreate =
    old.kind !== "tilemap" &&
    old.kind !== "group" &&
    !(old.flags & LAYER_REFERENCE) &&
    (!layer.emptyCel || layer.pixels.data.some((value, index) => index % 4 === 3 && value !== 0));
  const referenceMotion =
    (!!(old.flags & LAYER_REFERENCE) || (old.kind === "tilemap" && cel?.pixels === layer.pixels)) &&
    !!cel &&
    (cel.x !== layer.x || cel.y !== layer.y);
  const changedCel =
    referenceMotion ||
    (shouldCreate &&
      (!cel ||
        cel.pixels !== layer.pixels ||
        cel.x !== layer.x ||
        cel.y !== layer.y ||
        cel.opacity !== (layer.celOpacity ?? UINT8_MAX) ||
        cel.zIndex !== (layer.zIndex ?? 0)));
  if (!changedLayer && !changedCel) return;
  let layers = timeline.layers,
    frames = timeline.frames;
  if (changedLayer) {
    layers = layers.map((item, index) =>
      index === li
        ? {
            ...item,
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity ?? UINT8_MAX,
            flags: (item.flags & ~1) | (layer.visible ? 1 : 0),
          }
        : item,
    );
  }
  if (changedCel) {
    // Resizing a shared cel image must retain Aseprite linked-cel identity. Cel
    // positions remain independent; only image-origin growth offsets propagate.
    if (old.kind !== "tilemap" && cel && cel.pixels !== layer.pixels) {
      const dx = layer.x - cel.x,
        dy = layer.y - cel.y;
      frames = frames.map((item) => ({
        ...item,
        cels: item.cels.map((value) =>
          value?.pixels === cel.pixels
            ? { ...value, pixels: layer.pixels, x: value.x + dx, y: value.y + dy }
            : value,
        ),
      }));
    }
    const cels = [...frames[fi].cels];
    cels[li] = {
      ...cel,
      ...(referenceMotion && cel?.preciseBounds
        ? {
            preciseBounds: {
              ...cel.preciseBounds,
              x: cel.preciseBounds.x + layer.x - cel.x,
              y: cel.preciseBounds.y + layer.y - cel.y,
            },
          }
        : {}),
      pixels: old.kind === "tilemap" && cel ? cel.pixels : layer.pixels,
      x: layer.x,
      y: layer.y,
      opacity: layer.celOpacity ?? UINT8_MAX,
      zIndex: layer.zIndex ?? 0,
    };
    frames = frames.map((item, index) => (index === fi ? { ...item, cels } : item));
    layer.emptyCel = false;
  }
  doc.timeline = { ...timeline, layers, frames };
}
export function activateTimelineCel(doc: EditorDocument, frameIndex: number, layerIndex: number) {
  const timeline = ensureTimeline(doc);
  if (
    !Number.isInteger(frameIndex) ||
    frameIndex < 0 ||
    frameIndex >= timeline.frames.length ||
    !Number.isInteger(layerIndex) ||
    layerIndex < 0 ||
    layerIndex >= timeline.layers.length
  )
    throw new RangeError("Invalid active cel");
  const layer = timeline.layers[layerIndex],
    cel = timeline.frames[frameIndex].cels[layerIndex];
  doc.timeline =
    timeline.activeFrame === frameIndex && timeline.activeLayer === layerIndex
      ? timeline
      : { ...timeline, activeFrame: frameIndex, activeLayer: layerIndex };
  if (timeline.frames[frameIndex].palette) doc.palette = timeline.frames[frameIndex].palette;
  doc.layer = {
    name: layer.name,
    visible: layer.visible,
    locked: !layerEditable(timeline, layerIndex),
    opacity: layer.opacity,
    pixels: cel?.pixels ?? { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    x: cel?.x ?? 0,
    y: cel?.y ?? 0,
    celOpacity: cel?.opacity ?? UINT8_MAX,
    zIndex: cel?.zIndex ?? 0,
    emptyCel: !cel,
  };
}

export function layerAtPoint(doc: EditorDocument, x: number, y: number): number | null {
  const t = ensureTimeline(doc),
    frame = t.frames[t.activeFrame];
  const children = (parent: string | null): number[] =>
    t.layers
      .map((layer, index) => ({ layer, index }))
      .filter((v) =>
        t.composeGroups !== true ? v.layer.kind !== "group" : (v.layer.parentId ?? null) === parent,
      )
      .map((v, i) => ({
        ...v,
        order: t.composeGroups !== true ? v.index : i,
        cel: frame.cels[v.index],
      }))
      .sort(
        (a, b) =>
          a.order + (a.cel?.zIndex ?? 0) - (b.order + (b.cel?.zIndex ?? 0)) ||
          (a.cel?.zIndex ?? 0) - (b.cel?.zIndex ?? 0),
      )
      .flatMap((v) => (v.layer.kind === "group" ? children(v.layer.id) : [v.index]));
  const order = children(null);
  for (let i = order.length - 1; i >= 0; i--) {
    const index = order[i],
      layer = t.layers[index],
      cel = frame.cels[index];
    if (!effectiveLayerVisible(t, index) || !cel) continue;
    const bounds =
      layer.flags & LAYER_REFERENCE && cel.preciseBounds
        ? cel.preciseBounds
        : { x: cel.x, y: cel.y, width: cel.pixels.width, height: cel.pixels.height };
    const px = Math.floor(((x - bounds.x) * cel.pixels.width) / bounds.width),
      py = Math.floor(((y - bounds.y) * cel.pixels.height) / bounds.height);
    if (px < 0 || py < 0 || px >= cel.pixels.width || py >= cel.pixels.height) continue;
    const samples = cel.asepriteSamples;
    const indexed =
      t.colorDepth === 8 &&
      samples?.depth === 8 &&
      samples.width === cel.pixels.width &&
      samples.height === cel.pixels.height;
    const paletteIndex = indexed
      ? samples.data[py * samples.width + px]
      : tilemapIndexedPixelAt(t, index, { x: px, y: py });
    const occupied =
      paletteIndex !== undefined
        ? paletteIndex !== (t.transparentIndex ?? 0)
        : cel.pixels.data[(py * cel.pixels.width + px) * 4 + 3] > 0;
    if (occupied) return index;
  }
  return null;
}

export function trimActiveCel(doc: EditorDocument) {
  const t = ensureTimeline(doc),
    layer = doc.layer,
    image = layer.pixels,
    active = t.frames[t.activeFrame].cels[t.activeLayer],
    raw = active?.asepriteSamples;
  if (isBackgroundLayer(t.layers[t.activeLayer])) return;
  const indexed = raw?.depth === 8 && raw.width === image.width && raw.height === image.height;
  const occupied = indexed
    ? (x: number, y: number) => raw!.data[y * image.width + x] !== (t.transparentIndex ?? 0)
    : (x: number, y: number) => !!image.data[(y * image.width + x) * 4 + 3];
  const rowOccupied = (y: number) => {
    for (let x = 0; x < image.width; x++) if (occupied(x, y)) return true;
    return false;
  };
  let top = 0,
    bottom = image.height - 1,
    left = 0,
    right = image.width - 1;
  // Find exact outer bounds without visiting the occupied interior. An opaque
  // full-size fill needs only four edge pixels; transparent/indexed semantics
  // and linked-cel replacement below remain unchanged.
  while (top <= bottom && !rowOccupied(top)) top++;
  if (top > bottom) right = -1;
  else {
    while (bottom > top && !rowOccupied(bottom)) bottom--;
    const columnOccupied = (x: number) => {
      for (let y = top; y <= bottom; y++) if (occupied(x, y)) return true;
      return false;
    };
    while (left <= right && !columnOccupied(left)) left++;
    while (right > left && !columnOccupied(right)) right--;
  }
  if (right < 0) {
    const t = ensureTimeline(doc),
      old = layer.pixels;
    doc.timeline = {
      ...t,
      frames: t.frames.map((frame) => ({
        ...frame,
        cels: frame.cels.map((cel) =>
          (raw ? cel?.asepriteSamples === raw : cel?.pixels === old) ? null : cel,
        ),
      })),
    };
    doc.layer = {
      ...layer,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      x: 0,
      y: 0,
      emptyCel: true,
    };
    return;
  }
  if (left === 0 && top === 0 && right === image.width - 1 && bottom === image.height - 1) return;
  const width = right - left + 1,
    height = bottom - top + 1,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    data.set(
      image.data.subarray(
        ((top + y) * image.width + left) * 4,
        ((top + y) * image.width + left + width) * 4,
      ),
      y * width * 4,
    );
  if (raw && raw.width === image.width && raw.height === image.height) {
    const stride = raw.depth / BITS_PER_BYTE,
      sourceSampleData = new Uint8Array(width * height * stride);
    for (let y = 0; y < height; y++)
      sourceSampleData.set(
        raw.data.subarray(
          ((top + y) * raw.width + left) * stride,
          ((top + y) * raw.width + left + width) * stride,
        ),
        y * width * stride,
      );
    const asepriteSamples = { ...raw, width, height, data: sourceSampleData },
      cache = new Map<PixelBuffer, PixelBuffer>();
    cache.set(image, { width, height, data });
    doc.timeline = {
      ...t,
      frames: t.frames.map((f) => ({
        ...f,
        cels: f.cels.map((c) => {
          if (c?.asepriteSamples !== raw) return c;
          let pixels = cache.get(c.pixels);
          if (!pixels) {
            const bytes = new Uint8ClampedArray(width * height * 4);
            for (let y = 0; y < height; y++)
              bytes.set(
                c.pixels.data.subarray(
                  ((top + y) * c.pixels.width + left) * 4,
                  ((top + y) * c.pixels.width + left + width) * 4,
                ),
                y * width * 4,
              );
            pixels = { width, height, data: bytes };
            cache.set(c.pixels, pixels);
          }
          return { ...c, pixels, asepriteSamples, x: c.x + left, y: c.y + top };
        }),
      })),
    };
    doc.layer = {
      ...layer,
      x: layer.x + left,
      y: layer.y + top,
      pixels: cache.get(image)!,
      emptyCel: false,
    };
    return;
  }
  doc.layer = {
    ...layer,
    x: layer.x + left,
    y: layer.y + top,
    pixels: { width, height, data },
    emptyCel: false,
  };
  syncTimeline(doc);
}
