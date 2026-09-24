import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT16_VALUE_COUNT, UINT8_MAX } from "$/base/numeric-constants";
import type { Brush, PixelMask, Point, Rgba } from "$/base/primitives";
import { generateSymmetryStrokes } from "$/canvas/assistance/symmetry";
import { brushMask } from "$/canvas/raster";
import { PixelPerfectPath, PixelPerfectTracePolicy } from "$/canvas/raster/pixel-perfect";
import { encodeAsepriteSamples, paletteForColors } from "$/color/samples";
import { asepriteBestFit, asepriteRgbMap, type AsepriteImageSamples } from "$/color/samples";
import type { AsepriteIndexWriter } from "$/color/types";
import type { EditorDocument } from "$/document/types";
import type { ToolSettings } from "$/drawing/tool-settings";
import {
  tilesetForLayer,
  refreshTilemapProjections,
  rasterizeTilemapSamples,
} from "$/tilemap/model";
import type { SpriteTimeline } from "$/timeline/timeline";

const MAX_TILE_STROKE_LENGTH = UINT16_VALUE_COUNT;

export interface TilemapBrushContext {
  width: number;
  height: number;
  selection?: PixelMask | null;
}

export function tilemapCellAt(t: SpriteTimeline, p: Point): Point {
  const s = tilesetForLayer(t, t.activeLayer),
    c = t.frames[t.activeFrame].cels[t.activeLayer];
  return {
    x: Math.floor((p.x - (c?.x ?? t.gridBounds?.x ?? 0)) / s.tileWidth),
    y: Math.floor((p.y - (c?.y ?? t.gridBounds?.y ?? 0)) / s.tileHeight),
  };
}
export function tilemapTileAt(t: SpriteTimeline, p: Point): number {
  const m = t.frames[t.activeFrame].cels[t.activeLayer]?.tilemap;
  return m && p.x >= 0 && p.y >= 0 && p.x < m.width && p.y < m.height
    ? m.tiles[p.y * m.width + p.x]
    : 0;
}
/** One immutable grid update and one render per pointer event, including linked cels. */
export function applyTilemapPoints(
  t: SpriteTimeline,
  points: readonly Point[],
  tile: number,
): SpriteTimeline {
  const fi = t.activeFrame,
    li = t.activeLayer,
    s = tilesetForLayer(t, li),
    old = t.frames[fi].cels[li],
    m = old?.tilemap;
  if ((tile & 0x1fffffff) >= s.tileCount)
    throw new RangeError("Select an existing tile, or draw pixels to create one.");
  const changed = points.filter((p) => tilemapTileAt(t, p) !== tile >>> 0);
  if (!changed.length) return t;
  let left = 0,
    top = 0,
    right = m?.width ?? 0,
    bottom = m?.height ?? 0;
  for (const p of changed) {
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x + 1);
    bottom = Math.max(bottom, p.y + 1);
  }
  const width = right - left,
    height = bottom - top;
  if (
    !Number.isSafeInteger(width * height) ||
    width * s.tileWidth > MAX_IMAGE_DIMENSION ||
    height * s.tileHeight > MAX_IMAGE_DIMENSION ||
    width * height * s.tileWidth * s.tileHeight > MAX_IMAGE_PIXELS
  )
    throw new RangeError("Tilemap exceeds the editor image limit");
  const tiles = new Uint32Array(width * height);
  if (m)
    for (let y = 0; y < m.height; y++)
      tiles.set(m.tiles.subarray(y * m.width, (y + 1) * m.width), (y - top) * width - left);
  for (const p of changed) tiles[(p.y - top) * width + p.x - left] = tile >>> 0;
  const map = { width, height, tiles },
    x = (old?.x ?? t.gridBounds?.x ?? 0) + left * s.tileWidth,
    y = (old?.y ?? t.gridBounds?.y ?? 0) + top * s.tileHeight;
  return refreshTilemapProjections({
    ...t,
    frames: t.frames.map((f, i) => ({
      ...f,
      cels: f.cels.map((c, l) =>
        i === fi && l === li
          ? {
              ...old,
              x,
              y,
              opacity: old?.opacity ?? UINT8_MAX,
              zIndex: old?.zIndex ?? 0,
              tilemap: map,
              pixels: old?.pixels ?? { width: 1, height: 1, data: new Uint8ClampedArray(4) },
            }
          : m && c?.tilemap === m
            ? { ...c, tilemap: map, x: c.x + left * s.tileWidth, y: c.y + top * s.tileHeight }
            : c,
      ),
    })),
  });
}

