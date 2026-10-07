import { MAX_DOCUMENT_PIXEL_BYTES } from "$/base/image-limits";
import type { Rgba } from "$/base/primitives";
import { cloneClipboardColorProfile } from "$/clipboard/image";
import { cloneClipboardTileset, mergeClipboardTileset } from "$/clipboard/tile";
import type { TimelineClipboard } from "$/clipboard/types";
import { workingColorProfile } from "$/color/icc-profile";
import type { AsepriteImageSamples } from "$/color/samples";
import { cloneStoredPixelBuffer } from "$/document/pixel-storage";
import { refreshTilemapProjections } from "$/tilemap/model";
import { validTimelineRange } from "$/timeline/operations/timeline-range";
import {
  adjustTimelineTags,
  isBackgroundLayer,
  layerAncestors,
  layerEditable,
  MAX_TIMELINE_FRAMES,
  MAX_TIMELINE_LAYERS,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineLayer,
} from "$/timeline/timeline";
export type { TimelineClipboard } from "$/clipboard/types";
function paletteCloner() {
  const palettes = new Map<readonly Rgba[], readonly Rgba[]>();
  return (p: readonly Rgba[] | undefined) => {
    if (!p) return undefined;
    let v = palettes.get(p);
    if (!v) {
      v = p.map((c) => [...c] as Rgba);
      palettes.set(p, v);
    }
    return v;
  };
}
function cloneLayer(layer: TimelineLayer): TimelineLayer {
  const source = layer.source;
  return {
    ...layer,
    ...(source
      ? {
          source: {
            ...source,
            uuid: undefined,
            userData: source.userData
              ? {
                  ...source.userData,
                  color: source.userData.color ? [...source.userData.color] : undefined,
                  properties: source.userData.properties?.slice(),
                }
              : undefined,
          },
        }
      : {}),
  };
}
function cloner() {
  const pixels = new Map<TimelineCel["pixels"], TimelineCel["pixels"]>();
  const tilemaps = new Map<
    NonNullable<TimelineCel["tilemap"]>,
    NonNullable<TimelineCel["tilemap"]>
  >();
  const sampleCopies = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  return (cel: TimelineCel | null): TimelineCel | null => {
    if (!cel) return null;
    let image = pixels.get(cel.pixels);
    if (!image) {
      image = cloneStoredPixelBuffer(cel.pixels);
      pixels.set(cel.pixels, image);
    }
    let asepriteSamples = cel.asepriteSamples;
    if (asepriteSamples) {
      let copy = sampleCopies.get(asepriteSamples);
      if (!copy) {
        copy = { ...asepriteSamples, data: asepriteSamples.data.slice() };
        sampleCopies.set(asepriteSamples, copy);
      }
      asepriteSamples = copy;
    }
    let tilemap = cel.tilemap;
    if (tilemap) {
      let copy = tilemaps.get(tilemap);
      if (!copy) {
        copy = { ...tilemap, tiles: tilemap.tiles.slice() };
        tilemaps.set(tilemap, copy);
      }
      tilemap = copy;
    }
    return {
      ...cel,
      tilemap,
      asepriteSamples,
      source: cel.source
        ? {
            ...cel.source,
            linkedFrame: undefined,
            userData: cel.source.userData
              ? {
                  ...cel.source.userData,
                  color: cel.source.userData.color ? [...cel.source.userData.color] : undefined,
                  properties: cel.source.userData.properties?.slice(),
                }
              : undefined,
          }
        : undefined,
      pixels: image,
      preciseBounds: cel.preciseBounds ? { ...cel.preciseBounds } : undefined,
    };
  };
}
/** Clipboard::DocRange snapshot preserves missing cels, cel geometry, durations,
 * and links within the range, but does not retain mutable source-document data. */
