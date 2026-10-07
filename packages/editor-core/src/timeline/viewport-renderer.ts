import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rect } from "$/base/primitives";
import { blendImageAt, mulUn8 } from "$/canvas/blend-modes";
import {
  effectiveLayerVisible,
  LAYER_REFERENCE,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineLayer,
} from "$/timeline/timeline";

/** Logical scene pixels. Presentation GUI/device scaling happens later. */
export interface TimelineViewport extends Rect {
  zoom: number;
}
export interface TimelineViewportOverlay {
  pixels: PixelBuffer;
  x: number;
  y: number;
}
export interface ViewportRenderStats {
  outputBytes: number;
  scratchBytes: number;
  tiles: number;
  maxDepth: number;
}
const f = Math.fround,
  TILE = 32;
interface Sample {
  pixels: PixelBuffer;
  data?: Uint8ClampedArray;
  x: number;
  y: number;
  width: number;
  height: number;
  srcX: number;
  srcY: number;
  dx: number;
  sy: number;
}
interface Node {
  layer: TimelineLayer;
  sample?: Sample;
  overlay?: Sample;
  opacity: number;
  children?: Node[];
}
function project(value: number, zoom: number) {
  const numerator = zoom >= 1 ? zoom : 1,
    denominator = zoom >= 1 ? 1 : 1 / zoom;
  return f(f(f(value) * numerator) / denominator);
}
/** Viewport clipping follows the MIT-licensed render/render.cpp and gfx::ClipF.
 * Clip once at viewport scope: tile boundaries must not reset fractional phase. */
export function viewportCelSample(
  cel: TimelineCel,
  reference: boolean,
  view: TimelineViewport,
): Sample | undefined {
  const p = cel.pixels,
    b =
      reference && cel.preciseBounds
        ? cel.preciseBounds
        : { x: cel.x, y: cel.y, width: p.width, height: p.height };
  const bx = f(b.x),
    by = f(b.y),
    bw = f(b.width),
    bh = f(b.height);
  if (bw <= 0 || bh <= 0) return;
  const px = project(bx, view.zoom),
    py = project(by, view.zoom),
    pw = f(project(f(bx + bw), view.zoom) - px),
    ph = f(project(f(by + bh), view.zoom) - py);
  const ix = Math.max(f(view.x), px),
    iy = Math.max(f(view.y), py),
    right = Math.min(f(view.x + view.width), f(px + pw)),
    bottom = Math.min(f(view.y + view.height), f(py + ph));
  if (right <= ix || bottom <= iy) return;
  let x = f(ix - view.x),
    y = f(iy - view.y),
    srcX = f(ix - px),
    srcY = f(iy - py),
    w = f(right - ix),
    h = f(bottom - iy);
  const sx = (view.zoom * bw) / p.width,
    sy = (view.zoom * bh) / p.height;
  // gfx::ClipF clips source first, destination second, rounding every float op.
  if (srcX < 0) {
    w = f(w + srcX);
    x = f(x - srcX);
    srcX = 0;
  }
  if (srcY < 0) {
    h = f(h + srcY);
    y = f(y - srcY);
    srcY = 0;
  }
  const sw = f(sx * p.width),
    sh = f(sy * p.height);
  if (f(srcX + w) > sw) w = f(w - f(f(srcX + w) - sw));
  if (f(srcY + h) > sh) h = f(h - f(f(srcY + h) - sh));
  if (x < 0) {
    w = f(w + x);
    srcX = f(srcX - x);
    x = 0;
  }
  if (y < 0) {
    h = f(h + y);
    srcY = f(srcY - y);
    y = 0;
  }
  if (f(x + w) > view.width) w = f(w - f(f(x + w) - view.width));
  if (f(y + h) > view.height) h = f(h - f(f(y + h) - view.height));
  if (w <= 0 || h <= 0) return;
  const dx = Math.trunc(x),
    dy = Math.trunc(y);
  return {
    pixels: p,
    x: dx,
    y: dy,
    width: Math.min(view.width - dx, Math.ceil(w)),
    height: Math.min(view.height - dy, Math.ceil(h)),
    srcX: srcX / sx,
    srcY,
    dx: 1 / sx,
    sy,
  };
}
export function hasVisibleReferenceLayers(t: SpriteTimeline | undefined): boolean {
  return (
    !!t && t.layers.some((l, i) => !!(l.flags & LAYER_REFERENCE) && effectiveLayerVisible(t, i))
  );
}
/** Bounded tile compositor retains reference photos at source viewport detail.
 * Only output is viewport-sized; nested groups use one32×32 scratch per depth. */
