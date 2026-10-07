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
import { AsepriteInk, ellipsePixels } from "$/drawing";
import {
  BATCH_EDIT_LIMITS,
  BatchEditError,
  BatchEditErrorCode,
  BatchEditKind,
  type BatchEditOperation,
  type BatchEditResult,
} from "$/editor/batch-edit-types";
import {
  adjustTimelineTags,
  insertLayer,
  isBackgroundLayer,
  layerEditable,
  effectiveLayerVisible,
  LAYER_CONTINUOUS,
  LAYER_VISIBLE,
  MAX_TIMELINE_FRAMES,
  MAX_TIMELINE_LAYERS,
  moveLayerTree,
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
          color: op.type === BatchEditKind.Pixels ? [0, 0, 0, 0] : color(op.color),
          brush: {
            shape: "circle",
            size:
              op.type === BatchEditKind.Pixels
                ? 1
                : batchInteger(op.size ?? 1, "size", 1, BATCH_EDIT_LIMITS.brushSize),
            angle: 0,
          },
          ink: AsepriteInk.CopyColor,
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
          op.type !== BatchEditKind.Pixels
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