export function copyTimelineSelection(
  t: SpriteTimeline,
  range = t.range,
): TimelineClipboard | null {
  if (!range || !validTimelineRange(t, range)) return null;
  const selected = new Set(range.layers.map((index) => t.layers[index].id));
  const layers =
    range.kind === "frames"
      ? t.layers.map((_, i) => i)
      : t.layers
          .map((_, i) => i)
          .filter(
            (i) =>
              range.layers.includes(i) ||
              (range.kind === "layers" &&
                layerAncestors(t, i).some((parent) => selected.has(parent.id))),
          );
  const frames =
    range.kind === "layers" ? t.frames.map((_, i) => i) : [...range.frames].sort((a, b) => a - b);
  const clone = cloner(),
    clonePalette = paletteCloner();
  return {
    tilesets: t.tilesets
      ?.filter((s) => layers.some((i) => t.layers[i].tilesetId === s.id))
      .map(cloneClipboardTileset),
    kind: range.kind,
    colorDepth: t.colorDepth,
    transparentIndex: t.transparentIndex,
    sourceProfile: cloneClipboardColorProfile(workingColorProfile(t)),
    layers: layers.map((i) => cloneLayer(t.layers[i])),
    frames: frames.map((i) => ({
      duration: t.frames[i].duration,
      palette: clonePalette(t.frames[i].palette),
      cels: layers.map((l) => clone(t.frames[i].cels[l])),
    })),
  };
}
export function cloneTimelineClipboard(data: TimelineClipboard): TimelineClipboard {
  const clone = cloner(),
    clonePalette = paletteCloner();
  return {
    tilesets: data.tilesets?.map(cloneClipboardTileset),
    kind: data.kind,
    colorDepth: data.colorDepth,
    transparentIndex: data.transparentIndex,
    sourceProfile: cloneClipboardColorProfile(data.sourceProfile),
    layers: data.layers.map(cloneLayer),
    frames: data.frames.map((frame) => ({
      duration: frame.duration,
      palette: clonePalette(frame.palette),
      cels: frame.cels.map(clone),
    })),
  };
}
/** Timeline paste inserts frame ranges before the current frame, copies cels
 * starting at the active layer downwards, and appends copied layers at root. */
function pasteTimelineClipboardRaw(t: SpriteTimeline, data: TimelineClipboard): SpriteTimeline {
  if (!data.layers.length || !data.frames.length) return t;
  const images = new Set(t.frames.flatMap((f) => f.cels.flatMap((c) => (c ? [c.pixels] : []))));
  const added = new Set(data.frames.flatMap((f) => f.cels.flatMap((c) => (c ? [c.pixels] : []))));
  if (
    [...images, ...added].reduce((n, p) => n + p.width * p.height * 4, 0) > MAX_DOCUMENT_PIXEL_BYTES
  )
    return t;
  const clone = cloner(),
    clonePalette = paletteCloner();
  if (data.kind === "layers") {
    if (
      t.layers.length + data.layers.length > MAX_TIMELINE_LAYERS ||
      data.frames.length > MAX_TIMELINE_FRAMES
    )
      return t;
    const ids = new Set(t.layers.map((l) => l.id)),
      mapping = new Map<string, string>();
    for (const l of data.layers) {
      let n = 1;
      while (ids.has(`layer-${n}`)) n++;
      const id = `layer-${n}`;
      ids.add(id);
      mapping.set(l.id, id);
    }
    const hasBackground = t.layers.some(isBackgroundLayer);
    const layers = data.layers.map((l) => ({
      ...cloneLayer(l),
      id: mapping.get(l.id)!,
      parentId: l.parentId ? (mapping.get(l.parentId) ?? null) : null,
      flags: hasBackground ? l.flags & ~8 : l.flags,
    }));
    // Background layers are placed at root bottom, all other copied roots at top.
    const background = layers.findIndex(isBackgroundLayer);
    const order = [
      ...t.layers.map((_, i) => ({ old: i, fresh: -1 })),
      ...layers.map((_, i) => ({ old: -1, fresh: i })),
    ];
    if (background >= 0) {
      order.splice(t.layers.length + background, 1);
      order.unshift({ old: -1, fresh: background });
    }
    const frames = Array.from(
      { length: Math.max(t.frames.length, data.frames.length) },
      (_, f) => ({
        duration: t.frames[f]?.duration ?? t.frames[t.frames.length - 1].duration,
        palette: t.frames[f]?.palette ?? t.frames[t.activeFrame].palette,
        cels: order.map((o) =>
          o.old >= 0
            ? (t.frames[f]?.cels[o.old] ?? null)
            : clone(data.frames[f]?.cels[o.fresh] ?? null),
        ),
      }),
    );
    const resultLayers = order.map((o) => (o.old >= 0 ? t.layers[o.old] : layers[o.fresh]));
    const selected = order.flatMap((o, i) => (o.fresh >= 0 ? [i] : []));
    return {
      ...t,
      layers: resultLayers,
      frames,
      activeLayer: selected[selected.length - 1],
      range: { kind: "layers", layers: selected, frames: frames.map((_, i) => i) },
    };
  }
  if (data.kind === "frames") {
    if (t.frames.length + data.frames.length > MAX_TIMELINE_FRAMES) return t;
    const mapped = data.frames.map((frame) => ({
      duration: frame.duration,
      palette: clonePalette(frame.palette),
      cels: t.layers.map((l, i) => {
        const source = data.layers.length - t.layers.length + i;
        return l.kind === "group" || source < 0 || data.layers[source]?.kind === "group"
          ? null
          : clone(frame.cels[source]);
      }),
    }));
    const frames = [...t.frames];
    frames.splice(t.activeFrame, 0, ...mapped);
    let result: SpriteTimeline = { ...t, frames };
    for (let i = 0; i < mapped.length; i++)
      result = adjustTimelineTags(result, t.activeFrame + i, 1);
    return {
      ...result,
      range: {
        kind: "frames",
        frames: mapped.map((_, i) => t.activeFrame + i),
        layers: t.layers.map((_, i) => i),
      },
    };
  }
  if (
    t.activeFrame + data.frames.length > MAX_TIMELINE_FRAMES ||
    t.activeLayer + 1 < data.layers.length
  )
    return t;
  const first = t.activeLayer - data.layers.length + 1;
  const targets = data.layers.map((_, i) => first + i);
  if (targets.some((i) => !layerEditable(t, i) || isBackgroundLayer(t.layers[i]))) return t;
  const frames = t.frames.map((frame) => ({ ...frame, cels: [...frame.cels] }));
  while (frames.length < t.activeFrame + data.frames.length)
    frames.push({
      duration: frames[frames.length - 1].duration,
      palette: frames[frames.length - 1].palette,
      cels: t.layers.map(() => null),
    });
  data.frames.forEach((frame, i) =>
    frame.cels.forEach((cel, l) => {
      frames[t.activeFrame + i].cels[first + l] = clone(cel);
    }),
  );
  return {
    ...t,
    frames,
    range: { kind: "cels", frames: data.frames.map((_, i) => t.activeFrame + i), layers: targets },
  };
}

