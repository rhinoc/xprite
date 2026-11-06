import { UINT8_MAX, UINT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Point, RasterResult, Rect, Rgba } from "$/base/primitives";
import {
  floodFill,
  paintLine,
  paintRectangle,
  paintStroke,
  pixelWriter,
  type RasterOptions,
} from "$/canvas";
import {
  activateTimelineCel,
  cloneStoredPixelBuffer,
  ensureTimeline,
  syncTimeline,
  type EditorDocument,
} from "$/document";
import { PaintInk, ellipsePixels } from "$/drawing";
import {
  BATCH_EDIT_LIMITS,
  BatchEditError,
  BatchEditErrorCode,
  BatchEditKind,
  type BatchEditOperation,
  type BatchEditResult,
} from "$/editor/batch-edit-types";
import { AsepriteTagDirection, type AsepriteTag } from "$/import-export/aseprite/model";
import {
  adjustTimelineTags,
  assertSupportedAnimationTags,
  insertLayer,
  isBackgroundLayer,
  layerEditable,
  effectiveLayerVisible,
  linkTimelineCels,
  LAYER_CONTINUOUS,
  LAYER_VISIBLE,
  MAX_TIMELINE_FRAMES,
  MAX_TIMELINE_LAYERS,
  moveLayerTree,
  timelineTags,
  unlinkTimelineCels,
  withTimelineTags,
  type SpriteTimeline,
  type TimelineCel,
} from "$/timeline";

const HEX_COLOR = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const HEX_RADIX = 16;
const HEX_CHANNEL_LENGTH = 2;

function batchInteger(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `${name} must be an integer between ${min} and ${max}`,
    );
  return value;
}

export function batchName(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > BATCH_EDIT_LIMITS.nameLength)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `${name} must be a non-empty string of at most ${BATCH_EDIT_LIMITS.nameLength} characters`,
    );
  return value;
}

function batchRect(rect: Rect, width: number, height: number): Rect {
  if (!rect || typeof rect !== "object")
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "A rectangle is required");
  const x = batchInteger(rect.x, "rect.x", 0, width - 1);
  const y = batchInteger(rect.y, "rect.y", 0, height - 1);
  const w = batchInteger(rect.width, "rect.width", 1, width - x);
  const h = batchInteger(rect.height, "rect.height", 1, height - y);
  if (w * h > BATCH_EDIT_LIMITS.pixels)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Region exceeds the pixel limit");
  return { x, y, width: w, height: h };
}

function point(value: Point, doc: EditorDocument): Point {
  if (!value || typeof value !== "object")
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "A point is required");
  return {
    x: batchInteger(value.x, "x", 0, doc.width - 1),
    y: batchInteger(value.y, "y", 0, doc.height - 1),
  };
}

function color(value: Rgba | string): Rgba {
  if (typeof value === "string" && HEX_COLOR.test(value)) {
    const channels = [1, 3, 5].map((at) =>
      Number.parseInt(value.slice(at, at + HEX_CHANNEL_LENGTH), HEX_RADIX),
    );
    return [
      channels[0],
      channels[1],
      channels[2],
      value.length === 9 ? Number.parseInt(value.slice(7), HEX_RADIX) : UINT8_MAX,
    ];
  }
  if (!Array.isArray(value) || value.length !== BATCH_EDIT_LIMITS.rgbaChannels)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      "Color must be #RRGGBB, #RRGGBBAA or four RGBA bytes",
    );
  for (const channel of value) batchInteger(channel, "color channel", 0, UINT8_MAX);
  return value as unknown as Rgba;
}

function batchLayerIndex(timeline: SpriteTimeline, id: string): number {
  batchName(id, "layerId");
  const index = timeline.layers.findIndex((layer) => layer.id === id);
  if (index < 0)
    throw new BatchEditError(BatchEditErrorCode.NotFound, `Layer ${id} does not exist`);
  return index;
}

const TAG_DIRECTIONS: readonly AsepriteTagDirection[] = [
  AsepriteTagDirection.Forward,
  AsepriteTagDirection.Reverse,
  AsepriteTagDirection.PingPong,
  AsepriteTagDirection.PingPongReverse,
];

