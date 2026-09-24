import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { expandAsepriteSamples, paletteForColors } from "$/color/samples";
import { refreshTilemapProjections } from "$/tilemap/model";
import { validTimelineRange, type TimelineRange } from "$/timeline/operations/timeline-range";
import {
  isBackgroundLayer,
  layerEditable,
  MAX_TIMELINE_FRAMES,
  type SpriteTimeline,
  type TimelineCel,
} from "$/timeline/timeline";

const identity = (cel: TimelineCel) => cel.tilemap ?? cel.asepriteSamples ?? cel.pixels;
const selected = (t: SpriteTimeline, range: TimelineRange) => ({
  frames: [...range.frames].sort((a, b) => a - b),
  layers:
    range.kind === "frames" ? t.layers.map((_, i) => i) : [...range.layers].sort((a, b) => a - b),
});
const editable = (t: SpriteTimeline, li: number) => layerEditable(t, li);
const clone = (cel: TimelineCel): TimelineCel => ({
  ...cel,
  pixels: { ...cel.pixels, data: cel.pixels.data.slice() },
  asepriteSamples: cel.asepriteSamples
    ? { ...cel.asepriteSamples, data: cel.asepriteSamples.data.slice() }
    : undefined,
  tilemap: cel.tilemap ? { ...cel.tilemap, tiles: cel.tilemap.tiles.slice() } : undefined,
  preciseBounds: cel.preciseBounds ? { ...cel.preciseBounds } : undefined,
  source: cel.source ? { ...cel.source, linkedFrame: undefined } : undefined,
});
const projectAsepriteSamples = (
  t: SpriteTimeline,
  cel: TimelineCel,
  fi: number,
  li: number,
): TimelineCel => {
  if (!cel.asepriteSamples || cel.tilemap) return cel;
  const colors = t.frames[fi].palette;
  if (cel.asepriteSamples.depth === 8 && !colors) return cel;
  const palette = paletteForColors(colors);
  return {
    ...cel,
    pixels: {
      width: cel.asepriteSamples.width,
      height: cel.asepriteSamples.height,
      data: expandAsepriteSamples(
        cel.asepriteSamples,
        palette,
        isBackgroundLayer(t.layers[li]) ? -1 : (t.transparentIndex ?? 0),
      ),
    },
  };
};
const linkedCopy = (t: SpriteTimeline, cel: TimelineCel, fi: number, li: number): TimelineCel => {
  return projectAsepriteSamples(
    t,
    { ...cel, source: cel.source ? { ...cel.source, linkedFrame: undefined } : undefined },
    fi,
    li,
  );
};

/** LinkCels: the first populated selected frame in each editable layer is the
 * source. Later selected frames are replaced, including empty destinations. */
export function linkTimelineCels(t: SpriteTimeline, range: TimelineRange): SpriteTimeline {
  if (!validTimelineRange(t, range) || range.frames.length < 2) return t;
  const { frames: fs, layers: ls } = selected(t, range),
    changes = new Map<number, Map<number, TimelineCel>>();
  for (const li of ls) {
    if (!editable(t, li)) continue;
    const first = fs.find((fi) => !!t.frames[fi].cels[li]);
    if (first === undefined) continue;
    const source = t.frames[first].cels[li]!;
    for (const fi of fs) {
      if (fi <= first) continue;
      const old = t.frames[fi].cels[li];
      if (
        old &&
        identity(old) === identity(source) &&
        old.x === source.x &&
        old.y === source.y &&
        old.opacity === source.opacity &&
        old.zIndex === source.zIndex
      )
        continue;
      const row = changes.get(fi) ?? new Map<number, TimelineCel>();
      row.set(li, linkedCopy(t, source, fi, li));
      changes.set(fi, row);
    }
  }
  if (!changes.size) return t;
  const frames = t.frames.map((f, fi) => {
    const row = changes.get(fi);
    if (!row) return f;
    const cels = [...f.cels];
    for (const [li, cel] of row) cels[li] = cel;
    return { ...f, cels };
  });
  return refreshTilemapProjections({ ...t, frames });
}