/** Cross-document ids are local: clone Tilesets for new layers and remap tile
 * contents into existing layer Tilesets for cel/frame ranges. */
export function pasteTimelineClipboard(
  t: SpriteTimeline,
  input: TimelineClipboard,
): SpriteTimeline {
  const hasTiles = input.layers.some((l) => l.kind === "tilemap");
  if (!hasTiles && !t.layers.some((l) => l.kind === "tilemap"))
    return pasteTimelineClipboardRaw(t, input);
  let data = cloneTimelineClipboard(input),
    sets = [...(t.tilesets ?? [])];
  if (data.kind === "layers") {
    const ids = new Map<number, number>();
    for (const set of data.tilesets ?? []) {
      const id = Math.max(-1, ...sets.map((s) => s.id)) + 1;
      ids.set(set.id, id);
      sets.push({ ...set, id });
    }
    data = {
      ...data,
      layers: data.layers.map((l) => {
        if (l.kind !== "tilemap") return l;
        const id = ids.get(l.tilesetId!);
        if (id === undefined) throw new Error("Clipboard Tileset is missing");
        return { ...l, tilesetId: id };
      }),
    };
  } else {
    const offset =
      data.kind === "frames"
        ? t.layers.length - data.layers.length
        : t.activeLayer - data.layers.length + 1;
    for (let li = 0; li < data.layers.length; li++) {
      const target = t.layers[offset + li],
        source = data.layers[li];
      if (!target || target.kind === "group" || source.kind === "group") continue;
      if (target.kind === "tilemap" && source.kind !== "tilemap")
        throw new Error("Convert image layers to Tilemap before pasting cels");
      if (source.kind !== "tilemap") continue;
      if (target.kind !== "tilemap") {
        data = {
          ...data,
          frames: data.frames.map((f) => ({
            ...f,
            cels: f.cels.map((c, i) =>
              i === li && c ? { ...c, tilemap: undefined, source: undefined } : c,
            ),
          })),
        };
        continue;
      }
      const from = data.tilesets?.find((s) => s.id === source.tilesetId),
        to = sets.find((s) => s.id === target.tilesetId);
      if (!from || !to) throw new Error("Clipboard Tileset is missing");
      const merged = mergeClipboardTileset(to, from);
      sets = sets.map((s) => (s.id === to.id ? merged.tileset : s));
      const links = new Map<
        NonNullable<TimelineCel["tilemap"]>,
        NonNullable<TimelineCel["tilemap"]>
      >();
      data = {
        ...data,
        frames: data.frames.map((f) => ({
          ...f,
          cels: f.cels.map((c, i) => {
            if (i !== li || !c?.tilemap) return c;
            let map = links.get(c.tilemap);
            if (!map) {
              map = { ...c.tilemap, tiles: c.tilemap.tiles.map(merged.remap) };
              links.set(c.tilemap, map);
            }
            return { ...c, tilemap: map };
          }),
        })),
      };
    }
  }
  const staging = { ...t, tilesets: sets },
    result = pasteTimelineClipboardRaw(staging, data);
  return result === staging ? t : refreshTilemapProjections(result);
}
