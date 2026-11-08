import { UINT8_MAX, UINT16_MAX } from "$/base/numeric-constants";
import { PixelResizeMethod } from "$/base/primitives";
import type { PixelBuffer, PixelMask, Point, RasterResult, Rect, Rgba } from "$/base/primitives";
import {
  floodFill,
  paintLine,
  paintRectangle,
  paintStroke,
  pixelWriter,
  BLEND_MODES,
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
import {
  ConvolutionPreset,
  DEFAULT_MEDIAN_SIZE,
  MAX_MEDIAN_SIZE,
  type ColorCurvePoint,
} from "$/image-editing/advanced-filters";
import {
  applyEffectPixels,
  EffectKind,
  HueSaturationMode,
  OUTLINE_MATRICES,
} from "$/image-editing/effects";
import type { EffectSpec } from "$/image-editing/effects";
import {
  canvasBoundsForAnchor,
  resizeDocumentCanvas,
  resizeDocumentSprite,
} from "$/image-editing/size";
import { CanvasAnchor } from "$/image-editing/types";
import { AsepriteTagDirection, type AsepriteTag } from "$/import-export/aseprite/model";
import {
  colorRangeSelection,
  combineSelection,
  ellipseSelection,
  modifySelection,
  rectangleSelection,
} from "$/selection/operations";
import { SelectionMode, SelectionModifier } from "$/selection/types";
import {
  commitTilemapPixels,
  convertLayerToTilemap,
  rasterizeTilemap,
  setTilesAt,
  tilesetForLayer,
  TilesetMode,
  TILE_INDEX_MASK,
} from "$/tilemap";
import {
  adjustTimelineTags,
  assertSupportedAnimationTags,
  duplicateLayers,
  groupLayers,
  insertLayer,
  isBackgroundLayer,
  layerEditable,
  effectiveLayerVisible,
  linkTimelineCels,
  LAYER_CONTINUOUS,
  LAYER_EDITABLE,
  LAYER_VISIBLE,
  MAX_TIMELINE_FRAMES,
  MAX_TIMELINE_LAYERS,
  moveLayerTree,
  removeLayers,
  renderTimelineFrame,
  timelineTags,
  unlinkTimelineCels,
  withTimelineTags,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineLayer,
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

const HUE_SATURATION_MODES: Record<string, HueSaturationMode> = {
  "hsv-mul": HueSaturationMode.HsvMul,
  "hsl-mul": HueSaturationMode.HslMul,
  "hsv-add": HueSaturationMode.HsvAdd,
  "hsl-add": HueSaturationMode.HslAdd,
};

const CONVOLUTION_PRESETS: Record<string, ConvolutionPreset> = {
  identity: ConvolutionPreset.Identity,
  "box-blur": ConvolutionPreset.BoxBlur,
  "gaussian-blur": ConvolutionPreset.GaussianBlur,
  sharpen: ConvolutionPreset.Sharpen,
  "edge-detect": ConvolutionPreset.EdgeDetect,
  emboss: ConvolutionPreset.Emboss,
  "horizontal-edges": ConvolutionPreset.HorizontalEdges,
  "vertical-edges": ConvolutionPreset.VerticalEdges,
};

function batchEffectNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `${name} must be a number between ${min} and ${max}`,
    );
  return value;
}

function batchEffectSpec(
  op: Extract<BatchEditOperation, { type: BatchEditKind.Effect }>,
): EffectSpec {
  const effect = op.effect;
  if (!effect || typeof effect !== "object")
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "effect is required");
  switch (effect.kind) {
    case "brightness-contrast":
      return {
        kind: EffectKind.BrightnessContrast,
        brightness: batchEffectNumber(effect.brightness ?? 0, "brightness", -100, 100),
        contrast: batchEffectNumber(effect.contrast ?? 0, "contrast", -100, 100),
      };
    case "invert":
      return { kind: EffectKind.Invert };
    case "median-blur":
      return {
        kind: EffectKind.MedianBlur,
        width: batchInteger(effect.width ?? DEFAULT_MEDIAN_SIZE, "width", 1, MAX_MEDIAN_SIZE),
        height: batchInteger(effect.height ?? DEFAULT_MEDIAN_SIZE, "height", 1, MAX_MEDIAN_SIZE),
      };
    case "convolution-matrix": {
      const preset = CONVOLUTION_PRESETS[effect.preset];
      if (!preset)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          `preset must be one of ${Object.keys(CONVOLUTION_PRESETS).join(", ")}`,
        );
      return { kind: EffectKind.ConvolutionMatrix, preset };
    }
    case "color-curve": {
      if (!Array.isArray(effect.points) || !effect.points.length)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "points must be a non-empty array of {x, y} curve points",
        );
      const points: ColorCurvePoint[] = effect.points.map((point, index) => {
        if (!point || typeof point !== "object")
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            `points[${index}] must be an {x, y} object`,
          );
        return {
          x: batchInteger(point.x, `points[${index}].x`, 0, UINT8_MAX),
          y: batchInteger(point.y, `points[${index}].y`, 0, UINT8_MAX),
        };
      });
      return { kind: EffectKind.ColorCurve, points };
    }
    case "hue-saturation": {
      const mode =
        effect.mode !== undefined ? HUE_SATURATION_MODES[effect.mode] : HueSaturationMode.HslAdd;
      if (!mode)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          `mode must be one of ${Object.keys(HUE_SATURATION_MODES).join(", ")}`,
        );
      return {
        kind: EffectKind.HueSaturation,
        mode,
        hue: batchEffectNumber(effect.hue ?? 0, "hue", -360, 360),
        saturation: batchEffectNumber(effect.saturation ?? 0, "saturation", -100, 100),
        lightness: batchEffectNumber(effect.lightness ?? 0, "lightness", -100, 100),
        alpha: batchEffectNumber(effect.alpha ?? 0, "alpha", -100, 100),
      };
    }
    default:
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        "effect.kind must be brightness-contrast, invert, median-blur, convolution-matrix, color-curve or hue-saturation",
      );
  }
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

const CHANNELS = BATCH_EDIT_LIMITS.rgbaChannels;

function celAt(timeline: SpriteTimeline, frameIndex: number, layerIndex: number) {
  return timeline.frames[frameIndex].cels[layerIndex] ?? null;
}