/** Pixel Perfect snapshots need the source palette index as well as its RGBA
 * projection. Manual tilemap previews replace that projection after each draw,
 * so keep an indexed view of the active cel and refresh it from the shared
 * tileset after each preview commit. */
export class AsepriteTilemapIndexWriter implements AsepriteIndexWriter {
  private samples: AsepriteImageSamples = {
    depth: 8,
    width: 1,
    height: 1,
    data: new Uint8Array(1),
  };
  private baseline = new Uint8Array(1);
  private pendingResolved = new Map<number, number>();
  constructor(
    private readonly doc: EditorDocument,
    private readonly preferredIndex?: number,
    private readonly fit: "octree" | "bestfit" = "octree",
  ) {
    this.refresh();
  }
  refresh(timeline: SpriteTimeline | undefined = this.doc.timeline) {
    const t = timeline;
    if (!t || t.colorDepth !== 8) return;
    const frame = t.activeFrame,
      layer = t.activeLayer,
      cel = t.frames[frame].cels[layer],
      mask = t.transparentIndex ?? 0;
    this.pendingResolved.clear();
    if (!cel?.tilemap) {
      this.samples = { depth: 8, width: 1, height: 1, data: Uint8Array.of(mask) };
      this.baseline = this.samples.data.slice();
      return;
    }
    const set = tilesetForLayer(t, layer),
      palette = paletteForColors(t.frames[frame].palette ?? this.doc.palette);
    this.samples = set.asepritePixels
      ? rasterizeTilemapSamples(cel.tilemap, set, 8, mask)
      : encodeAsepriteSamples(cel.pixels, 8, palette, mask);
    this.baseline = this.samples.data.slice();
  }
  hasChanges(): boolean {
    return (
      this.samples.data.length !== this.baseline.length ||
      this.samples.data.some((value, index) => value !== this.baseline[index])
    );
  }
  private mapColor(
    color: Rgba,
    fit: "octree" | "bestfit",
    palette: ReturnType<typeof paletteForColors>,
    mask: number,
  ) {
    return fit === "bestfit"
      ? asepriteBestFit(color[0], color[1], color[2], color[3], palette, mask)
      : asepriteRgbMap(color[0], color[1], color[2], color[3], palette, mask);
  }
  resolve(x: number, y: number, color: Rgba): Rgba {
    const t = this.doc.timeline!,
      frame = t.frames[t.activeFrame],
      colors = frame.palette ?? this.doc.palette ?? [],
      palette = paletteForColors(colors),
      mask = t.transparentIndex ?? 0;
    const preferredColor =
      this.preferredIndex !== undefined &&
      this.preferredIndex >= 0 &&
      this.preferredIndex < colors.length
        ? this.preferredIndex === mask
          ? ([0, 0, 0, 0] as Rgba)
          : colors[this.preferredIndex]
        : undefined;
    const matchesPreferred =
      preferredColor &&
      this.preferredIndex! <= UINT8_MAX &&
      color.every((value, index) => value === preferredColor[index]);
    const index = matchesPreferred
      ? this.preferredIndex!
      : this.mapColor(color, this.fit, palette, mask);
    this.pendingResolved.set(y * this.doc.layer.pixels.width + x, index);
    return index === mask ? [0, 0, 0, 0] : (colors[index] ?? color);
  }
  read(x: number, y: number): number | undefined {
    const t = this.doc.timeline,
      cel = t?.frames[t.activeFrame]?.cels[t.activeLayer];
    if (!cel?.tilemap) return this.doc.timeline?.transparentIndex ?? 0;
    const sx = x + this.doc.layer.x - cel.x,
      sy = y + this.doc.layer.y - cel.y;
    return sx >= 0 && sy >= 0 && sx < this.samples.width && sy < this.samples.height
      ? this.samples.data[sy * this.samples.width + sx]
      : (t?.transparentIndex ?? 0);
  }
  write(x: number, y: number, color: Rgba, explicitIndex?: number): boolean {
    const t = this.doc.timeline,
      cel = t?.frames[t.activeFrame]?.cels[t.activeLayer];
    if (!t || !cel?.tilemap) return false;
    const sx = x + this.doc.layer.x - cel.x,
      sy = y + this.doc.layer.y - cel.y;
    if (sx < 0 || sy < 0 || sx >= this.samples.width || sy >= this.samples.height) return false;
    const key = y * this.doc.layer.pixels.width + x,
      preferred = this.preferredIndex;
    const paletteColors = t.frames[t.activeFrame].palette ?? this.doc.palette ?? [],
      palette = paletteForColors(paletteColors),
      mask = t.transparentIndex ?? 0;
    const requestedIndex = explicitIndex ?? preferred;
    if (
      requestedIndex !== undefined &&
      (!Number.isInteger(requestedIndex) ||
        requestedIndex < 0 ||
        requestedIndex >= paletteColors.length)
    )
      return false;
    const fitIndex = (paletteIndex: number) =>
      paletteIndex <= UINT8_MAX
        ? paletteIndex
        : this.mapColor(paletteColors[paletteIndex], this.fit, palette, mask);
    const index =
      explicitIndex !== undefined
        ? fitIndex(explicitIndex)
        : (this.pendingResolved.get(key) ??
          (preferred !== undefined
            ? fitIndex(preferred)
            : this.mapColor(color, this.fit, palette, mask)));
    this.pendingResolved.delete(key);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= Math.min(UINT8_MAX + 1, paletteColors.length)
    )
      return false;
    if (explicitIndex === undefined && preferred !== undefined && preferred <= UINT8_MAX) {
      const expected = index === mask ? ([0, 0, 0, 0] as Rgba) : paletteColors[index];
      if (!expected || !color.every((value, channel) => value === expected[channel])) return false;
    }
    const at = sy * this.samples.width + sx;
    if (this.samples.data[at] === index) return false;
    this.samples.data[at] = index;
    return true;
  }
  samplesForLayer(): AsepriteImageSamples {
    const layer = this.doc.layer,
      cel =
        this.doc.timeline?.frames[this.doc.timeline.activeFrame]?.cels[
          this.doc.timeline.activeLayer
        ],
      mask = this.doc.timeline?.transparentIndex ?? 0;
    const data = new Uint8Array(layer.pixels.width * layer.pixels.height);
    data.fill(mask);
    if (cel?.tilemap) {
      const dx = cel.x - layer.x,
        dy = cel.y - layer.y,
        sx0 = Math.max(0, -dx),
        sy0 = Math.max(0, -dy),
        sx1 = Math.min(this.samples.width, layer.pixels.width - dx),
        sy1 = Math.min(this.samples.height, layer.pixels.height - dy);
      if (sx1 > sx0 && sy1 > sy0)
        for (let sy = sy0; sy < sy1; sy++) {
          const from = sy * this.samples.width + sx0,
            to = (sy + dy) * layer.pixels.width + sx0 + dx;
          data.set(this.samples.data.subarray(from, from + sx1 - sx0), to);
        }
    }
    return { depth: 8, width: layer.pixels.width, height: layer.pixels.height, data };
  }
}