/** UnlinkCel: each selected member of an existing link group gets its own data. */
export function unlinkTimelineCels(t: SpriteTimeline, range: TimelineRange): SpriteTimeline {
  if (!validTimelineRange(t, range)) return t;
  const { frames: fs, layers: ls } = selected(t, range),
    frames = t.frames.map((f) => ({ ...f, cels: [...f.cels] }));
  let changed = false;
  for (const li of ls) {
    if (!editable(t, li)) continue;
    const counts = new Map<object, number>();
    for (const f of t.frames) {
      const c = f.cels[li];
      if (c) {
        const key = identity(c);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const fi of [...fs].reverse()) {
      const c = frames[fi].cels[li];
      if (!c) continue;
      const key = identity(c);
      if ((counts.get(key) ?? 0) < 2) continue;
      frames[fi].cels[li] = clone(c);
      counts.set(key, counts.get(key)! - 1);
      changed = true;
    }
  }
  return changed ? refreshTilemapProjections({ ...t, frames }) : t;
}

/** NewFrame(content=celcopies|cellinked): repeat selected cels after the
 * selection's frame span, replacing destinations and extending the timeline. */
export function duplicateTimelineCels(
  t: SpriteTimeline,
  range: TimelineRange,
  linked: boolean,
): SpriteTimeline {
  if (!validTimelineRange(t, range)) return t;
  const { frames: fs, layers: ls } = selected(t, range),
    span = fs[fs.length - 1] - fs[0] + 1;
  if (fs[fs.length - 1] + span >= MAX_TIMELINE_FRAMES) return t;
  const writable = ls.filter((li) => editable(t, li));
  if (!writable.length) return t;
  if (!linked) {
    const bytes = fs
      .flatMap((fi) => writable.map((li) => t.frames[fi].cels[li]))
      .reduce((sum, c) => sum + (c?.pixels.data.byteLength ?? 0), 0);
    if (bytes > MAX_IMAGE_PIXELS * 4) return t;
  }
  const frames = t.frames.map((f) => ({ ...f, cels: [...f.cels] }));
  while (frames.length <= fs[fs.length - 1] + span)
    frames.push({
      duration: frames[frames.length - 1].duration,
      palette: frames[frames.length - 1].palette,
      cels: t.layers.map(() => null),
    });
  const copied = new Map<number, Map<object, TimelineCel>>();
  let changed = frames.length !== t.frames.length;
  for (const li of writable)
    for (const fi of [...fs].reverse()) {
      const source = t.frames[fi].cels[li],
        destination = fi + span;
      if (!source) {
        if (frames[destination].cels[li]) {
          frames[destination].cels[li] = null;
          changed = true;
        }
        continue;
      }
      let cel: TimelineCel;
      if (linked) cel = linkedCopy({ ...t, frames }, source, destination, li);
      else {
        const key = identity(source),
          row = copied.get(li) ?? new Map<object, TimelineCel>(),
          prior = row.get(key);
        if (prior) {
          cel = {
            ...source,
            pixels: prior.pixels,
            asepriteSamples: prior.asepriteSamples,
            tilemap: prior.tilemap,
            source: source.source ? { ...source.source, linkedFrame: undefined } : undefined,
          };
        } else {
          cel = clone(source);
          row.set(key, cel);
          copied.set(li, row);
        }
      }
      frames[destination].cels[li] = linked
        ? cel
        : projectAsepriteSamples({ ...t, frames }, cel, destination, li);
      changed = true;
    }
  if (!changed) return t;
  const next = {
    ...t,
    frames,
    activeFrame: fs[0] + span,
    activeLayer: writable[0],
    range: { kind: "cels" as const, frames: fs.map((fi) => fi + span), layers: writable },
  };
  return refreshTilemapProjections(next);
}