function batchDirection(value: unknown): AsepriteTagDirection {
  if (!TAG_DIRECTIONS.includes(value as AsepriteTagDirection))
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `direction must be one of ${TAG_DIRECTIONS.join(", ")}`,
    );
  return value as AsepriteTagDirection;
}

/** Tag colours are [r,g,b] or [r,g,b,a] byte channels; alpha defaults to opaque. */
function tagColor(value: unknown): [number, number, number, number] {
  if (typeof value === "string") return [...color(value)] as [number, number, number, number];
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4))
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      "color must be [r,g,b] or [r,g,b,a] bytes",
    );
  const channels = value.map((channel) => batchInteger(channel, "color channel", 0, UINT8_MAX));
  return [channels[0], channels[1], channels[2], channels[3] ?? UINT8_MAX];
}

/** Build an AsepriteTag from an addTag op, with core defaults. */
function batchTag(
  op: Extract<BatchEditOperation, { type: BatchEditKind.AddTag }>,
  timeline: SpriteTimeline,
): AsepriteTag {
  const tag: AsepriteTag = {
    name: batchName(op.name, "name"),
    from: batchInteger(op.from, "from", 0, timeline.frames.length - 1),
    to: batchInteger(op.to, "to", 0, timeline.frames.length - 1),
    direction:
      op.direction !== undefined ? batchDirection(op.direction) : AsepriteTagDirection.Forward,
    repeat: op.repeat !== undefined ? batchInteger(op.repeat, "repeat", 0, UINT16_MAX) : 0,
    color: op.color !== undefined ? tagColor(op.color) : [0, 0, 0, 0],
  };
  if (tag.name.length > 256 || tag.from > tag.to)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid tag name or frame range");
  return tag;
}

function copyFrameCel(cel: TimelineCel | null, continuous: boolean): TimelineCel | null {
  if (!cel) return null;
  return {
    ...cel,
    pixels: continuous ? cel.pixels : cloneStoredPixelBuffer(cel.pixels),
    ...(cel.tilemap && !continuous
      ? { tilemap: { ...cel.tilemap, tiles: cel.tilemap.tiles.slice() } }
      : {}),
    ...(cel.asepriteSamples && !continuous
      ? { asepriteSamples: { ...cel.asepriteSamples, data: cel.asepriteSamples.data.slice() } }
      : {}),
  };
}

