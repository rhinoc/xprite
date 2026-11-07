import type { Point, Rect, Rgba } from "$/base/primitives";
import type { AsepriteTagDirection } from "$/import-export/aseprite/model";

export enum BatchEditKind {
  Stroke = "stroke",
  Line = "line",
  Rectangle = "rectangle",
  FillRect = "fillRect",
  Ellipse = "ellipse",
  FillEllipse = "fillEllipse",
  Fill = "fill",
  Pixels = "pixels",
  Grid = "grid",
  AddLayer = "addLayer",
  RenameLayer = "renameLayer",
  SetLayerVisibility = "setLayerVisibility",
  MoveLayer = "moveLayer",
  AddFrame = "addFrame",
  SetFrameDuration = "setFrameDuration",
  AddTag = "addTag",
  UpdateTag = "updateTag",
  RemoveTag = "removeTag",
  LinkCels = "linkCels",
  UnlinkCels = "unlinkCels",
  Clear = "clear",
  ClearCel = "clearCel",
  CopyCel = "copyCel",
  Blit = "blit",
  DeleteFrame = "deleteFrame",
  ReorderFrame = "reorderFrame",
  DeleteLayer = "deleteLayer",
  SetLayer = "setLayer",
  CopyFrame = "copyFrame",
  DuplicateLayer = "duplicateLayer",
  MergeLayer = "mergeLayer",
  GroupLayer = "groupLayer",
  UngroupLayer = "ungroupLayer",
  SetCel = "setCel",
  ResizeCanvas = "resizeCanvas",
  CropToContent = "cropToContent",
  Select = "select",
  ReplaceColor = "replaceColor",
  Outline = "outline",
  AdjustHsl = "adjustHsl",
  Effect = "effect",
  Gradient = "gradient",
  Dither = "dither",
  Flip = "flip",
  Rotate90 = "rotate90",
  Translate = "translate",
  ResizeSprite = "resizeSprite",
  ConvertToTilemap = "convertToTilemap",
  StampTiles = "stampTiles",
  PaintTiles = "paintTiles",
  TweenCels = "tweenCels",
}

export const BATCH_EDIT_LIMITS = Object.freeze({
  operations: 128,
  points: 4096,
  pixels: 4 * 1024 * 1024,
  brushSize: 64,
  nameLength: 128,
  rgbaChannels: 4,
});

interface RasterTarget {
  layerId: string;
  frameIndex: number;
}
interface PaintTarget extends RasterTarget {
  color: Rgba | string;
  size?: number;
}
type BatchEditOperationBase =
  | (PaintTarget & { type: BatchEditKind.Stroke; points: readonly Point[] })
  | (PaintTarget & { type: BatchEditKind.Line; start: Point; end: Point })
  | (PaintTarget & {
      type:
        | BatchEditKind.Rectangle
        | BatchEditKind.FillRect
        | BatchEditKind.Ellipse
        | BatchEditKind.FillEllipse;
      rect: Rect;
    })
  | (PaintTarget & { type: BatchEditKind.Fill; point: Point })
  | (RasterTarget & { type: BatchEditKind.Pixels; rect: Rect; rgba: readonly number[] })
  | (RasterTarget & {
      type: BatchEditKind.Grid;
      rect: Rect;
      legend: Readonly<Record<string, Rgba | string>>;
      rows: readonly string[];
      transparent?: "erase" | "skip";
    })
  | { type: BatchEditKind.AddLayer; layerId: string; name: string; afterLayerId?: string }
  | { type: BatchEditKind.RenameLayer; layerId: string; name: string }
  | { type: BatchEditKind.SetLayerVisibility; layerId: string; visible: boolean }
  | { type: BatchEditKind.MoveLayer; layerId: string; targetLayerId: string }
  | {
      type: BatchEditKind.AddFrame;
      afterFrameIndex: number;
      duplicate?: boolean;
      duration?: number;
    }
  | {
      type: BatchEditKind.SetFrameDuration;
      frameIndex?: number;
      duration?: number;
      /** Per-frame durations in timeline order; length must equal the frame count. */
      durations?: readonly number[];
    }
  | {
      type: BatchEditKind.AddTag;
      name: string;
      /** Zero-based closed frame range covered by the tag. */
      from: number;
      to: number;
      direction?: AsepriteTagDirection;
      repeat?: number;
      /** Optional tag colour as [r,g,b] or [r,g,b,a] bytes. */
      color?: readonly number[];
    }
  | {
      type: BatchEditKind.UpdateTag;
      /** Index into the document's current tag list (context `tags` order). */
      tagIndex: number;
      name?: string;
      from?: number;
      to?: number;
      direction?: AsepriteTagDirection;
      repeat?: number;
      color?: readonly number[];
    }
  | { type: BatchEditKind.RemoveTag; tagIndex: number }
  | {
      type: BatchEditKind.LinkCels;
      layerId: string;
      /** Frames to link: the first populated one becomes the shared source. */
      frameIndices: readonly number[];
    }
  | {
      type: BatchEditKind.UnlinkCels;
      layerId: string;
      /** Frames whose cel gets its own pixel buffer. */
      frameIndices: readonly number[];
    };

/** Fields every raster-region op shares. `rect` omitted means the whole cel. */
interface RegionTarget extends RasterTarget {
  rect?: Rect;
}

export type BatchEditLayerAttribute =
  | { opacity: number }
  | { blendMode: string }
  | { visible: boolean }
  | { name: string }
  | { editable: boolean };