interface SavedTilePoint {
  origin: Point;
  tile: number;
}
export interface TilePixelPerfectOptions {
  enabled: boolean;
  mode: number;
  x: number;
  y: number;
  brush: Brush;
  brushAngleStatic?: boolean;
}
/** Pixel Perfect's path runs in canvas pixels, while TilePointShape writes one
 * grid-aligned tile for each point. Keep the path and the point-shape state
 * separate so removing an L corner restores the tile value from before its
 * final stamp, including its flip flags. */
export class TilemapPixelPerfectStroke {
  private path = new PixelPerfectPath();
  private savedPoint: Point | null = null;
  private capturePoint: Point | null = null;
  private savedTiles: SavedTilePoint[] = [];
  private lastTileOrigin: Point | null = null;

  paint(
    context: TilemapBrushContext,
    t: SpriteTimeline,
    points: readonly Point[],
    tile: number,
    options: TilePixelPerfectOptions,
  ): SpriteTimeline {
    let next = t;
    const operations = this.path.join(points, PixelPerfectTracePolicy.Accumulate, {
      brush: options.brush,
      brushAngleStatic: options.brushAngleStatic,
    });
    const mask = brushMask(options.brush);
    for (const operation of operations) {
      if (operation.kind === "save") {
        this.savedPoint = { ...operation.point };
        this.capturePoint = { ...operation.point };
        this.savedTiles = [];
        continue;
      }
      if (operation.kind === "restore") {
        if (this.savedPoint && samePoint(this.savedPoint, operation.point)) {
          for (const saved of this.savedTiles) {
            const cell = tilemapCellAt(next, saved.origin);
            next = applyTilemapPoints(next, [cell], saved.tile);
          }
        }
        this.capturePoint = null;
        continue;
      }
      const symmetric = generateSymmetryStrokes(
        [operation.point],
        {
          enabled: options.enabled,
          mode: options.mode,
          x: options.x,
          y: options.y,
        },
        { width: mask.width, height: mask.height, center: { x: -mask.x, y: -mask.y } },
      ).flat();
      for (const stamp of symmetric) {
        const cell = tilemapCellAt(next, stamp),
          set = tilesetForLayer(next, next.activeLayer),
          cel = next.frames[next.activeFrame].cels[next.activeLayer];
        const origin = {
          x: (cel?.x ?? next.gridBounds?.x ?? 0) + cell.x * set.tileWidth,
          y: (cel?.y ?? next.gridBounds?.y ?? 0) + cell.y * set.tileHeight,
        };
        const allowed = tilemapBrushPoints(context, next, cell, cell, "pencil");
        if (this.capturePoint && samePoint(this.capturePoint, operation.point) && allowed.length) {
          this.savedTiles.push({ origin, tile: tilemapTileAt(next, cell) });
        }
        if (!samePoint(this.lastTileOrigin, origin) && allowed.length)
          next = applyTilemapPoints(next, allowed, tile);
        this.lastTileOrigin = origin;
      }
      this.capturePoint = null;
    }
    return next;
  }
}
const samePoint = (a: Point | null, b: Point) => !!a && a.x === b.x && a.y === b.y;
export function tilemapBrushPoints(
  context: TilemapBrushContext,
  t: SpriteTimeline,
  a: Point,
  b: Point,
  tool: ToolSettings["tool"],
): Point[] {
  const s = tilesetForLayer(t, t.activeLayer),
    c = t.frames[t.activeFrame].cels[t.activeLayer],
    ox = c?.x ?? t.gridBounds?.x ?? 0,
    oy = c?.y ?? t.gridBounds?.y ?? 0;
  const minX = Math.floor(-ox / s.tileWidth),
    minY = Math.floor(-oy / s.tileHeight),
    maxX = Math.ceil((context.width - ox) / s.tileWidth) - 1,
    maxY = Math.ceil((context.height - oy) / s.tileHeight) - 1;
  const points: Point[] = [],
    seen = new Set<string>();
  const add = (x: number, y: number) => {
    if (x < minX || y < minY || x > maxX || y > maxY) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    const mask = context.selection;
    if (mask) {
      let found = false;
      for (
        let py = Math.max(mask.y, oy + y * s.tileHeight);
        py < Math.min(mask.y + mask.height, oy + (y + 1) * s.tileHeight) && !found;
        py++
      )
        for (
          let px = Math.max(mask.x, ox + x * s.tileWidth);
          px < Math.min(mask.x + mask.width, ox + (x + 1) * s.tileWidth);
          px++
        )
          if (mask.data[(py - mask.y) * mask.width + px - mask.x]) {
            found = true;
            break;
          }
      if (!found) return;
    }
    seen.add(key);
    points.push({ x, y });
  };
  if (tool === "bucket") {
    if (a.x < minX || a.y < minY || a.x > maxX || a.y > maxY) return points;
    const target = tilemapTileAt(t, a),
      queue = [a],
      visited = new Set<string>();
    for (let at = 0; at < queue.length; at++) {
      const p = queue[at],
        k = `${p.x},${p.y}`;
      if (
        visited.has(k) ||
        p.x < minX ||
        p.y < minY ||
        p.x > maxX ||
        p.y > maxY ||
        tilemapTileAt(t, p) !== target
      )
        continue;
      visited.add(k);
      add(p.x, p.y);
      queue.push(
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 },
      );
    }
  } else if (["rectangle", "filled_rectangle", "ellipse", "filled_ellipse"].includes(tool)) {
    const x0 = Math.min(a.x, b.x),
      x1 = Math.max(a.x, b.x),
      y0 = Math.min(a.y, b.y),
      y1 = Math.max(a.y, b.y),
      rx = (x1 - x0 + 1) / 2,
      ry = (y1 - y0 + 1) / 2,
      cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    for (let y = Math.max(minY, y0); y <= Math.min(maxY, y1); y++)
      for (let x = Math.max(minX, x0); x <= Math.min(maxX, x1); x++) {
        if (
          tool === "filled_rectangle" ||
          (tool === "rectangle" && (x === x0 || x === x1 || y === y0 || y === y1)) ||
          (tool === "filled_ellipse" && inside(x, y)) ||
          (tool === "ellipse" &&
            inside(x, y) &&
            (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)))
        )
          add(x, y);
      }
  } else {
    let x = a.x,
      y = a.y;
    const dx = Math.abs(b.x - x),
      dy = -Math.abs(b.y - y),
      sx = x < b.x ? 1 : -1,
      sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    if (dx - dy > MAX_TILE_STROKE_LENGTH) throw new RangeError("Tile stroke is too large");
    while (true) {
      add(x, y);
      if (x === b.x && y === b.y) break;
      const e = err * 2;
      if (e >= dy) {
        err += dy;
        x += sx;
      }
      if (e <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  return points;
}