/** Replacement buffers keep original and linked-cel pixels intact until history commits. */
export function applyDocumentBatch(
  doc: EditorDocument,
  operations: readonly BatchEditOperation[],
): BatchEditResult {
  if (
    !Array.isArray(operations) ||
    !operations.length ||
    operations.length > BATCH_EDIT_LIMITS.operations
  )
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `Provide 1–${BATCH_EDIT_LIMITS.operations} operations`,
    );
  if ((doc.timeline?.colorDepth ?? 32) !== 32)
    throw new BatchEditError(
      BatchEditErrorCode.Unsupported,
      "Batch editing currently requires an RGBA document",
    );
  syncTimeline(doc);
  const original = ensureTimeline(doc);
  const activeLayerId = original.layers[original.activeLayer].id;
  let activeFrame = original.activeFrame;
  let timeline = original;
  const result: BatchEditResult = {
    changedRegions: [],
    createdLayerIds: [],
    createdFrameIndices: [],
  };
  const working = new Map<PixelBuffer, PixelBuffer>();
  let allocatedPixels = 0;

  for (const op of operations) {
    if (!op || typeof op !== "object")
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid operation");
    switch (op.type) {
      case BatchEditKind.AddLayer: {
        batchName(op.layerId, "layerId");
        batchName(op.name, "name");
        if (timeline.layers.some((layer) => layer.id === op.layerId))
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Layer ID already exists");
        if (timeline.layers.length >= MAX_TIMELINE_LAYERS)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Layer limit reached");
        const after =
          op.afterLayerId === undefined
            ? timeline.activeLayer
            : batchLayerIndex(timeline, op.afterLayerId);
        timeline = insertLayer({ ...timeline, activeLayer: after }, op.name);
        timeline = {
          ...timeline,
          layers: timeline.layers.map((layer, i) =>
            i === timeline.activeLayer ? { ...layer, id: op.layerId } : layer,
          ),
        };
        result.createdLayerIds.push(op.layerId);
        break;
      }
      case BatchEditKind.RenameLayer:
      case BatchEditKind.SetLayerVisibility: {
        const index = batchLayerIndex(timeline, op.layerId);
        if (op.type === BatchEditKind.RenameLayer) batchName(op.name, "name");
        else if (typeof op.visible !== "boolean")
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "visible must be a boolean");
        timeline = {
          ...timeline,
          layers: timeline.layers.map((layer, i) =>
            i !== index
              ? layer
              : op.type === BatchEditKind.RenameLayer
                ? { ...layer, name: op.name }
                : {
                    ...layer,
                    visible: op.visible,
                    flags: (layer.flags & ~LAYER_VISIBLE) | (op.visible ? LAYER_VISIBLE : 0),
                  },
          ),
        };
        break;
      }
      case BatchEditKind.MoveLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        const target = batchLayerIndex(timeline, op.targetLayerId);
        const moved = moveLayerTree(timeline, index, target);
        if (moved === timeline && index !== target)
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "Layer cannot move to this position",
          );
        timeline = moved;
        break;
      }
      case BatchEditKind.AddFrame: {
        const after = batchInteger(
          op.afterFrameIndex,
          "afterFrameIndex",
          0,
          timeline.frames.length - 1,
        );
        if (op.duplicate !== undefined && typeof op.duplicate !== "boolean")
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "duplicate must be a boolean");
        if (timeline.frames.length >= MAX_TIMELINE_FRAMES)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Frame limit reached");
        const from = timeline.frames[after];
        const duration = batchInteger(op.duration ?? from.duration, "duration", 1, UINT16_MAX);
        if (op.duplicate !== false) {
          allocatedPixels += from.cels.reduce(
            (count, cel, index) =>
              count +
              (cel && !(timeline.layers[index].flags & LAYER_CONTINUOUS)
                ? cel.pixels.width * cel.pixels.height
                : 0),
            0,
          );
          if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              "Batch exceeds the pixel allocation limit",
            );
        }
        const frames = [...timeline.frames];
        const at = after + 1;
        frames.splice(at, 0, {
          duration,
          palette: from.palette,
          cels: from.cels.map((cel, i) =>
            op.duplicate === false
              ? null
              : copyFrameCel(cel, !!(timeline.layers[i].flags & LAYER_CONTINUOUS)),
          ),
        });
        timeline = adjustTimelineTags({ ...timeline, frames }, at, 1);
        if (at <= activeFrame) activeFrame++;
        for (let i = 0; i < result.createdFrameIndices.length; i++)
          if (result.createdFrameIndices[i] >= at) result.createdFrameIndices[i]++;
        for (const region of result.changedRegions)
          if (region.frameIndex >= at) region.frameIndex++;
        result.createdFrameIndices.push(at);
        break;
      }
      case BatchEditKind.SetFrameDuration: {
        const index = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const duration = batchInteger(op.duration, "duration", 1, UINT16_MAX);
        timeline = {
          ...timeline,
          frames: timeline.frames.map((frame, i) => (i === index ? { ...frame, duration } : frame)),
        };
        break;
      }
      case BatchEditKind.AddTag:
      case BatchEditKind.UpdateTag:
      case BatchEditKind.RemoveTag: {
        const tags = [...timelineTags(timeline)];
        const applyTag = (index: number, tag: AsepriteTag | null) => {
          if (tag) {
            assertSupportedAnimationTags(
              [...tags.filter((_, at) => at !== index), tag],
              timeline.frames.length,
            );
            if (index < tags.length) tags.splice(index, 1);
            tags.push(tag);
            tags.sort((a, b) => a.from - b.from || b.to - a.to);
          } else {
            tags.splice(index, 1);
          }
          timeline = withTimelineTags(timeline, tags);
        };
        if (op.type === BatchEditKind.AddTag) {
          const tag = batchTag(op, timeline);
          // Append at the insertion index setAnimationTag would use.
          applyTag(tags.length, tag);
        } else {
          const index = batchInteger(op.tagIndex, "tagIndex", 0, tags.length - 1);
          if (op.type === BatchEditKind.RemoveTag) {
            applyTag(index, null);
          } else {
            const current = tags[index];
            const merged: AsepriteTag = {
              name: op.name !== undefined ? batchName(op.name, "name") : current.name,
              from:
                op.from !== undefined
                  ? batchInteger(op.from, "from", 0, timeline.frames.length - 1)
                  : current.from,
              to:
                op.to !== undefined
                  ? batchInteger(op.to, "to", 0, timeline.frames.length - 1)
                  : current.to,
              direction: op.direction ?? current.direction,
              repeat:
                op.repeat !== undefined
                  ? batchInteger(op.repeat, "repeat", 0, UINT16_MAX)
                  : current.repeat,
              color: op.color !== undefined ? tagColor(op.color) : current.color,
              ...(current.userData !== undefined ? { userData: current.userData } : {}),
            };
            batchDirection(merged.direction);
            if (merged.name.length > 256 || merged.from > merged.to)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Invalid tag name or frame range",
              );
            applyTag(index, merged);
          }
        }
        break;
      }
      case BatchEditKind.LinkCels:
      case BatchEditKind.UnlinkCels: {
        const index = batchLayerIndex(timeline, op.layerId);
        if (
          !Array.isArray(op.frameIndices) ||
          !op.frameIndices.length ||
          op.frameIndices.length > timeline.frames.length
        )
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "frameIndices must be a non-empty list of frame indices",
          );
        const frameSet = new Set<number>();
        for (const fi of op.frameIndices)
          frameSet.add(batchInteger(fi, "frameIndices", 0, timeline.frames.length - 1));
        if (op.type === BatchEditKind.LinkCels && frameSet.size < 2)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "linkCels needs at least two distinct frames",
          );
        const range = {
          kind: "cels" as const,
          frames: [...frameSet].sort((a, b) => a - b),
          layers: [index],
        };
        const next =
          op.type === BatchEditKind.LinkCels
            ? linkTimelineCels(timeline, range)
            : unlinkTimelineCels(timeline, range);
        timeline = next;
        break;
      }
      default: {
        if (!Object.values(BatchEditKind).includes(op.type))
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unknown operation type");
        const index = batchLayerIndex(timeline, op.layerId);
        const frameIndex = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const layer = timeline.layers[index];
        if (!layerEditable(timeline, index) || !effectiveLayerVisible(timeline, index))
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "Target layer is locked or hidden",
          );
        if (layer.kind && layer.kind !== "image")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "Pixels can only be written to image layers",
          );
        const cel = timeline.frames[frameIndex].cels[index];
        // Keep cel offsets and linked images; expand to include the sprite without dropping off-canvas pixels.
        const linked = cel
          ? timeline.frames.flatMap((frame) =>
              frame.cels.filter(
                (value): value is TimelineCel => !!value && value.pixels === cel.pixels,
              ),
            )
          : [];
        const left = Math.min(0, ...linked.map((value) => -value.x));
        const top = Math.min(0, ...linked.map((value) => -value.y));
        const right = Math.max(
          cel?.pixels.width ?? 0,
          doc.width,
          ...linked.map((value) => doc.width - value.x),
        );
        const bottom = Math.max(
          cel?.pixels.height ?? 0,
          doc.height,
          ...linked.map((value) => doc.height - value.y),
        );
        const x = (cel?.x ?? 0) + left,
          y = (cel?.y ?? 0) + top;
        const width = right - left,
          height = bottom - top;
        const previousTimeline = timeline;
        let image = cel ? working.get(cel.pixels) : undefined;
        const allocated = !image;
        if (!image) {
          allocatedPixels += width * height;
          if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              "Batch exceeds the pixel allocation limit",
            );
          image = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * BATCH_EDIT_LIMITS.rgbaChannels),
          };
          if (cel) {
            const source = cel.pixels.data;
            for (let row = 0; row < cel.pixels.height; row++)
              image.data.set(
                source.subarray(
                  row * cel.pixels.width * BATCH_EDIT_LIMITS.rgbaChannels,
                  (row + 1) * cel.pixels.width * BATCH_EDIT_LIMITS.rgbaChannels,
                ),
                ((row + cel.y - y) * width + cel.x - x) * BATCH_EDIT_LIMITS.rgbaChannels,
              );
          }
          if (cel) working.set(cel.pixels, image);
          working.set(image, image);
          const dx = x - (cel?.x ?? 0),
            dy = y - (cel?.y ?? 0);
          timeline = {
            ...timeline,
            frames: timeline.frames.map((frame, fi) => ({
              ...frame,
              cels: frame.cels.map((value, li) =>
                (cel && value?.pixels === cel.pixels) || (fi === frameIndex && li === index)
                  ? {
                      ...value,
                      pixels: image!,
                      x: (value?.x ?? 0) + dx,
                      y: (value?.y ?? 0) + dy,
                      opacity: value?.opacity ?? UINT8_MAX,
                      zIndex: value?.zIndex ?? 0,
                      asepriteSamples: undefined,
                    }
                  : value,
              ),
            })),
          };
        }
        const currentCel = timeline.frames[frameIndex].cels[index]!;
        const local = (p: Point) => ({ x: p.x - currentCel.x, y: p.y - currentCel.y });
        const options: RasterOptions = {
          color:
            op.type === BatchEditKind.Pixels || op.type === BatchEditKind.Grid
              ? [0, 0, 0, 0]
              : color(op.color),
          brush: {
            shape: "circle",
            size:
              op.type === BatchEditKind.Pixels || op.type === BatchEditKind.Grid
                ? 1
                : batchInteger(op.size ?? 1, "size", 1, BATCH_EDIT_LIMITS.brushSize),
            angle: 0,
          },
          ink: PaintInk.CopyColor,
          clip: { x: -currentCel.x, y: -currentCel.y, width: doc.width, height: doc.height },
          selection: doc.selection
            ? {
                ...doc.selection,
                x: doc.selection.x - currentCel.x,
                y: doc.selection.y - currentCel.y,
              }
            : undefined,
        };
        if (
          isBackgroundLayer(layer) &&
          options.color[3] !== UINT8_MAX &&
          op.type !== BatchEditKind.Pixels &&
          op.type !== BatchEditKind.Grid
        )
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "Background pixels must be opaque",
          );
        const writer = pixelWriter(image, options);
        const write = (px: number, py: number, rgba = options.color) => writer.write(px, py, rgba);
        let raster: RasterResult | undefined;
        switch (op.type) {
          case BatchEditKind.Stroke:
            if (
              !Array.isArray(op.points) ||
              !op.points.length ||
              op.points.length > BATCH_EDIT_LIMITS.points
            )
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Invalid stroke point count",
              );
            raster = paintStroke(
              image,
              op.points.map((p: Point) => local(point(p, doc))),
              options,
            );
            break;
          case BatchEditKind.Line:
            raster = paintLine(
              image,
              local(point(op.start, doc)),
              local(point(op.end, doc)),
              options,
            );
            break;
          case BatchEditKind.Fill:
            raster = floodFill(image, local(point(op.point, doc)), {
              ...options,
              tolerance: 0,
              contiguous: true,
            });
            break;
          case BatchEditKind.Pixels: {
            const rect = batchRect(op.rect, doc.width, doc.height);
            if (
              !Array.isArray(op.rgba) ||
              op.rgba.length !== rect.width * rect.height * BATCH_EDIT_LIMITS.rgbaChannels
            )
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "RGBA length must match the region",
              );
            for (const channel of op.rgba) batchInteger(channel, "RGBA byte", 0, UINT8_MAX);
            for (let py = 0; py < rect.height; py++)
              for (let px = 0; px < rect.width; px++) {
                const at = (py * rect.width + px) * BATCH_EDIT_LIMITS.rgbaChannels;
                const rgba: Rgba = [op.rgba[at], op.rgba[at + 1], op.rgba[at + 2], op.rgba[at + 3]];
                if (isBackgroundLayer(layer) && rgba[3] !== UINT8_MAX)
                  throw new BatchEditError(
                    BatchEditErrorCode.NotEditable,
                    "Background pixels must be opaque",
                  );
                const p = local({ x: rect.x + px, y: rect.y + py });
                write(p.x, p.y, rgba);
              }
            break;
          }
          case BatchEditKind.Grid: {
            const rect = batchRect(op.rect, doc.width, doc.height);
            if (!op.legend || typeof op.legend !== "object" || Array.isArray(op.legend))
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Grid legend must be an object",
              );
            const transparent = op.transparent ?? "erase";
            if (transparent !== "erase" && transparent !== "skip")
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Grid transparent must be erase or skip",
              );
            if (!Array.isArray(op.rows) || op.rows.length !== rect.height)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Grid row count must match rect.height",
              );
            for (const [key, value] of Object.entries(op.legend))
              if (key.length !== 1 || key === ".")
                throw new BatchEditError(
                  BatchEditErrorCode.InvalidInput,
                  "Grid legend keys must be one character other than '.'",
                );
              else color(value as Rgba | string);
            for (let py = 0; py < op.rows.length; py++) {
              const row = op.rows[py];
              if (typeof row !== "string" || row.length !== rect.width)
                throw new BatchEditError(
                  BatchEditErrorCode.InvalidInput,
                  `Grid row ${py} must contain exactly ${rect.width} characters`,
                );
              for (let px = 0; px < rect.width; px++) {
                const key = row[px];
                if (key === ".") {
                  if (transparent === "skip") continue;
                  const p = local({ x: rect.x + px, y: rect.y + py });
                  write(p.x, p.y, [0, 0, 0, 0]);
                  continue;
                }
                const value = op.legend[key];
                if (value === undefined)
                  throw new BatchEditError(
                    BatchEditErrorCode.InvalidInput,
                    `Grid row ${py} uses undefined color '${key}'`,
                  );
                const rgba = color(value);
                if (isBackgroundLayer(layer) && rgba[3] !== UINT8_MAX)
                  throw new BatchEditError(
                    BatchEditErrorCode.NotEditable,
                    "Background pixels must be opaque",
                  );
                const p = local({ x: rect.x + px, y: rect.y + py });
                write(p.x, p.y, rgba);
              }
            }
            break;
          }
          default: {
            const rect = batchRect(op.rect, doc.width, doc.height);
            const a = local(rect),
              b = local({ x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 });
            if (op.type === BatchEditKind.Rectangle) raster = paintRectangle(image, a, b, options);
            else if (op.type === BatchEditKind.FillRect)
              for (let py = a.y; py <= b.y; py++) for (let px = a.x; px <= b.x; px++) write(px, py);
            else
              for (const p of ellipsePixels(a, b, op.type === BatchEditKind.FillEllipse))
                write(p.x, p.y);
          }
        }
        const dirty = (raster ?? writer.result()).dirty;
        if (!dirty && allocated) {
          timeline = previousTimeline;
          allocatedPixels -= width * height;
          if (cel) working.delete(cel.pixels);
          working.delete(image);
        }
        if (dirty)
          timeline.frames.forEach((frame, fi) =>
            frame.cels.forEach((value, li) => {
              if (value?.pixels !== image) return;
              const changedX = Math.max(0, dirty.x + value.x),
                changedY = Math.max(0, dirty.y + value.y);
              const changedRight = Math.min(doc.width, dirty.x + value.x + dirty.width);
              const changedBottom = Math.min(doc.height, dirty.y + value.y + dirty.height);
              if (changedRight > changedX && changedBottom > changedY)
                result.changedRegions.push({
                  layerId: timeline.layers[li].id,
                  frameIndex: fi,
                  rect: {
                    x: changedX,
                    y: changedY,
                    width: changedRight - changedX,
                    height: changedBottom - changedY,
                  },
                });
            }),
          );
      }
    }
  }
  doc.timeline = timeline;
  activateTimelineCel(doc, activeFrame, batchLayerIndex(timeline, activeLayerId));
  return result;
}
