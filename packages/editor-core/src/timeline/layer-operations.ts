import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import { blendImageAt } from "$/canvas/blend-modes";
import {
  encodeAsepriteSamples,
  asepriteBackgroundSample,
  asepriteProjectionCache,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import {
  effectiveLayerVisible,
  layerEditable,
  isBackgroundLayer,
  layerAncestors,
  MAX_TIMELINE_LAYERS,
  renderTimelineFrame,
  defaultLayerName,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineLayer,
} from "$/timeline/timeline";

export function layerSubtree(t: SpriteTimeline, index: number): number[] {
  const id = t.layers[index]?.id;
  return t.layers.flatMap((_, i) =>
    i === index || layerAncestors(t, i).some((l) => l.id === id) ? [i] : [],
  );
}
/** A selected layer brings its ancestor path into a copied layer tree. Selecting
 * a group also includes visible descendants; explicitly selected hidden layers
 * remain in the result. */
export function selectedLayerTree(t: SpriteTimeline, roots: readonly number[]): number[] {
  const selected = new Set<number>();
  const byId = new Map(t.layers.map((layer, index) => [layer.id, index]));
  const children = new Map<string, number[]>();
  for (let index = 0; index < t.layers.length; index++) {
    const parent = t.layers[index].parentId;
    if (parent) {
      const siblings = children.get(parent) ?? [];
      siblings.push(index);
      children.set(parent, siblings);
    }
  }
  const include = (index: number) => {
    if (selected.has(index) || !t.layers[index]) return;
    selected.add(index);
    let parent = t.layers[index].parentId;
    while (parent) {
      const at = byId.get(parent);
      if (at === undefined) break;
      selected.add(at);
      parent = t.layers[at].parentId;
    }
    if (t.layers[index].kind === "group")
      for (const child of children.get(t.layers[index].id) ?? [])
        if (t.layers[child].visible) include(child);
  };
  for (const root of roots) include(root);
  return [...selected].sort((a, b) => a - b);
}
function nextId(t: SpriteTimeline) {
  let n = 1;
  while (t.layers.some((l) => l.id === `layer-${n}`)) n++;
  return `layer-${n}`;
}
export function insertLayer(
  t: SpriteTimeline,
  name: string,
  kind: "image" | "group" = "image",
  reference?: PixelBuffer,
): SpriteTimeline {
  if (t.layers.length >= MAX_TIMELINE_LAYERS) return t;
  const active = t.layers[t.activeLayer],
    at = reference
      ? isBackgroundLayer(t.layers[0])
        ? 1
        : 0
      : active.kind === "group"
        ? t.activeLayer + 1
        : Math.max(...layerSubtree(t, t.activeLayer)) + 1;
  const layer: TimelineLayer = {
    id: nextId(t),
    name,
    kind,
    parentId: reference ? null : active.kind === "group" ? active.id : (active.parentId ?? null),
    blendMode: 0,
    visible: true,
    locked: false,
    opacity: UINT8_MAX,
    flags: 3 | (reference ? 64 : 0),
  };
  const layers = [...t.layers];
  layers.splice(at, 0, layer);
  return {
    ...t,
    layers,
    frames: t.frames.map((f, i) => {
      const cels = [...f.cels];
      cels.splice(
        at,
        0,
        reference && i === t.activeFrame
          ? {
              pixels: { ...reference, data: reference.data.slice() },
              x: 0,
              y: 0,
              opacity: UINT8_MAX,
              zIndex: 0,
              preciseBounds: { x: 0, y: 0, width: reference.width, height: reference.height },
            }
          : null,
      );
      return { ...f, cels };
    }),
    activeLayer: at,
    range: undefined,
  };
}
export function removeLayers(t: SpriteTimeline, indices: readonly number[]): SpriteTimeline {
  const removed = new Set(indices.flatMap((i) => layerSubtree(t, i)));
  if (removed.size >= t.layers.length) return t;
  const keep = t.layers.map((_, i) => i).filter((i) => !removed.has(i));
  return {
    ...t,
    layers: keep.map((i) => t.layers[i]),
    frames: t.frames.map((f) => ({ ...f, cels: keep.map((i) => f.cels[i]) })),
    activeLayer: Math.max(
      0,
      keep.indexOf(t.activeLayer) >= 0
        ? keep.indexOf(t.activeLayer)
        : Math.min(keep.length - 1, t.activeLayer),
    ),
    range: undefined,
  };
}
export function duplicateLayers(
  t: SpriteTimeline,
  indices: readonly number[] = [t.activeLayer],
): SpriteTimeline {
  const selected = [...new Set(indices.flatMap((i) => layerSubtree(t, i)))].sort((a, b) => a - b);
  if (!selected.length || t.layers.length + selected.length > MAX_TIMELINE_LAYERS) return t;
  const ids = new Map<string, string>();
  let n = 1;
  for (const i of selected) {
    while (t.layers.some((l) => l.id === `layer-${n}`) || [...ids.values()].includes(`layer-${n}`))
      n++;
    ids.set(t.layers[i].id, `layer-${n++}`);
  }
  const at = selected[selected.length - 1] + 1,
    layers = [...t.layers];
  layers.splice(
    at,
    0,
    ...selected.map((i) => ({
      ...t.layers[i],
      source: t.layers[i].source ? { ...t.layers[i].source!, uuid: undefined } : undefined,
      id: ids.get(t.layers[i].id)!,
      name: `${t.layers[i].name} Copy`,
      parentId: ids.get(t.layers[i].parentId ?? "") ?? t.layers[i].parentId,
      flags: t.layers[i].flags & ~12,
    })),
  );
  const tilemaps = new Map<
    NonNullable<TimelineCel["tilemap"]>,
    NonNullable<TimelineCel["tilemap"]>
  >();
  const images = new Map<PixelBuffer, PixelBuffer>(),
    sampleImageCopies = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  return {
    ...t,
    layers,
    frames: t.frames.map((f) => {
      const cels = [...f.cels];
      cels.splice(
        at,
        0,
        ...selected.map((i) => {
          const c = f.cels[i];
          if (!c) return null;
          let p = images.get(c.pixels);
          if (!p) {
            p = { ...c.pixels, data: c.pixels.data.slice() };
            images.set(c.pixels, p);
          }
          let asepriteSamples = c.asepriteSamples;
          if (asepriteSamples) {
            let clone = sampleImageCopies.get(asepriteSamples);
            if (!clone) {
              clone = { ...asepriteSamples, data: asepriteSamples.data.slice() };
              sampleImageCopies.set(asepriteSamples, clone);
            }
            asepriteSamples = clone;
          }
          let tilemap = c.tilemap;
          if (tilemap) {
            let copy = tilemaps.get(tilemap);
            if (!copy) {
              copy = { ...tilemap, tiles: tilemap.tiles.slice() };
              tilemaps.set(tilemap, copy);
            }
            tilemap = copy;
          }
          return {
            ...c,
            tilemap,
            asepriteSamples,
            source: c.source ? { ...c.source, linkedFrame: undefined } : undefined,
            pixels: p,
          };
        }),
      );
      return { ...f, cels };
    }),
    activeLayer: at,
    range: undefined,
  };
}
/** Move one complete subtree, adopting destination's parent. A group cannot enter itself. */
export function moveLayerTree(
  t: SpriteTimeline,
  index: number,
  target: number,
  intoGroup = false,
): SpriteTimeline {
  if (!t.layers[index] || !t.layers[target] || isBackgroundLayer(t.layers[index])) return t;
  const tree = layerSubtree(t, index),
    destination = t.layers[target];
  if (tree.includes(target)) return t;
  if (target === 0 && isBackgroundLayer(destination)) return t;
  const parentId =
    intoGroup && destination.kind === "group" ? destination.id : (destination.parentId ?? null);
  const rest = t.layers.map((_, i) => i).filter((i) => !tree.includes(i));
  let at =
    rest.indexOf(target) +
    (intoGroup
      ? 1
      : index < target
        ? layerSubtree(t, target).filter((i) => rest.includes(i)).length
        : 0);
  at = Math.max(0, at);
  const order = [...rest];
  order.splice(at, 0, ...tree);
  return {
    ...t,
    layers: order.map((i) => (i === index ? { ...t.layers[i], parentId } : t.layers[i])),
    frames: t.frames.map((f) => ({ ...f, cels: order.map((i) => f.cels[i]) })),
    activeLayer: at,
    range: undefined,
  };
}
export function canMergeDown(t: SpriteTimeline): boolean {
  const a = t.layers[t.activeLayer];
  if (!a || a.kind === "group" || a.flags & 64) return false;
  const siblings = t.layers
    .map((l, i) => ({ l, i }))
    .filter((v) => (v.l.parentId ?? null) === (a.parentId ?? null));
  const at = siblings.findIndex((v) => v.i === t.activeLayer);
  return at > 0 && siblings[at - 1].l.kind !== "group" && !(siblings[at - 1].l.flags & 64);
}
function shrink(p: PixelBuffer, x = 0, y = 0): TimelineCel | null {
  let x0 = p.width,
    y0 = p.height,
    x1 = -1,
    y1 = -1;
  for (let Y = 0; Y < p.height; Y++)
    for (let X = 0; X < p.width; X++)
      if (p.data[(Y * p.width + X) * 4 + 3]) {
        x0 = Math.min(x0, X);
        y0 = Math.min(y0, Y);
        x1 = Math.max(x1, X);
        y1 = Math.max(y1, Y);
      }
  if (x1 < 0) return null;
  const width = x1 - x0 + 1,
    height = y1 - y0 + 1,
    data = new Uint8ClampedArray(width * height * 4);
  for (let Y = 0; Y < height; Y++)
    data.set(
      p.data.subarray(((Y + y0) * p.width + x0) * 4, ((Y + y0) * p.width + x0 + width) * 4),
      Y * width * 4,
    );
  return { pixels: { width, height, data }, x: x + x0, y: y + y0, opacity: UINT8_MAX, zIndex: 0 };
}
export function mergeDown(t: SpriteTimeline): SpriteTimeline {
  if (!canMergeDown(t)) return t;
  const a = t.activeLayer,
    parent = t.layers[a].parentId ?? null,
    b = t.layers
      .map((l, i) => ({ l, i }))
      .filter((v) => v.i < a && (v.l.parentId ?? null) === parent)
      .slice(-1)[0].i;
  let x = 0,
    y = 0,
    right = 1,
    bottom = 1;
  for (const f of t.frames)
    for (const i of [a, b]) {
      const c = f.cels[i];
      if (c) {
        x = Math.min(x, c.x);
        y = Math.min(y, c.y);
        right = Math.max(right, c.x + c.pixels.width);
        bottom = Math.max(bottom, c.y + c.pixels.height);
      }
    }
  const plan: SpriteTimeline = {
    ...t,
    layers: [t.layers[b], t.layers[a]].map((l) => ({ ...l, parentId: null, visible: true })),
    frames: t.frames.map((f) => ({
      ...f,
      cels: [f.cels[b], f.cels[a]].map((c) => (c ? { ...c, x: c.x - x, y: c.y - y } : null)),
    })),
  };
  const merged = t.frames.map((_, i) =>
    shrink(renderTimelineFrame(plan, right - x, bottom - y, i), x, y),
  );
  const out = removeLayers(t, [a]);
  return {
    ...out,
    activeLayer: b,
    layers: out.layers.map((l, i) =>
      i === b
        ? {
            ...l,
            kind: "image",
            tilesetId: undefined,
            source: undefined,
            opacity: UINT8_MAX,
            blendMode: 0,
          }
        : l,
    ),
    frames: out.frames.map((f, i) => ({
      ...f,
      cels: f.cels.map((c, j) => (j === b ? merged[i] : c)),
    })),
  };
}
export function flattenLayers(
  t: SpriteTimeline,
  width: number,
  height: number,
  visibleOnly = false,
): SpriteTimeline {
  let roots: number[];
  if (visibleOnly) roots = t.layers.flatMap((l, i) => (!l.parentId && l.visible ? [i] : []));
  else if (
    t.range?.kind === "layers" &&
    (t.range.layers.length > 1 || t.layers[t.range.layers[0]]?.kind === "group")
  )
    roots = [...t.range.layers].filter(
      (i) =>
        !layerAncestors(t, i).some((l) => t.range!.layers.some((j) => t.layers[j].id === l.id)),
    );
  else roots = t.layers.flatMap((l, i) => (!l.parentId ? [i] : []));
  if (!roots.length) return t;
  const selected = new Set(roots.flatMap((i) => layerSubtree(t, i))),
    rootIds = new Set(roots.map((i) => t.layers[i].id));
  const included = new Set([
    ...rootIds,
    ...roots.flatMap((i) => layerAncestors(t, i).map((l) => l.id)),
  ]);
  const plan = {
    ...t,
    layers: t.layers.map((l, i) => ({
      ...l,
      visible: included.has(l.id) || (selected.has(i) && l.visible),
    })),
  };
  const background = roots.find((i) => isBackgroundLayer(t.layers[i]) && t.layers[i].visible);
  const layer: TimelineLayer =
    background !== undefined
      ? { ...t.layers[background], opacity: UINT8_MAX, blendMode: 0 }
      : {
          id: nextId(t),
          name: "Flattened",
          kind: "image",
          parentId: t.layers[roots[0]].parentId ?? null,
          blendMode: 0,
          visible: true,
          locked: false,
          opacity: UINT8_MAX,
          flags: 3,
        };
  const keep = t.layers.map((_, i) => i).filter((i) => !selected.has(i));
  const at = keep.filter((i) => i < Math.min(...roots)).length;
  const layers = keep.map((i) => t.layers[i]);
  layers.splice(at, 0, layer);
  return {
    ...t,
    layers,
    frames: t.frames.map((f, i) => {
      const cels = keep.map((j) => f.cels[j]);
      cels.splice(at, 0, shrink(renderTimelineFrame(plan, width, height, i, undefined, false)));
      return { ...f, cels };
    }),
    activeLayer: at,
    range: undefined,
  };
}
/** Image/background conversion eligibility follows LibreSprite's GPLv2
 * cmd_background_from_layer.cpp and cmd_layer_from_background.cpp. */
export function canConvertBackground(
  t: SpriteTimeline | undefined,
  toBackground: boolean,
): boolean {
  if (!t) return false;
  const index = t.activeLayer,
    layer = t.layers[index];
  if (
    !layer ||
    (layer.kind ?? layer.source?.type ?? "image") !== "image" ||
    !effectiveLayerVisible(t, index) ||
    !layerEditable(t, index)
  )
    return false;
  return toBackground ? !t.layers.some(isBackgroundLayer) : isBackgroundLayer(layer);
}
export function convertBackground(
  t: SpriteTimeline,
  width: number,
  height: number,
  color: Rgba,
  toBackground: boolean,
  backgroundIndex?: number,
): SpriteTimeline {
  if (!canConvertBackground(t, toBackground)) return t;
  const index = t.activeLayer,
    l = t.layers[index];
  if (!toBackground)
    return {
      ...t,
      layers: t.layers.map((v, i) =>
        i === index
          ? { ...v, name: v.name === "Background" ? "Layer 0" : v.name, flags: v.flags & ~12 }
          : v,
      ),
    };
  if (t.layers.some((v, i) => i !== index && isBackgroundLayer(v))) return t;
  const order = [index, ...t.layers.map((_, i) => i).filter((i) => i !== index)],
    depth = t.colorDepth ?? 32,
    activePalette = paletteForColors(t.frames[t.activeFrame].palette),
    fill =
      depth === 8 || depth === 16
        ? asepriteBackgroundSample(depth, color, activePalette, backgroundIndex)
        : undefined,
    rawCache = new Map<AsepriteImageSamples, Map<string, AsepriteImageSamples>>(),
    projectAsepriteSamples = asepriteProjectionCache();
  const frames = t.frames.map((f) => {
    const c = f.cels[index];
    let asepriteSamples: AsepriteImageSamples | undefined, p: PixelBuffer;
    if (depth === 8) {
      const source =
          c?.asepriteSamples ??
          (c
            ? encodeAsepriteSamples(
                c.pixels,
                8,
                paletteForColors(f.palette),
                t.transparentIndex ?? 0,
              )
            : undefined),
        key = [c?.x ?? 0, c?.y ?? 0, width, height, fill![0]].join(",");
      let cached = source && rawCache.get(source)?.get(key);
      if (!cached) {
        const data = new Uint8Array(width * height);
        data.fill(fill![0]);
        if (c && source)
          for (let y = Math.max(0, c.y); y < Math.min(height, c.y + source.height); y++)
            for (let x = Math.max(0, c.x); x < Math.min(width, c.x + source.width); x++) {
              const value = source.data[(y - c.y) * source.width + x - c.x];
              if (value !== (t.transparentIndex ?? 0)) data[y * width + x] = value;
            }
        cached = { depth: 8, width, height, data };
        if (source) {
          let keys = rawCache.get(source);
          if (!keys) {
            keys = new Map();
            rawCache.set(source, keys);
          }
          keys.set(key, cached);
        }
      }
      asepriteSamples = cached;
      p = projectAsepriteSamples(asepriteSamples, f.palette, -1);
    } else {
      p = { width, height, data: new Uint8ClampedArray(width * height * 4) };
      const bg: Rgba =
        depth === 16
          ? [fill![0], fill![0], fill![0], UINT8_MAX]
          : [color[0], color[1], color[2], UINT8_MAX];
      for (let at = 0; at < p.data.length; at += 4) p.data.set(bg, at);
      let mode = l.blendMode ?? 0;
      if (depth === 16) {
        if (mode >= 12 && mode <= 15) mode = 0;
        else if (mode === 16) mode = 11;
      }
      if (c)
        for (let y = Math.max(0, c.y); y < Math.min(height, c.y + c.pixels.height); y++)
          for (let x = Math.max(0, c.x); x < Math.min(width, c.x + c.pixels.width); x++)
            blendImageAt(
              p.data,
              (y * width + x) * 4,
              c.pixels.data,
              ((y - c.y) * c.pixels.width + x - c.x) * 4,
              c.opacity,
              mode,
            );
      if (depth === 16) {
        const data = new Uint8Array(width * height * 2);
        for (let i = 0; i < width * height; i++) {
          data[i * 2] = p.data[i * 4];
          data[i * 2 + 1] = p.data[i * 4 + 3];
        }
        const key = [
          c?.x ?? 0,
          c?.y ?? 0,
          width,
          height,
          fill![0],
          c?.opacity ?? UINT8_MAX,
          mode,
        ].join(",");
        let cached = c?.asepriteSamples && rawCache.get(c.asepriteSamples)?.get(key);
        if (!cached) {
          cached = { depth: 16, width, height, data };
          if (c?.asepriteSamples) {
            let keys = rawCache.get(c.asepriteSamples);
            if (!keys) {
              keys = new Map();
              rawCache.set(c.asepriteSamples, keys);
            }
            keys.set(key, cached);
          }
        }
        asepriteSamples = cached;
        p = projectAsepriteSamples(asepriteSamples, f.palette, -1);
      }
    }
    return {
      ...f,
      cels: order.map((i) =>
        i === index
          ? { pixels: p, asepriteSamples, x: 0, y: 0, opacity: UINT8_MAX, zIndex: 0 }
          : f.cels[i],
      ),
    };
  });
  return {
    ...t,
    activeLayer: 0,
    layers: order.map((i) =>
      i === index
        ? {
            ...l,
            name: "Background",
            parentId: null,
            flags: l.flags | 12,
            opacity: UINT8_MAX,
            blendMode: 0,
          }
        : t.layers[i],
    ),
    frames,
    range: undefined,
  };
}

/** Wrap selected sibling subtrees in a new group. */
export function groupLayers(t: SpriteTimeline, name = "Group"): SpriteTimeline {
  const selected = t.range?.kind === "layers" ? [...t.range.layers] : [];
  const roots = selected.filter(
    (i) => !layerAncestors(t, i).some((p) => selected.some((j) => t.layers[j].id === p.id)),
  );
  if (
    !roots.length ||
    roots.some((i) => isBackgroundLayer(t.layers[i])) ||
    roots.some((i) => (t.layers[i].parentId ?? null) !== (t.layers[roots[0]].parentId ?? null))
  )
    return insertLayer(t, name, "group");
  if (t.layers.length >= MAX_TIMELINE_LAYERS) return t;
  const tree = [...new Set(roots.flatMap((i) => layerSubtree(t, i)))].sort((a, b) => a - b),
    id = nextId(t),
    parentId = t.layers[roots[0]].parentId ?? null;
  const keep = t.layers.map((_, i) => i).filter((i) => !tree.includes(i)),
    at = keep.filter((i) => i < Math.min(...tree)).length;
  const order = [...keep];
  order.splice(at, 0, -1, ...tree);
  const group: TimelineLayer = {
    id,
    name,
    kind: "group",
    parentId,
    blendMode: 0,
    opacity: UINT8_MAX,
    visible: true,
    locked: false,
    flags: 3,
  };
  return {
    ...t,
    layers: order.map((i) =>
      i === -1 ? group : roots.includes(i) ? { ...t.layers[i], parentId: id } : t.layers[i],
    ),
    frames: t.frames.map((f) => ({ ...f, cels: order.map((i) => (i === -1 ? null : f.cels[i])) })),
    activeLayer: at,
    range: undefined,
  };
}
/** Validate the canonical parent-first DFS table required by ASE childLevel encoding. */
export function assertLayerHierarchy(t: SpriteTimeline): void {
  const ids = new Set<string>();
  let open: string[] = [];
  for (let i = 0; i < t.layers.length; i++) {
    const l = t.layers[i];
    if (ids.has(l.id)) throw new RangeError("Duplicate layer identity");
    ids.add(l.id);
    if (l.parentId) {
      const depth = open.indexOf(l.parentId);
      if (depth < 0) throw new RangeError("Invalid layer hierarchy");
      open = open.slice(0, depth + 1);
    } else open = [];
    if (l.kind === "group") {
      if (t.frames.some((f) => f.cels[i]))
        throw new RangeError("Group layers cannot contain image cels");
      open.push(l.id);
    }
  }
}
/** Scale an image to fit inside a rectangle and center it on the integer midpoint. */
function containCenteredBounds(image: PixelBuffer, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const fittedWidth = image.width * scale,
    fittedHeight = image.height * scale;
  return {
    x: Math.trunc(width / 2) - fittedWidth / 2,
    y: Math.trunc(height / 2) - fittedHeight / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}
export function insertReferenceLayer(
  t: SpriteTimeline,
  image: PixelBuffer,
  width: number,
  height: number,
  name = "Reference Layer",
): SpriteTimeline {
  const next = insertLayer(t, name, "image", image);
  if (next === t) return t;
  const bounds = containCenteredBounds(image, width, height);
  return {
    ...next,
    frames: next.frames.map((f, i) =>
      i === next.activeFrame
        ? {
            ...f,
            cels: f.cels.map((c, l) =>
              c && l === next.activeLayer
                ? { ...c, preciseBounds: bounds, x: Math.floor(bounds.x), y: Math.floor(bounds.y) }
                : c,
            ),
          }
        : f,
    ),
  };
}

/** Place the copied selection in a new layer at the mask origin. */
export function insertSelectionLayer(
  t: SpriteTimeline,
  pixels: PixelBuffer,
  origin: { x: number; y: number },
  asepriteSamples?: TimelineCel["asepriteSamples"],
  name = defaultLayerName(t.layers),
): SpriteTimeline {
  const next = insertLayer(t, name);
  if (next === t) return t;
  const at = next.activeLayer,
    cel: TimelineCel = {
      pixels,
      asepriteSamples,
      x: origin.x,
      y: origin.y,
      opacity: UINT8_MAX,
      zIndex: 0,
    };
  return {
    ...next,
    frames: next.frames.map((frame, index) =>
      index === next.activeFrame
        ? { ...frame, cels: frame.cels.map((current, layer) => (layer === at ? cel : current)) }
        : frame,
    ),
    range: undefined,
  };
}

/** Insert one merged raster cel on each selected frame. */
export function insertSelectionLayerRange(
  t: SpriteTimeline,
  frameCels: ReadonlyMap<number, TimelineCel>,
  name = defaultLayerName(t.layers),
): SpriteTimeline {
  const next = insertLayer(t, name);
  if (next === t) return t;
  const at = next.activeLayer;
  return {
    ...next,
    frames: next.frames.map((frame, index) => {
      const cel = frameCels.get(index);
      if (!cel) return frame;
      const cels = [...frame.cels];
      cels[at] = cel;
      return { ...frame, cels };
    }),
    range: undefined,
  };
}

/** Copy-on-write Cut Mask across selected cels. Shared cel images/maps remain
 * linked, while history retains the original immutable timeline graph. */
export function clearTimelineRangeSelection(
  t: SpriteTimeline,
  mask: PixelMask,
  frames: readonly number[],
  layers: readonly number[],
  clearColor: (layer: number, frame: number) => Rgba,
): SpriteTimeline {
  const pixelCopies = new Map<PixelBuffer, PixelBuffer>(),
    changedPixels = new Set<PixelBuffer>();
  const tileCopies = new Map<
      NonNullable<TimelineCel["tilemap"]>,
      NonNullable<TimelineCel["tilemap"]>
    >(),
    changedTiles = new Set<NonNullable<TimelineCel["tilemap"]>>();
  const editable = (index: number) => {
    const layer = t.layers[index];
    return (
      !!layer &&
      layer.kind !== "group" &&
      !(layer.flags & 64) &&
      !layer.locked &&
      layerAncestors(t, index).every((parent) => !parent.locked)
    );
  };
  const hit = (x: number, y: number) =>
    x >= mask.x &&
    y >= mask.y &&
    x < mask.x + mask.width &&
    y < mask.y + mask.height &&
    !!mask.data[(y - mask.y) * mask.width + x - mask.x];
  for (const frame of frames)
    for (const layer of layers) {
      if (!editable(layer) || !t.frames[frame]) continue;
      const cel = t.frames[frame].cels[layer];
      if (!cel) continue;
      if (cel.tilemap) {
        const set = t.tilesets?.find((item) => item.id === t.layers[layer].tilesetId);
        if (!set) continue;
        const original = cel.tilemap;
        let copy = tileCopies.get(original);
        if (!copy) {
          copy = { ...original, tiles: original.tiles.slice() };
          tileCopies.set(original, copy);
        }
        let changed = false;
        for (let ty = 0; ty < original.height; ty++)
          for (let tx = 0; tx < original.width; tx++) {
            const index = ty * original.width + tx;
            if (!copy.tiles[index]) continue;
            const left = cel.x + tx * set.tileWidth,
              top = cel.y + ty * set.tileHeight,
              right = left + set.tileWidth,
              bottom = top + set.tileHeight;
            let selected = false;
            for (
              let y = Math.max(top, mask.y);
              y < Math.min(bottom, mask.y + mask.height) && !selected;
              y++
            )
              for (let x = Math.max(left, mask.x); x < Math.min(right, mask.x + mask.width); x++)
                if (hit(x, y)) {
                  selected = true;
                  break;
                }
            if (selected) {
              copy.tiles[index] = 0;
              changed = true;
            }
          }
        if (changed) changedTiles.add(original);
        continue;
      }
      const original = cel.pixels;
      let copy = pixelCopies.get(original);
      if (!copy) {
        copy = { ...original, data: original.data.slice() };
        pixelCopies.set(original, copy);
      }
      const color = clearColor(layer, frame),
        left = Math.max(0, mask.x - cel.x),
        top = Math.max(0, mask.y - cel.y),
        right = Math.min(copy.width, mask.x + mask.width - cel.x),
        bottom = Math.min(copy.height, mask.y + mask.height - cel.y);
      let changed = false;
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++)
          if (hit(cel.x + x, cel.y + y)) {
            const at = (y * copy.width + x) * 4;
            if (
              copy.data[at] !== color[0] ||
              copy.data[at + 1] !== color[1] ||
              copy.data[at + 2] !== color[2] ||
              copy.data[at + 3] !== color[3]
            ) {
              copy.data.set(color, at);
              changed = true;
            }
          }
      if (changed) changedPixels.add(original);
    }
  if (!changedPixels.size && !changedTiles.size) return t;
  return {
    ...t,
    frames: t.frames.map((frame) => {
      let changed = false;
      const cels = frame.cels.map((cel) => {
        if (!cel) return cel;
        const pixels = changedPixels.has(cel.pixels) ? pixelCopies.get(cel.pixels) : undefined,
          tilemap =
            cel.tilemap && changedTiles.has(cel.tilemap) ? tileCopies.get(cel.tilemap) : undefined;
        if (!pixels && !tilemap) return cel;
        changed = true;
        return { ...cel, ...(pixels ? { pixels } : {}), ...(tilemap ? { tilemap } : {}) };
      });
      return changed ? { ...frame, cels } : frame;
    }),
  };
}
