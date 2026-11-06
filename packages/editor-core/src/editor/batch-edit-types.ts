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
export type BatchEditOperation =
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
  | { type: BatchEditKind.SetFrameDuration; frameIndex: number; duration: number }
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
