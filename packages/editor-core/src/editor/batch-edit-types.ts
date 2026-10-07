import type { Point, Rect, Rgba } from "$/base/primitives";

export enum BatchEditKind {
  Stroke = "stroke",
  Line = "line",
  Rectangle = "rectangle",
  FillRect = "fillRect",
  Ellipse = "ellipse",
  FillEllipse = "fillEllipse",
  Fill = "fill",
  Pixels = "pixels",
  AddLayer = "addLayer",
  RenameLayer = "renameLayer",
  SetLayerVisibility = "setLayerVisibility",
  MoveLayer = "moveLayer",
  AddFrame = "addFrame",
  SetFrameDuration = "setFrameDuration",
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
  | { type: BatchEditKind.SetFrameDuration; frameIndex: number; duration: number };

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