/** Write one cel back into the timeline, replacing the entry at frame/layer. */
function setCelAt(
  timeline: SpriteTimeline,
  frameIndex: number,
  layerIndex: number,
  cel: TimelineCel | null,
): SpriteTimeline {
  return {
    ...timeline,
    frames: timeline.frames.map((frame, fi) =>
      fi !== frameIndex
        ? frame
        : { ...frame, cels: frame.cels.map((value, li) => (li === layerIndex ? cel : value)) },
    ),
  };
}

/** Sub-rect copy of `source`; clamps to bounds and returns an empty buffer if fully outside. */
function cropPixels(source: PixelBuffer, rect: Rect): PixelBuffer {
  const x = Math.max(0, rect.x),
    y = Math.max(0, rect.y);
  const right = Math.min(source.width, rect.x + rect.width),
    bottom = Math.min(source.height, rect.y + rect.height);
  const width = Math.max(0, right - x),
    height = Math.max(0, bottom - y);
  const out: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * CHANNELS),
  };
  for (let row = 0; row < height; row++)
    out.data.set(
      source.data.subarray(
        ((row + y) * source.width + x) * CHANNELS,
        ((row + y) * source.width + x + width) * CHANNELS,
      ),
      row * width * CHANNELS,
    );
  return out;
}

/** Selection and canvas footprint expressed in cel-local pixel coordinates;
 * pixels outside the sprite or outside the selection stay 0. */
function celWriteMask(cel: TimelineCel, doc: EditorDocument): PixelMask {
  const { width, height } = cel.pixels,
    data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = cel.x + x,
        py = cel.y + y;
      if (px < 0 || py < 0 || px >= doc.width || py >= doc.height) continue;
      if (doc.selection && !selectionMaskContains(doc.selection, px, py)) continue;
      data[y * width + x] = 1;
    }
  return { x: 0, y: 0, width, height, data };
}

function selectionMaskContains(mask: PixelMask, x: number, y: number): boolean {
  const px = x - mask.x,
    py = y - mask.y;
  return (
    px >= 0 && py >= 0 && px < mask.width && py < mask.height && !!mask.data[py * mask.width + px]
  );
}

/** Alpha > 0 content bounds inside a pixel buffer, null when fully transparent. */
function opaqueBounds(image: PixelBuffer): Rect | null {
  let l = image.width,
    t = image.height,
    r = -1,
    b = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.data[(y * image.width + x) * CHANNELS + 3]) {
        l = Math.min(l, x);
        t = Math.min(t, y);
        r = Math.max(r, x);
        b = Math.max(b, y);
      }
  return r < l ? null : { x: l, y: t, width: r - l + 1, height: b - t + 1 };
}

/** Crop a merged render to its opaque bounds and shift the cel position. */
function shrinkMerged(image: PixelBuffer, x: number, y: number): TimelineCel | null {
  const bounds = opaqueBounds(image);
  if (!bounds) return null;
  const pixels = cropPixels(image, bounds);
  return { pixels, x: x + bounds.x, y: y + bounds.y, opacity: UINT8_MAX, zIndex: 0 };
}

/** Normalized Bayer threshold matrices scaled from the classic 4×4 kernel. */
function bayerMatrix(kind: "bayer2" | "bayer4" | "bayer8"): number[][] {
  const base = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  if (kind === "bayer4") return base;
  if (kind === "bayer2")
    return [
      [0, 2],
      [3, 1],
    ];
  const out = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0));
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const quad = ((y & 4) >> 1) | ((x & 4) >> 2);
      out[y][x] = base[y & 3][x & 3] * 4 + quad;
    }
  return out;
}

const CANVAS_ANCHORS: Record<string, CanvasAnchor> = {
  topLeft: CanvasAnchor.TopLeft,
  top: CanvasAnchor.Top,
  topRight: CanvasAnchor.TopRight,
  left: CanvasAnchor.Left,
  center: CanvasAnchor.Center,
  right: CanvasAnchor.Right,
  bottomLeft: CanvasAnchor.BottomLeft,
  bottom: CanvasAnchor.Bottom,
  bottomRight: CanvasAnchor.BottomRight,
};

/** Reorder frame indices after deleting frames, keeping result entries valid. */
function shiftAfterDelete(value: number, removed: ReadonlySet<number>): number | null {
  let out = value;
  for (const index of removed) {
    if (value === index) return null;
    if (index < value) out--;
  }
  return out;
}