export type BatchEditOperationExtra =
  | (RegionTarget & { type: BatchEditKind.Clear })
  | (RasterTarget & { type: BatchEditKind.ClearCel })
  | (RasterTarget & { type: BatchEditKind.CopyCel; toFrameIndex: number })
  | (RasterTarget & {
      type: BatchEditKind.Blit;
      src: { documentId?: string; layerId: string; frameIndex: number; rect: Rect };
      dest: { x: number; y: number };
    })
  | { type: BatchEditKind.DeleteFrame; frameIndex: number }
  | { type: BatchEditKind.ReorderFrame; frameIndex: number; toIndex: number }
  | { type: BatchEditKind.DeleteLayer; layerId: string }
  | {
      type: BatchEditKind.SetLayer;
      layerId: string;
      opacity?: number;
      blendMode?: string;
      visible?: boolean;
      name?: string;
      editable?: boolean;
    }
  | { type: BatchEditKind.CopyFrame; frameIndex: number; to: readonly number[] }
  | { type: BatchEditKind.DuplicateLayer; layerId: string; name?: string; toDocumentId?: string }
  | { type: BatchEditKind.MergeLayer; layerId: string; targetLayerId?: string }
  | { type: BatchEditKind.GroupLayer; layerIds: readonly string[]; name?: string }
  | { type: BatchEditKind.UngroupLayer; layerId: string }
  | (RasterTarget & {
      type: BatchEditKind.SetCel;
      position?: Point;
      opacity?: number;
    })
  | {
      type: BatchEditKind.ResizeCanvas;
      width: number;
      height: number;
      anchor?:
        | "topLeft"
        | "top"
        | "topRight"
        | "left"
        | "center"
        | "right"
        | "bottomLeft"
        | "bottom"
        | "bottomRight";
    }
  | { type: BatchEditKind.CropToContent; layerId?: string }
  | {
      type: BatchEditKind.Select;
      op: "all" | "none" | "rect" | "ellipse" | "color";
      rect?: Rect;
      color?: Rgba | string;
      mode?: "replace" | "add" | "subtract" | "intersect";
      grow?: number;
      shrink?: number;
    }
  | (RegionTarget & {
      type: BatchEditKind.ReplaceColor;
      from: Rgba | string;
      to: Rgba | string;
      frameRange?: readonly [number, number];
    })
  | (RegionTarget & {
      type: BatchEditKind.Outline;
      color: Rgba | string;
      position?: "outside" | "inside";
      size?: number;
    })
  | (RegionTarget & {
      type: BatchEditKind.AdjustHsl;
      hue?: number;
      saturation?: number;
      lightness?: number;
    })
  | (RegionTarget & {
      type: BatchEditKind.Effect;
      effect:
        | { kind: "brightness-contrast"; brightness?: number; contrast?: number }
        | { kind: "invert" }
        | { kind: "median-blur"; width?: number; height?: number }
        | {
            kind: "convolution-matrix";
            preset:
              | "identity"
              | "box-blur"
              | "gaussian-blur"
              | "sharpen"
              | "edge-detect"
              | "emboss"
              | "horizontal-edges"
              | "vertical-edges";
          }
        | {
            kind: "color-curve";
            points: readonly { x: number; y: number }[];
          }
        | {
            kind: "hue-saturation";
            mode?: "hsv-mul" | "hsl-mul" | "hsv-add" | "hsl-add";
            hue?: number;
            saturation?: number;
            lightness?: number;
            alpha?: number;
          };
    })
  | (RegionTarget & {
      type: BatchEditKind.Gradient;
      from: Rgba | string;
      to: Rgba | string;
      direction?: "horizontal" | "vertical" | "radial";
      dither?: "none" | "bayer2" | "bayer4" | "bayer8";
    })
  | (RegionTarget & {
      type: BatchEditKind.Dither;
      colorA: Rgba | string;
      colorB: Rgba | string;
      pattern: "bayer2" | "bayer4" | "bayer8" | "checker" | "noise";
      ratio?: number;
    })
  | (RegionTarget & { type: BatchEditKind.Flip; direction: "horizontal" | "vertical" })
  | (RegionTarget & { type: BatchEditKind.Rotate90; angle: 90 | 180 | 270 })
  | (RegionTarget & { type: BatchEditKind.Translate; dx: number; dy: number })
  | {
      type: BatchEditKind.ResizeSprite;
      width: number;
      height: number;
      method?: "nearest" | "bilinear" | "rotsprite";
    }
  | {
      type: BatchEditKind.ConvertToTilemap;
      layerId: string;
      tileWidth: number;
      tileHeight: number;
      name?: string;
      tilesetName?: string;
      baseIndex?: number;
      matchFlags?: number;
    }
  | {
      type: BatchEditKind.StampTiles;
      layerId: string;
      frameIndex: number;
      /** Grid-cell placements; `tile` is the tileset index. */
      cells: readonly { x: number; y: number; tile: number }[];
    }
  | (RasterTarget & {
      type: BatchEditKind.PaintTiles;
      rect: Rect;
      rgba: readonly number[];
    })
  | {
      type: BatchEditKind.TweenCels;
      layerId: string;
      fromFrame: number;
      toFrame: number;
      property: "position" | "opacity" | "scale";
      from: number | Point;
      to: number | Point;
      ease?: "linear" | "in" | "out" | "inOut" | "pingpong";
    };

export type BatchEditOperation = BatchEditOperationBase | BatchEditOperationExtra;

export interface BatchEditResult {
  changedRegions: { layerId: string; frameIndex: number; rect: Rect }[];
  createdLayerIds: string[];
  createdFrameIndices: number[];
}

export enum BatchEditErrorCode {
  InvalidInput = "invalid_input",
  Busy = "busy",
  Conflict = "revision_conflict",
  NotFound = "not_found",
  NotEditable = "not_editable",
  Unsupported = "unsupported",
}

export class BatchEditError extends Error {
  constructor(
    readonly code: BatchEditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BatchEditError";
  }
}