export function renderTimelineViewport(
  t: SpriteTimeline,
  view: TimelineViewport,
  frameIndex = t.activeFrame,
  overlay?: TimelineViewportOverlay,
  stats?: ViewportRenderStats,
): PixelBuffer {
  if (
    !Number.isInteger(view.width) ||
    !Number.isInteger(view.height) ||
    view.width < 1 ||
    view.height < 1 ||
    view.width * view.height > 16_777_216 ||
    !Number.isFinite(view.zoom) ||
    view.zoom <= 0 ||
    ![view.x, view.y].every(Number.isFinite)
  )
    throw new RangeError("Invalid render viewport");
  const frame = t.frames[frameIndex];
  if (!frame) throw new RangeError("Invalid frame");
  const build = (parent: string | null, ancestors: Set<string>): Node[] =>
    t.layers
      .map((layer, index) => ({ layer, index, cel: frame.cels[index] }))
      .filter((v) =>
        t.composeGroups !== true ? v.layer.kind !== "group" : (v.layer.parentId ?? null) === parent,
      )
      .map((v, i) => ({ ...v, order: t.composeGroups !== true ? v.index : i }))
      .sort(
        (a, b) =>
          a.order + (a.cel?.zIndex ?? 0) - (b.order + (b.cel?.zIndex ?? 0)) ||
          (a.cel?.zIndex ?? 0) - (b.cel?.zIndex ?? 0),
      )
      .flatMap(({ layer, index, cel }): Node[] => {
        if (ancestors.has(layer.id) || !effectiveLayerVisible(t, index)) return [];
        if (layer.kind === "group")
          return [
            {
              layer,
              opacity: layer.opacity,
              children: build(layer.id, new Set([...ancestors, layer.id])),
            },
          ];
        const sample = cel
          ? viewportCelSample(cel, !!(layer.flags & LAYER_REFERENCE), view)
          : undefined;
        const extra =
          index === t.activeLayer && overlay
            ? viewportCelSample({ ...overlay, opacity: UINT8_MAX, zIndex: 0 }, false, view)
            : undefined;
        if (!sample && !extra) return [];
        return [
          {
            layer,
            sample,
            overlay: extra,
            opacity: mulUn8(layer.opacity, cel?.opacity ?? UINT8_MAX),
          },
        ];
      });
  const plan = build(null, new Set()),
    output: PixelBuffer = {
      width: view.width,
      height: view.height,
      data: new Uint8ClampedArray(view.width * view.height * 4),
    },
    pool: Uint8ClampedArray[] = [];
  let maxDepth = 0,
    tiles = 0;
  const buffer = (depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    const b = pool[depth] ?? (pool[depth] = new Uint8ClampedArray(TILE * TILE * 4));
    b.fill(0);
    return b;
  };
  const draw = (
    dst: Uint8ClampedArray,
    s: Sample,
    tx: number,
    ty: number,
    tw: number,
    th: number,
    opacity: number,
    mode: number,
  ) => {
    const x0 = Math.max(tx, s.x),
      y0 = Math.max(ty, s.y),
      x1 = Math.min(tx + tw, s.x + s.width),
      y1 = Math.min(ty + th, s.y + s.height);
    for (let y = y0; y < y1; y++) {
      const sy = Math.trunc((s.srcY + y - s.y) / s.sy);
      if (sy >= s.pixels.height) break;
      if (sy < 0) continue;
      for (let x = x0; x < x1; x++) {
        const sx = Math.trunc(s.srcX + s.dx * (x - s.x));
        if (sx >= s.pixels.width) break;
        if (sx < 0) continue;
        blendImageAt(
          dst,
          ((y - ty) * tw + x - tx) * 4,
          s.data ?? (s.data = s.pixels.data),
          (sy * s.pixels.width + sx) * 4,
          opacity,
          mode,
        );
      }
    }
  };
  const paint = (
    nodes: Node[],
    depth: number,
    tx: number,
    ty: number,
    tw: number,
    th: number,
  ): Uint8ClampedArray => {
    const dst = buffer(depth);
    for (const n of nodes) {
      if (n.children) {
        const child = paint(n.children, depth + 1, tx, ty, tw, th);
        for (let at = 0; at < tw * th * 4; at += 4)
          blendImageAt(dst, at, child, at, n.opacity, n.layer.blendMode ?? 0);
      } else if (n.overlay) {
        const image = buffer(depth + 1);
        if (n.sample) draw(image, n.sample, tx, ty, tw, th, UINT8_MAX, 0);
        draw(image, n.overlay, tx, ty, tw, th, UINT8_MAX, 0);
        for (let at = 0; at < tw * th * 4; at += 4)
          blendImageAt(dst, at, image, at, n.opacity, n.layer.blendMode ?? 0);
      } else if (n.sample) draw(dst, n.sample, tx, ty, tw, th, n.opacity, n.layer.blendMode ?? 0);
    }
    return dst;
  };
  for (let y = 0; y < view.height; y += TILE)
    for (let x = 0; x < view.width; x += TILE) {
      const w = Math.min(TILE, view.width - x),
        h = Math.min(TILE, view.height - y),
        tile = paint(plan, 0, x, y, w, h);
      for (let row = 0; row < h; row++)
        output.data.set(
          tile.subarray(row * w * 4, (row + 1) * w * 4),
          ((y + row) * view.width + x) * 4,
        );
      tiles++;
    }
  if (stats)
    Object.assign(stats, {
      outputBytes: output.data.byteLength,
      scratchBytes: pool.length * TILE * TILE * 4,
      tiles,
      maxDepth,
    });
  return output;
}