function renumberRegionFrameIndices(result: BatchEditResult, removed: ReadonlySet<number>) {
  result.changedRegions = result.changedRegions.flatMap((region) => {
    const shifted = shiftAfterDelete(region.frameIndex, removed);
    return shifted === null ? [] : [{ ...region, frameIndex: shifted }];
  });
  result.createdFrameIndices = result.createdFrameIndices.flatMap((index) => {
    const shifted = shiftAfterDelete(index, removed);
    return shifted === null ? [] : [shifted];
  });
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
        if (op.durations !== undefined) {
          if (!Array.isArray(op.durations) || op.durations.length !== timeline.frames.length)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              `durations must list exactly ${timeline.frames.length} frame durations`,
            );
          const durations = op.durations.map((value: number) =>
            batchInteger(value, "durations", 1, UINT16_MAX),
          );
          timeline = {
            ...timeline,
            frames: timeline.frames.map((frame, i) => ({ ...frame, duration: durations[i] })),
          };
        } else {
          const index = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
          const duration = batchInteger(op.duration, "duration", 1, UINT16_MAX);
          timeline = {
            ...timeline,
            frames: timeline.frames.map((frame, i) =>
              i === index ? { ...frame, duration } : frame,
            ),
          };
        }
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
      case BatchEditKind.DeleteFrame: {
        const index = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        if (timeline.frames.length <= 1)
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Cannot delete the last frame");
        const frames = timeline.frames.filter((_, fi) => fi !== index);
        timeline = adjustTimelineTags({ ...timeline, frames }, index, -1);
        if (activeFrame > index) activeFrame--;
        else if (activeFrame === index) activeFrame = Math.min(index, frames.length - 1);
        renumberRegionFrameIndices(result, new Set([index]));
        break;
      }
      case BatchEditKind.ReorderFrame: {
        const from = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const to = batchInteger(op.toIndex, "toIndex", 0, timeline.frames.length - 1);
        if (from === to) break;
        const frames = [...timeline.frames];
        const [moved] = frames.splice(from, 1);
        frames.splice(to, 0, moved);
        timeline = { ...timeline, frames };
        const map = (fi: number) =>
          fi === from
            ? to
            : from < to
              ? fi > from && fi <= to
                ? fi - 1
                : fi
              : fi >= to && fi < from
                ? fi + 1
                : fi;
        activeFrame = map(activeFrame);
        result.changedRegions = result.changedRegions.map((region) => ({
          ...region,
          frameIndex: map(region.frameIndex),
        }));
        result.createdFrameIndices = result.createdFrameIndices.map(map);
        break;
      }
      case BatchEditKind.CopyFrame: {
        const source = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        if (!Array.isArray(op.to) || !op.to.length)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "to must list target frames");
        const targets = new Set<number>();
        for (const index of op.to)
          targets.add(batchInteger(index, "to", 0, timeline.frames.length - 1));
        targets.delete(source);
        for (const index of targets)
          if (timeline.frames[index].cels.some((cel) => cel))
            throw new BatchEditError(
              BatchEditErrorCode.Conflict,
              `Frame ${index} already has content`,
            );
        if (!targets.size) break;
        allocatedPixels += timeline.frames[source].cels.reduce(
          (count, cel, index) =>
            count +
            (cel && !(timeline.layers[index].flags & LAYER_CONTINUOUS)
              ? cel.pixels.width * cel.pixels.height * targets.size
              : 0),
          0,
        );
        if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "Batch exceeds the pixel allocation limit",
          );
        timeline = {
          ...timeline,
          frames: timeline.frames.map((frame, fi) =>
            targets.has(fi)
              ? {
                  ...frame,
                  cels: timeline.frames[source].cels.map((cel, li) =>
                    copyFrameCel(cel, !!(timeline.layers[li].flags & LAYER_CONTINUOUS)),
                  ),
                }
              : frame,
          ),
        };
        break;
      }
      case BatchEditKind.DeleteLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        if (timeline.layers.length <= 1)
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Cannot delete the last layer");
        if (isBackgroundLayer(timeline.layers[index]))
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "The background layer cannot be deleted",
          );
        const removed = new Set(
          timeline.layers
            .filter((_, i) => {
              let current: string | null | undefined = timeline.layers[i].id;
              while (current) {
                if (current === op.layerId) return true;
                current = timeline.layers.find((layer) => layer.id === current)?.parentId;
              }
              return false;
            })
            .map((layer) => layer.id),
        );
        timeline = removeLayers(timeline, [index]);
        result.createdLayerIds = result.createdLayerIds.filter((id) => !removed.has(id));
        break;
      }
      case BatchEditKind.SetLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        const layer = timeline.layers[index];
        let next: TimelineLayer = layer;
        if (op.name !== undefined) next = { ...next, name: batchName(op.name, "name") };
        if (op.opacity !== undefined) {
          const opacity = batchInteger(op.opacity, "opacity", 0, UINT8_MAX);
          if (isBackgroundLayer(layer) && opacity !== UINT8_MAX)
            throw new BatchEditError(
              BatchEditErrorCode.NotEditable,
              "Background layer opacity must stay 255",
            );
          next = { ...next, opacity };
        }
        if (op.blendMode !== undefined) {
          if (typeof op.blendMode !== "string" || !BLEND_MODES.includes(op.blendMode as never))
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              `blendMode must be one of ${BLEND_MODES.join(", ")}`,
            );
          const blendMode = BLEND_MODES.indexOf(op.blendMode as (typeof BLEND_MODES)[number]);
          if (isBackgroundLayer(layer) && blendMode !== 0)
            throw new BatchEditError(
              BatchEditErrorCode.NotEditable,
              "Background layer blend mode must be Normal",
            );
          next = { ...next, blendMode };
        }
        if (op.visible !== undefined) {
          if (typeof op.visible !== "boolean")
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "visible must be a boolean");
          next = {
            ...next,
            visible: op.visible,
            flags: (next.flags & ~LAYER_VISIBLE) | (op.visible ? LAYER_VISIBLE : 0),
          };
        }
        if (op.editable !== undefined) {
          if (typeof op.editable !== "boolean")
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "editable must be a boolean");
          next = {
            ...next,
            locked: !op.editable,
            flags: (next.flags & ~LAYER_EDITABLE) | (op.editable ? LAYER_EDITABLE : 0),
          };
        }
        timeline = {
          ...timeline,
          layers: timeline.layers.map((value, i) => (i === index ? next : value)),
        };
        break;
      }
      case BatchEditKind.DuplicateLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        if (op.toDocumentId !== undefined)
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "duplicateLayer only supports the same document",
          );
        const existing = new Set(timeline.layers.map((layer) => layer.id));
        timeline = duplicateLayers(timeline, [index]);
        const created = timeline.layers.filter((layer) => !existing.has(layer.id));
        if (!created.length)
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Layer cannot be duplicated");
        if (op.name !== undefined) {
          const name = batchName(op.name, "name");
          timeline = {
            ...timeline,
            layers: timeline.layers.map((layer) =>
              layer.id === created[0].id ? { ...layer, name } : layer,
            ),
          };
        }
        result.createdLayerIds.push(created[0].id);
        break;
      }
      case BatchEditKind.MergeLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        let target: number;
        if (op.targetLayerId !== undefined) {
          target = batchLayerIndex(timeline, op.targetLayerId);
          if (target === index)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              "Cannot merge a layer into itself",
            );
        } else {
          const siblings = timeline.layers
            .map((layer, i) => ({ layer, i }))
            .filter(
              (entry) =>
                entry.i < index &&
                (entry.layer.parentId ?? null) === (timeline.layers[index].parentId ?? null) &&
                entry.layer.kind !== "group",
            );
          if (!siblings.length)
            throw new BatchEditError(
              BatchEditErrorCode.NotEditable,
              "No layer below to merge into",
            );
          target = siblings[siblings.length - 1].i;
        }
        const targetLayer = timeline.layers[target];
        if (targetLayer.kind === "group" || timeline.layers[index].kind === "group")
          throw new BatchEditError(BatchEditErrorCode.Unsupported, "Group layers cannot merge");
        const bounds = { x: 0, y: 0, right: doc.width, bottom: doc.height };
        for (const li of [index, target])
          for (const frame of timeline.frames) {
            const cel = frame.cels[li];
            if (!cel) continue;
            bounds.x = Math.min(bounds.x, cel.x);
            bounds.y = Math.min(bounds.y, cel.y);
            bounds.right = Math.max(bounds.right, cel.x + cel.pixels.width);
            bounds.bottom = Math.max(bounds.bottom, cel.y + cel.pixels.height);
          }
        const width = bounds.right - bounds.x,
          height = bounds.bottom - bounds.y;
        allocatedPixels += width * height;
        if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "Batch exceeds the pixel allocation limit",
          );
        const plan: SpriteTimeline = {
          ...timeline,
          layers: timeline.layers.map((layer, i) =>
            i === index || i === target
              ? { ...layer, visible: true }
              : { ...layer, visible: false },
          ),
        };
        const removedIds = new Set([timeline.layers[index].id]);
        const merged = timeline.frames.map((_, fi) =>
          shrinkMerged(
            renderTimelineFrame(plan, width, height, fi, undefined, false),
            bounds.x,
            bounds.y,
          ),
        );
        timeline = removeLayers(timeline, [index]);
        const targetAfter = timeline.layers.findIndex((layer) => layer.id === targetLayer.id);
        timeline = {
          ...timeline,
          frames: timeline.frames.map((frame, fi) => ({
            ...frame,
            cels: frame.cels.map((cel, li) => (li === targetAfter ? merged[fi] : cel)),
          })),
        };
        result.createdLayerIds = result.createdLayerIds.filter((id: string) => !removedIds.has(id));
        break;
      }
      case BatchEditKind.GroupLayer: {
        if (!Array.isArray(op.layerIds) || !op.layerIds.length)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "layerIds must be non-empty");
        const indices = op.layerIds.map((id: string) => batchLayerIndex(timeline, id));
        const before = new Set(timeline.layers.map((layer) => layer.id));
        timeline = {
          ...timeline,
          range: { kind: "layers", frames: [], layers: indices },
        };
        timeline = groupLayers(
          timeline,
          op.name !== undefined ? batchName(op.name, "name") : "Group",
        );
        const group = timeline.layers.find(
          (layer) => layer.kind === "group" && !before.has(layer.id),
        );
        if (!group)
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "Layers must share a parent and not include the background layer",
          );
        result.createdLayerIds.push(group.id);
        break;
      }
      case BatchEditKind.UngroupLayer: {
        const index = batchLayerIndex(timeline, op.layerId);
        const group = timeline.layers[index];
        if (group.kind !== "group")
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Layer is not a group");
        const children = timeline.layers
          .map((layer, i) => ({ layer, i }))
          .filter((entry) => entry.layer.parentId === group.id)
          .map((entry) => entry.i);
        timeline = {
          ...timeline,
          layers: timeline.layers.map((layer, i) =>
            children.includes(i) ? { ...layer, parentId: group.parentId ?? null } : layer,
          ),
        };
        timeline = removeLayers(timeline, [index]);
        result.createdLayerIds = result.createdLayerIds.filter((id) => id !== group.id);
        break;
      }
      case BatchEditKind.CopyCel: {
        const index = batchLayerIndex(timeline, op.layerId);
        const frameIndex = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const toFrame = batchInteger(
          op.toFrameIndex,
          "toFrameIndex",
          0,
          timeline.frames.length - 1,
        );
        const cel = celAt(timeline, frameIndex, index);
        if (!cel) throw new BatchEditError(BatchEditErrorCode.NotFound, "Source cel is empty");
        const continuous = !!(timeline.layers[index].flags & LAYER_CONTINUOUS);
        if (!continuous) allocatedPixels += cel.pixels.width * cel.pixels.height;
        if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "Batch exceeds the pixel allocation limit",
          );
        timeline = setCelAt(timeline, toFrame, index, copyFrameCel(cel, continuous));
        break;
      }
      case BatchEditKind.SetCel: {
        const index = batchLayerIndex(timeline, op.layerId);
        const frameIndex = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const cel = celAt(timeline, frameIndex, index);
        if (!cel) throw new BatchEditError(BatchEditErrorCode.NotFound, "Target cel is empty");
        const x =
          op.position !== undefined
            ? batchInteger(op.position.x, "position.x", -65536, 65536)
            : cel.x;
        const y =
          op.position !== undefined
            ? batchInteger(op.position.y, "position.y", -65536, 65536)
            : cel.y;
        const opacity =
          op.opacity !== undefined
            ? batchInteger(op.opacity, "opacity", 0, UINT8_MAX)
            : cel.opacity;
        // Move the whole linked group so shared cels keep their pixel buffer.
        timeline = {
          ...timeline,
          frames: timeline.frames.map((frame, fi) => ({
            ...frame,
            cels: frame.cels.map((value, li) =>
              li === index && value && value.pixels === cel.pixels
                ? { ...value, x, y, opacity: fi === frameIndex ? opacity : value.opacity }
                : value,
            ),
          })),
        };
        break;
      }
      case BatchEditKind.Blit: {
        if (op.src.documentId !== undefined)
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "blit only supports the same document",
          );
        const destLayer = batchLayerIndex(timeline, op.layerId);
        if (!layerEditable(timeline, destLayer) || !effectiveLayerVisible(timeline, destLayer))
          throw new BatchEditError(
            BatchEditErrorCode.NotEditable,
            "Target layer is locked or hidden",
          );
        if (timeline.layers[destLayer].kind && timeline.layers[destLayer].kind !== "image")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "Pixels can only be written to image layers",
          );
        const srcLayer = batchLayerIndex(timeline, op.src.layerId);
        const srcFrame = batchInteger(
          op.src.frameIndex,
          "src.frameIndex",
          0,
          timeline.frames.length - 1,
        );
        const srcCel = celAt(timeline, srcFrame, srcLayer);
        if (!srcCel) throw new BatchEditError(BatchEditErrorCode.NotFound, "Source cel is empty");
        // Intersect the requested canvas rect with the cel's canvas footprint
        // first; the intersection is the source region and also shifts the
        // destination when the rect is clipped on the left/top.
        const clipLeft = Math.max(op.src.rect.x, srcCel.x);
        const clipTop = Math.max(op.src.rect.y, srcCel.y);
        const clipRight = Math.min(
          op.src.rect.x + op.src.rect.width,
          srcCel.x + srcCel.pixels.width,
        );
        const clipBottom = Math.min(
          op.src.rect.y + op.src.rect.height,
          srcCel.y + srcCel.pixels.height,
        );
        if (clipRight <= clipLeft || clipBottom <= clipTop) break;
        const shiftX = clipLeft - op.src.rect.x,
          shiftY = clipTop - op.src.rect.y;
        const region = batchRect(
          {
            x: clipLeft - srcCel.x,
            y: clipTop - srcCel.y,
            width: clipRight - clipLeft,
            height: clipBottom - clipTop,
          },
          srcCel.pixels.width,
          srcCel.pixels.height,
        );
        const patch = cropPixels(srcCel.pixels, region);
        const destFrame = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const dx = batchInteger(op.dest.x, "dest.x", -doc.width, doc.width) + shiftX;
        const dy = batchInteger(op.dest.y, "dest.y", -doc.height, doc.height) + shiftY;
        const clippedX = Math.max(dx, 0),
          clippedY = Math.max(dy, 0);
        const clippedWidth = Math.min(patch.width - (clippedX - dx), doc.width - clippedX);
        const clippedHeight = Math.min(patch.height - (clippedY - dy), doc.height - clippedY);
        if (clippedWidth <= 0 || clippedHeight <= 0) break;
        const destCel = celAt(timeline, destFrame, destLayer);
        const pixels: PixelBuffer = destCel
          ? {
              width: destCel.pixels.width,
              height: destCel.pixels.height,
              data: destCel.pixels.data.slice(),
            }
          : {
              width: doc.width,
              height: doc.height,
              data: new Uint8ClampedArray(doc.width * doc.height * CHANNELS),
            };
        const celX = destCel ? destCel.x : 0,
          celY = destCel ? destCel.y : 0;
        const mask = celWriteMask(
          { pixels: destCel?.pixels ?? pixels, x: celX, y: celY, opacity: UINT8_MAX, zIndex: 0 },
          doc,
        );
        for (let y = 0; y < clippedHeight; y++)
          for (let x = 0; x < clippedWidth; x++) {
            const px = clippedX + x - celX,
              py = clippedY + y - celY;
            if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) continue;
            if (!mask.data[py * mask.width + px]) continue;
            const at = (clippedY - dy + y) * patch.width + (clippedX - dx) + x;
            pixels.data.set(
              patch.data.subarray(at * CHANNELS, (at + 1) * CHANNELS),
              (py * pixels.width + px) * CHANNELS,
            );
          }
        allocatedPixels += pixels.width * pixels.height;
        if (allocatedPixels > BATCH_EDIT_LIMITS.pixels)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "Batch exceeds the pixel allocation limit",
          );
        timeline = setCelAt(timeline, destFrame, destLayer, {
          ...(destCel ?? { opacity: UINT8_MAX, zIndex: 0 }),
          x: celX,
          y: celY,
          pixels,
        });
        result.changedRegions.push({
          layerId: timeline.layers[destLayer].id,
          frameIndex: destFrame,
          rect: { x: clippedX, y: clippedY, width: clippedWidth, height: clippedHeight },
        });
        break;
      }
      case BatchEditKind.ResizeCanvas: {
        const width = batchInteger(op.width, "width", 1, 4096);
        const height = batchInteger(op.height, "height", 1, 4096);
        const anchor = op.anchor ?? "center";
        if (!(anchor in CANVAS_ANCHORS))
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            `anchor must be one of ${Object.keys(CANVAS_ANCHORS).join(", ")}`,
          );
        const bounds = canvasBoundsForAnchor(
          doc.width,
          doc.height,
          width,
          height,
          CANVAS_ANCHORS[anchor],
        );
        doc.timeline = timeline;
        try {
          resizeDocumentCanvas(doc, bounds);
        } catch (error) {
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, (error as Error).message);
        }
        timeline = doc.timeline!;
        break;
      }
      case BatchEditKind.CropToContent: {
        let l = doc.width,
          t = doc.height,
          r = -1,
          b = -1;
        if (op.layerId !== undefined) {
          const index = batchLayerIndex(timeline, op.layerId);
          for (const frame of timeline.frames) {
            const cel = frame.cels[index];
            if (!cel) continue;
            const bounds = opaqueBounds(cel.pixels);
            if (!bounds) continue;
            l = Math.min(l, cel.x + bounds.x);
            t = Math.min(t, cel.y + bounds.y);
            r = Math.max(r, cel.x + bounds.x + bounds.width - 1);
            b = Math.max(b, cel.y + bounds.y + bounds.height - 1);
          }
        } else {
          for (let fi = 0; fi < timeline.frames.length; fi++) {
            const image = renderTimelineFrame(
              timeline,
              doc.width,
              doc.height,
              fi,
              undefined,
              false,
            );
            const bounds = opaqueBounds(image);
            if (!bounds) continue;
            l = Math.min(l, bounds.x);
            t = Math.min(t, bounds.y);
            r = Math.max(r, bounds.x + bounds.width - 1);
            b = Math.max(b, bounds.y + bounds.height - 1);
          }
        }
        if (r < l) throw new BatchEditError(BatchEditErrorCode.NotFound, "No content to crop to");
        doc.timeline = timeline;
        try {
          resizeDocumentCanvas(doc, { x: l, y: t, width: r - l + 1, height: b - t + 1 }, true);
        } catch (error) {
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, (error as Error).message);
        }
        timeline = doc.timeline!;
        break;
      }
      case BatchEditKind.ResizeSprite: {
        const width = batchInteger(op.width, "width", 1, 4096);
        const height = batchInteger(op.height, "height", 1, 4096);
        const method = op.method ?? "nearest";
        if (
          method !== PixelResizeMethod.Nearest &&
          method !== PixelResizeMethod.Bilinear &&
          method !== PixelResizeMethod.RotSprite
        )
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "method must be nearest, bilinear or rotsprite",
          );
        doc.timeline = timeline;
        try {
          resizeDocumentSprite(doc, width, height, method);
        } catch (error) {
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, (error as Error).message);
        }
        timeline = doc.timeline!;
        break;
      }
      case BatchEditKind.Select: {
        const mode = op.mode ?? "replace";
        if (!["replace", "add", "subtract", "intersect"].includes(mode))
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "mode must be replace, add, subtract or intersect",
          );
        let incoming: PixelMask | null = null;
        switch (op.op) {
          case "all":
            incoming = {
              x: 0,
              y: 0,
              width: doc.width,
              height: doc.height,
              data: new Uint8Array(doc.width * doc.height).fill(1),
            };
            break;
          case "none":
            incoming = null;
            break;
          case "rect": {
            if (!op.rect)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "rect selection requires rect",
              );
            const rect = batchRect(op.rect, doc.width, doc.height);
            incoming = rectangleSelection(
              { x: rect.x, y: rect.y },
              { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
              doc.width,
              doc.height,
            );
            break;
          }
          case "ellipse": {
            if (!op.rect)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "ellipse selection requires rect",
              );
            const rect = batchRect(op.rect, doc.width, doc.height);
            incoming = ellipseSelection(
              { x: rect.x, y: rect.y },
              { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
              doc.width,
              doc.height,
            );
            break;
          }
          case "color": {
            if (op.color === undefined)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "color selection requires color",
              );
            const target = color(op.color);
            const composite = renderTimelineFrame(
              timeline,
              doc.width,
              doc.height,
              original.activeFrame,
              undefined,
              false,
            );
            incoming = colorRangeSelection(composite, target);
            break;
          }
          default:
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unknown selection op");
        }
        let selection = combineSelection(
          doc.selection,
          incoming,
          mode as SelectionMode,
          doc.width,
          doc.height,
        );
        if (op.grow !== undefined) {
          const radius = batchInteger(op.grow, "grow", 1, 100);
          selection = modifySelection(
            selection,
            SelectionModifier.Expand,
            radius,
            "circle",
            doc.width,
            doc.height,
          );
        }
        if (op.shrink !== undefined) {
          const radius = batchInteger(op.shrink, "shrink", 1, 100);
          selection = modifySelection(
            selection,
            SelectionModifier.Contract,
            radius,
            "circle",
            doc.width,
            doc.height,
          );
        }
        doc.selection = selection;
        break;
      }
      case BatchEditKind.ConvertToTilemap: {
        const index = batchLayerIndex(timeline, op.layerId);
        const tileWidth = batchInteger(op.tileWidth, "tileWidth", 1, 4096);
        const tileHeight = batchInteger(op.tileHeight, "tileHeight", 1, 4096);
        if (op.name !== undefined) batchName(op.name, "name");
        if (op.tilesetName !== undefined) batchName(op.tilesetName, "tilesetName");
        const layer = timeline.layers[index];
        if (!layerEditable(timeline, index))
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Layer is locked");
        if (layer.kind === "group" || layer.kind === "tilemap")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "Only transparent image layers can become tilemaps",
          );
        try {
          timeline = convertLayerToTilemap(timeline, index, {
            name: op.name,
            tilesetName: op.tilesetName,
            tileWidth,
            tileHeight,
            baseIndex: op.baseIndex,
            matchFlags: op.matchFlags,
          });
        } catch (error) {
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, (error as Error).message);
        }
        break;
      }
      case BatchEditKind.StampTiles: {
        const index = batchLayerIndex(timeline, op.layerId);
        const frameIndex = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const layer = timeline.layers[index];
        if (layer.kind !== "tilemap")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "stampTiles needs a tilemap layer",
          );
        if (!layerEditable(timeline, index))
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Layer is locked");
        if (!Array.isArray(op.cells) || !op.cells.length)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "cells must list placements");
        const set = tilesetForLayer(timeline, index);
        const cells = op.cells.map((cell: { x: number; y: number; tile: number }) => {
          const x = batchInteger(cell.x, "cells[].x", -doc.width, doc.width);
          const y = batchInteger(cell.y, "cells[].y", -doc.height, doc.height);
          const tile = batchInteger(cell.tile, "cells[].tile", 0, TILE_INDEX_MASK);
          if ((tile & TILE_INDEX_MASK) >= set.tileCount)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              `tile ${tile} is outside the tileset (0-${set.tileCount - 1}); grow the set first`,
            );
          return { x, y, tile };
        });
        // Anchor the expansion at the cel's current origin so negative grid
        // coordinates cannot shift the basis for later cells in the same batch.
        const origin = timeline.frames[frameIndex].cels[index];
        timeline = setTilesAt(
          timeline,
          frameIndex,
          index,
          cells,
          origin ? { x: origin.x, y: origin.y } : undefined,
        );
        break;
      }
      case BatchEditKind.PaintTiles: {
        const index = batchLayerIndex(timeline, op.layerId);
        const frameIndex = batchInteger(op.frameIndex, "frameIndex", 0, timeline.frames.length - 1);
        const layer = timeline.layers[index];
        if (layer.kind !== "tilemap")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "paintTiles needs a tilemap layer",
          );
        if (!layerEditable(timeline, index))
          throw new BatchEditError(BatchEditErrorCode.NotEditable, "Layer is locked");
        const old = timeline.frames[frameIndex].cels[index];
        if (!old?.tilemap)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "Cel has no tilemap; stamp or convert first",
          );
        const set = tilesetForLayer(timeline, index);
        const patch = batchRect(op.rect, doc.width * 2, doc.height * 2);
        if (
          !Array.isArray(op.rgba) ||
          op.rgba.length !== patch.width * patch.height * BATCH_EDIT_LIMITS.rgbaChannels
        )
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "RGBA length must match the region",
          );
        for (const channel of op.rgba) batchInteger(channel, "RGBA byte", 0, UINT8_MAX);
        const raster = rasterizeTilemap(old.tilemap, set, 32);
        for (let row = 0; row < patch.height; row++) {
          const y = patch.y - old.y + row;
          if (y < 0 || y >= raster.height) continue;
          for (let column = 0; column < patch.width; column++) {
            const x = patch.x - old.x + column;
            if (x < 0 || x >= raster.width) continue;
            const src = (row * patch.width + column) * BATCH_EDIT_LIMITS.rgbaChannels,
              dst = (y * raster.width + x) * BATCH_EDIT_LIMITS.rgbaChannels;
            raster.data.set(op.rgba.slice(src, src + 4), dst);
          }
        }
        try {
          timeline = commitTilemapPixels(
            timeline,
            frameIndex,
            index,
            raster,
            old.x,
            old.y,
            TilesetMode.Auto,
          );
        } catch (error) {
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, (error as Error).message);
        }
        break;
      }
      case BatchEditKind.TweenCels: {
        const index = batchLayerIndex(timeline, op.layerId);
        const from = batchInteger(op.fromFrame, "fromFrame", 0, timeline.frames.length - 1);
        const to = batchInteger(op.toFrame, "toFrame", 0, timeline.frames.length - 1);
        if (to - from < 2)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "tweenCels needs at least one frame between fromFrame and toFrame",
          );
        const source = celAt(timeline, from, index);
        if (!source) throw new BatchEditError(BatchEditErrorCode.NotFound, "Source cel is empty");
        if (op.property === "scale")
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "tweenCels does not support scale",
          );
        const ease = op.ease ?? "linear";
        if (!["linear", "in", "out", "inOut", "pingpong"].includes(ease))
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "ease must be linear, in, out, inOut or pingpong",
          );
        const t = (step: number) => {
          const u = step / (to - from);
          switch (ease) {
            case "in":
              return u * u;
            case "out":
              return 1 - (1 - u) * (1 - u);
            case "inOut":
              return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
            case "pingpong":
              return 1 - Math.abs(1 - 2 * u);
            default:
              return u;
          }
        };
        const lerp = (a: number, b: number, u: number) => Math.round(a + (b - a) * u);
        const frames = timeline.frames.map((frame, fi) => {
          if (fi <= from || fi >= to) return frame;
          const u = t(fi - from);
          let cel: TimelineCel;
          if (op.property === "position") {
            const a = op.from as Point,
              b = op.to as Point;
            if (!a || typeof a.x !== "number" || !b || typeof b.x !== "number")
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "position tween requires from/to points",
              );
            cel = {
              ...source,
              x: lerp(a.x, b.x, u),
              y: lerp(a.y, b.y, u),
              pixels: source.pixels,
            };
          } else {
            const a = op.from as number,
              b = op.to as number;
            if (typeof a !== "number" || typeof b !== "number")
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "opacity tween requires from/to numbers",
              );
            cel = { ...source, opacity: lerp(a, b, u), pixels: source.pixels };
          }
          const cels = [...frame.cels];
          cels[index] = cel;
          return { ...frame, cels };
        });
        timeline = { ...timeline, frames };
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
            "color" in op && op.color !== undefined
              ? color(op.color)
              : op.type === BatchEditKind.Pixels || op.type === BatchEditKind.Grid
                ? [0, 0, 0, 0]
                : [0, 0, 0, UINT8_MAX],
          brush: {
            shape: "circle",
            size:
              "size" in op && op.size !== undefined
                ? batchInteger(op.size, "size", 1, BATCH_EDIT_LIMITS.brushSize)
                : 1,
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
          op.type !== BatchEditKind.Grid &&
          "color" in op &&
          op.color !== undefined
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
          case BatchEditKind.Clear:
          case BatchEditKind.ClearCel: {
            if (isBackgroundLayer(layer))
              throw new BatchEditError(
                BatchEditErrorCode.NotEditable,
                "Background pixels must be opaque",
              );
            const region =
              op.type === BatchEditKind.Clear && op.rect
                ? batchRect(op.rect, doc.width, doc.height)
                : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++)
                write(px, py, [0, 0, 0, 0]);
            break;
          }
          case BatchEditKind.ReplaceColor: {
            if (op.frameRange !== undefined) {
              const [from, to] = op.frameRange;
              if (from !== frameIndex || to !== frameIndex)
                throw new BatchEditError(
                  BatchEditErrorCode.Unsupported,
                  "replaceColor frameRange across multiple frames is not supported; issue one op per frame",
                );
            }
            const from = color(op.from),
              to = color(op.to);
            if (isBackgroundLayer(layer) && to[3] !== UINT8_MAX)
              throw new BatchEditError(
                BatchEditErrorCode.NotEditable,
                "Background pixels must be opaque",
              );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++) {
                const at = (py * image.width + px) * CHANNELS;
                if (
                  image.data[at] === from[0] &&
                  image.data[at + 1] === from[1] &&
                  image.data[at + 2] === from[2] &&
                  image.data[at + 3] === from[3]
                )
                  write(px, py, to);
              }
            break;
          }
          case BatchEditKind.Outline: {
            const place = op.position ?? "outside";
            if (place !== "outside" && place !== "inside")
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "outline position must be outside or inside",
              );
            const rgba = color(op.color);
            if (isBackgroundLayer(layer) && rgba[3] !== UINT8_MAX)
              throw new BatchEditError(
                BatchEditErrorCode.NotEditable,
                "Background pixels must be opaque",
              );
            const size = batchInteger(op.size ?? 1, "size", 1, 16);
            let source = image;
            for (let pass = 0; pass < (place === "outside" ? size : 1); pass++) {
              source = applyEffectPixels(
                source,
                {
                  kind: EffectKind.Outline,
                  color: rgba,
                  bgColor: [0, 0, 0, 0],
                  place,
                  matrix: OUTLINE_MATRICES.circle,
                },
                options.selection ?? null,
              );
            }
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++) {
                const at = (py * image.width + px) * CHANNELS;
                const next: Rgba = [
                  source.data[at],
                  source.data[at + 1],
                  source.data[at + 2],
                  source.data[at + 3],
                ];
                if (next.some((v, c) => v !== image.data[at + c])) write(px, py, next);
              }
            break;
          }
          case BatchEditKind.AdjustHsl: {
            const hue = op.hue ?? 0,
              saturation = op.saturation ?? 0,
              lightness = op.lightness ?? 0;
            for (const [name, value, max] of [
              ["hue", hue, 360],
              ["saturation", saturation, 100],
              ["lightness", lightness, 100],
            ] as const)
              if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > max)
                throw new BatchEditError(
                  BatchEditErrorCode.InvalidInput,
                  `${name} must be between -${max} and ${max}`,
                );
            const source = applyEffectPixels(
              image,
              {
                kind: EffectKind.HueSaturation,
                mode: HueSaturationMode.HslAdd,
                hue,
                saturation,
                lightness,
                alpha: 0,
              },
              options.selection ?? null,
            );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++) {
                const at = (py * image.width + px) * CHANNELS;
                const next: Rgba = [
                  source.data[at],
                  source.data[at + 1],
                  source.data[at + 2],
                  source.data[at + 3],
                ];
                if (next.some((v, c) => v !== image.data[at + c])) write(px, py, next);
              }
            break;
          }
          case BatchEditKind.Effect: {
            const spec = batchEffectSpec(op);
            const source = applyEffectPixels(
              image,
              spec,
              options.selection ?? null,
              isBackgroundLayer(layer),
            );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++) {
                const at = (py * image.width + px) * CHANNELS;
                const next: Rgba = [
                  source.data[at],
                  source.data[at + 1],
                  source.data[at + 2],
                  source.data[at + 3],
                ];
                if (next.some((v, c) => v !== image.data[at + c])) write(px, py, next);
              }
            break;
          }
          case BatchEditKind.Gradient: {
            const from = color(op.from),
              to = color(op.to);
            if (isBackgroundLayer(layer) && (from[3] !== UINT8_MAX || to[3] !== UINT8_MAX))
              throw new BatchEditError(
                BatchEditErrorCode.NotEditable,
                "Background pixels must be opaque",
              );
            const direction = op.direction ?? "horizontal";
            if (!["horizontal", "vertical", "radial"].includes(direction))
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "direction must be horizontal, vertical or radial",
              );
            const dither = op.dither ?? "none";
            if (!["none", "bayer2", "bayer4", "bayer8"].includes(dither))
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "dither must be none, bayer2, bayer4 or bayer8",
              );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            const matrix = dither === "none" ? null : bayerMatrix(dither);
            const cx = (a.x + b.x) / 2,
              cy = (a.y + b.y) / 2;
            const radius = Math.hypot(b.x - a.x, b.y - a.y) / 2 || 1;
            for (let py = a.y; py <= b.y; py++)
              for (let px = a.x; px <= b.x; px++) {
                if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
                let t =
                  direction === "horizontal"
                    ? b.x === a.x
                      ? 0
                      : (px - a.x) / (b.x - a.x)
                    : direction === "vertical"
                      ? b.y === a.y
                        ? 0
                        : (py - a.y) / (b.y - a.y)
                      : Math.min(1, Math.hypot(px - cx, py - cy) / radius);
                if (matrix) {
                  const n = matrix.length;
                  const threshold = (matrix[py % n][px % n] + 0.5) / (n * n);
                  t = t >= threshold ? 1 : 0;
                }
                const rgba: Rgba = [
                  Math.round(from[0] + (to[0] - from[0]) * t),
                  Math.round(from[1] + (to[1] - from[1]) * t),
                  Math.round(from[2] + (to[2] - from[2]) * t),
                  Math.round(from[3] + (to[3] - from[3]) * t),
                ];
                write(px, py, rgba);
              }
            break;
          }
          case BatchEditKind.Dither: {
            const colorA = color(op.colorA),
              colorB = color(op.colorB);
            if (isBackgroundLayer(layer) && (colorA[3] !== UINT8_MAX || colorB[3] !== UINT8_MAX))
              throw new BatchEditError(
                BatchEditErrorCode.NotEditable,
                "Background pixels must be opaque",
              );
            const ratio = op.ratio ?? 0.5;
            if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "ratio must be between 0 and 1",
              );
            const pattern = op.pattern;
            if (!["bayer2", "bayer4", "bayer8", "checker", "noise"].includes(pattern))
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "pattern must be bayer2, bayer4, bayer8, checker or noise",
              );
            const matrix = pattern.startsWith("bayer") ? bayerMatrix(pattern) : null;
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            for (let py = a.y; py <= b.y; py++)
              for (let px = a.x; px <= b.x; px++) {
                if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
                let pick: boolean;
                if (matrix) {
                  const n = matrix.length;
                  pick = (matrix[py % n][px % n] + 0.5) / (n * n) < ratio;
                } else if (pattern === "checker") pick = ((px + py) & 1) === 0;
                else {
                  let h = (px * 0x9e3779b1) ^ (py * 0x85ebca6b);
                  h ^= h >>> 16;
                  h = Math.imul(h, 0x7feb352d);
                  h ^= h >>> 15;
                  pick = (h >>> 0) / 0xffffffff < ratio;
                }
                write(px, py, pick ? colorA : colorB);
              }
            break;
          }
          case BatchEditKind.Flip: {
            const direction = op.direction;
            if (direction !== "horizontal" && direction !== "vertical")
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "direction must be horizontal or vertical",
              );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            const snapshot = image.data.slice();
            for (let py = Math.max(0, a.y); py <= Math.min(image.height - 1, b.y); py++)
              for (let px = Math.max(0, a.x); px <= Math.min(image.width - 1, b.x); px++) {
                const sx = direction === "horizontal" ? a.x + b.x - px : px;
                const sy = direction === "vertical" ? a.y + b.y - py : py;
                const at = (sy * image.width + sx) * CHANNELS;
                write(px, py, [snapshot[at], snapshot[at + 1], snapshot[at + 2], snapshot[at + 3]]);
              }
            break;
          }
          case BatchEditKind.Rotate90: {
            if (op.angle !== 90 && op.angle !== 180 && op.angle !== 270)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "angle must be 90, 180 or 270",
              );
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            if (op.angle !== 180 && region.width !== region.height)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "rotate90 by 90 or 270 requires a square rect",
              );
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            const w = b.x - a.x + 1,
              h = b.y - a.y + 1;
            const snapshot = image.data.slice();
            for (let py = a.y; py <= b.y; py++)
              for (let px = a.x; px <= b.x; px++) {
                if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
                const rx = px - a.x,
                  ry = py - a.y;
                let sx: number, sy: number;
                if (op.angle === 90) {
                  sx = ry;
                  sy = h - 1 - rx;
                } else if (op.angle === 270) {
                  sx = w - 1 - ry;
                  sy = rx;
                } else {
                  sx = w - 1 - rx;
                  sy = h - 1 - ry;
                }
                const at = ((a.y + sy) * image.width + a.x + sx) * CHANNELS;
                write(px, py, [snapshot[at], snapshot[at + 1], snapshot[at + 2], snapshot[at + 3]]);
              }
            break;
          }
          case BatchEditKind.Translate: {
            const dx = batchInteger(op.dx, "dx", -doc.width, doc.width);
            const dy = batchInteger(op.dy, "dy", -doc.height, doc.height);
            if (!dx && !dy) break;
            const region = op.rect
              ? batchRect(op.rect, doc.width, doc.height)
              : { x: 0, y: 0, width: doc.width, height: doc.height };
            const a = local(region),
              b = local({ x: region.x + region.width - 1, y: region.y + region.height - 1 });
            const snapshot = image.data.slice();
            for (let py = a.y; py <= b.y; py++)
              for (let px = a.x; px <= b.x; px++) {
                if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
                const sx = px - dx,
                  sy = py - dy;
                const inside =
                  sx >= a.x &&
                  sx <= b.x &&
                  sy >= a.y &&
                  sy <= b.y &&
                  sx >= 0 &&
                  sy >= 0 &&
                  sx < image.width &&
                  sy < image.height;
                const at = inside ? (sy * image.width + sx) * CHANNELS : 0;
                write(
                  px,
                  py,
                  inside
                    ? [snapshot[at], snapshot[at + 1], snapshot[at + 2], snapshot[at + 3]]
                    : [0, 0, 0, 0],
                );
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
