import type { PointerActionModifiers } from "$/base/pointer-input";
import type { Brush, PixelMask, Point, Rect } from "$/base/primitives";
import type { ClipboardImage } from "$/clipboard/image";
import type { ToolSettings } from "$/drawing/tool-settings";
import { EyedropperSample } from "$/drawing/types";
import { isSelectionTool } from "$/selection/operations";
import {
  dragSelectionTransform,
  type SelectionHandle,
  type SelectionTransform,
} from "$/selection/transform";
import { transformTilemapSelection } from "$/tilemap/operations/tile-selection-transform";
import {
  applyTilemapPoints,
  TilemapPixelPerfectStroke,
  tilemapBrushPoints,
  tilemapCellAt,
  tilemapTileAt,
  type TilemapBrushContext,
} from "$/tilemap/tools";
import { effectiveLayerVisible, LAYER_REFERENCE } from "$/timeline";
import type { SpriteTimeline } from "$/timeline/types";

export interface TilemapPointerInput extends Point {
  actionModifiers?: PointerActionModifiers;
  alt?: boolean;
  button?: number;
  shift?: boolean;
}

export interface TilemapStrokeTransaction {
  setTimeline(timeline: SpriteTimeline): void;
  setSelection(selection: PixelMask | null): void;
  pasteTilemap(image: ClipboardImage, origin: Point): void;
  commit(): void;
  cancel(): void;
}

export interface TilemapGesturePreview {
  tool: ToolSettings["tool"];
  points: readonly Point[];
  button: number;
}

export interface TilemapSelectionSource {
  timeline: SpriteTimeline;
  image: ClipboardImage;
  selection: PixelMask;
}

export interface TilemapGesturePort {
  getTimeline(): SpriteTimeline | null;
  getLayerAtPoint(point: Point): number | null;
  getSelectionSource(): TilemapSelectionSource | null;
  getBrushContext(): TilemapBrushContext;
  getSettings(): {
    tool: ToolSettings["tool"];
    selectedTile?: number;
    backgroundTile?: number;
    pixelPerfect: boolean;
    symmetryEnabled?: boolean;
    brush: Brush;
    brushAngleStatic: boolean;
    discardBrushOnEyedropper?: boolean;
    eyedropperSample?: EyedropperSample;
  };
  getSymmetry(): { mode: number; x: number; y: number };
  isEditable(): boolean;
  supportsPixelPerfect(): boolean;
  beginTransaction(label: string): TilemapStrokeTransaction | null;
  discardImageBrush(): void;
  setSelectedTile(tile: number): void;
  setBackgroundTile(tile: number): void;
  setPointer(point: Point): void;
  setStatus(message: string): void;
  publish(pixelsChanged: boolean): void;
}

interface TilemapStrokeGesture {
  transaction: TilemapStrokeTransaction;
  base: SpriteTimeline;
  start: Point;
  last: Point;
  tool: ToolSettings["tool"];
  tile: number;
  pixelPerfect: TilemapPixelPerfectStroke | null;
  pixelPerfectStarted: boolean;
}

interface TilemapSelectionGesture {
  transaction: TilemapStrokeTransaction;
  base: SpriteTimeline;
  image: ClipboardImage;
  start: Point;
  last: Point;
  copy: boolean;
  selection: PixelMask;
  handle: SelectionHandle;
  initial: SelectionTransform;
}

const point = (value: Point): Point => ({ x: Math.floor(value.x), y: Math.floor(value.y) });
const shapeTools: readonly ToolSettings["tool"][] = [
  "line",
  "rectangle",
  "filled_rectangle",
  "ellipse",
  "filled_ellipse",
];
const tileDrawingTools: readonly ToolSettings["tool"][] = [
  "pencil",
  "eraser",
  "bucket",
  ...shapeTools,
];

function historyLabel(tool: ToolSettings["tool"]): string {
  if (tool === "bucket") return "Paint Bucket";
  return tool.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export class TilemapGestureController {
  private gesture: TilemapStrokeGesture | null = null;
  private selectionGesture: TilemapSelectionGesture | null = null;
  private eyedropperPointer: { timeline: SpriteTimeline; button: number } | null = null;

  constructor(private readonly port: TilemapGesturePort) {}

  getSnapshot = (): { preview: TilemapGesturePreview | null } => ({
    preview: this.gesture
      ? {
          tool: this.gesture.tool,
          points: [this.gesture.start, this.gesture.last],
          button: 0,
        }
      : this.selectionGesture
        ? {
            tool: "move",
            points: [this.selectionGesture.start, this.selectionGesture.last],
            button: 0,
          }
        : null,
  });

  hasPendingDocumentEdit = (): boolean => this.gesture !== null || this.selectionGesture !== null;

  isGestureActive = (): boolean => this.gesture !== null || this.eyedropperPointer !== null;

  isSelectionTransformActive = (): boolean => this.selectionGesture !== null;

  reset() {
    this.eyedropperPointer = null;
    this.gesture?.transaction.cancel();
    this.selectionGesture?.transaction.cancel();
    this.gesture = null;
    this.selectionGesture = null;
  }

  beginGesture(input: TilemapPointerInput): boolean {
    this.eyedropperPointer = null;
    const timeline = this.port.getTimeline();
    if (!timeline) return false;
    const settings = this.port.getSettings();
    if (settings.tool === "eyedropper" || (!input.actionModifiers && input.alt)) {
      this.eyedropperPointer = { timeline, button: input.button ?? 0 };
      this.pickTile(input, timeline, this.eyedropperPointer.button);
      return true;
    }
    if (isSelectionTool(settings.tool) || settings.tool === "move" || settings.tool === "zoom")
      return false;
    if (!tileDrawingTools.includes(settings.tool)) {
      this.port.setStatus("Choose a tile drawing tool or switch to Pixels");
      this.port.publish(false);
      return true;
    }
    if (!this.port.isEditable()) {
      this.port.setStatus("Layer is hidden or locked");
      this.port.publish(false);
      return true;
    }
    const tile =
      settings.tool === "eraser"
        ? 0
        : input.button === 2
          ? (settings.backgroundTile ?? 0)
          : (settings.selectedTile ?? 0);
    const tileset = timeline.tilesets?.find(
      (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
    );
    if (!tileset || (tile & 0x1fffffff) >= tileset.tileCount) {
      this.port.setStatus("Draw pixels to create a tile, then select it in Tileset");
      this.port.publish(false);
      return true;
    }
    const pixelPerfect =
      (settings.tool === "pencil" || settings.tool === "eraser") &&
      settings.pixelPerfect &&
      this.port.supportsPixelPerfect()
        ? new TilemapPixelPerfectStroke()
        : null;
    const transaction = this.port.beginTransaction(historyLabel(settings.tool));
    if (!transaction) return true;
    const start = point(input);
    this.gesture = {
      transaction,
      base: timeline,
      start,
      last: start,
      tool: settings.tool,
      tile,
      pixelPerfect,
      pixelPerfectStarted: false,
    };
    this.updateGesture(input);
    return true;
  }

  private pickTile(input: TilemapPointerInput, timeline: SpriteTimeline, button: number): void {
    this.port.setPointer(point(input));
    if (this.port.getSettings().discardBrushOnEyedropper) this.port.discardImageBrush();
    const settings = this.port.getSettings();
    const sample = settings.eyedropperSample ?? EyedropperSample.AllLayers;
    const referenceMode =
      sample === EyedropperSample.ReferenceLayer &&
      timeline.layers.some(
        (layer, index) =>
          !!(layer.flags & LAYER_REFERENCE) && effectiveLayerVisible(timeline, index),
      );
    const layer =
      sample === EyedropperSample.CurrentLayer
        ? timeline.activeLayer
        : referenceMode
          ? null
          : this.port.getLayerAtPoint(input);
    const source =
      layer === null || timeline.layers[layer]?.kind !== "tilemap"
        ? null
        : { ...timeline, activeLayer: layer };
    const picked = source ? tilemapTileAt(source, tilemapCellAt(source, input)) : 0;
    if (button === 2) this.port.setBackgroundTile(picked);
    else this.port.setSelectedTile(picked);
    this.port.publish(false);
  }

  updateGesture(input: TilemapPointerInput) {
    const eyedropper = this.eyedropperPointer;
    if (eyedropper) {
      const timeline = this.port.getTimeline();
      if (timeline === eyedropper.timeline) this.pickTile(input, timeline, eyedropper.button);
      else this.eyedropperPointer = null;
      return;
    }
    const gesture = this.gesture;
    const timeline = this.port.getTimeline();
    if (!gesture || !timeline) return;
    const current = point(input);
    this.port.setPointer(current);
    const shape = shapeTools.includes(gesture.tool);
    const base = shape ? gesture.base : timeline;
    const from = tilemapCellAt(base, shape ? gesture.start : gesture.last);
    const to = tilemapCellAt(base, input);
    try {
      const next = gesture.pixelPerfect
        ? gesture.pixelPerfect.paint(
            this.port.getBrushContext(),
            timeline,
            gesture.pixelPerfectStarted ? [gesture.last, current] : [current],
            gesture.tile,
            {
              ...this.port.getSymmetry(),
              enabled: !!this.port.getSettings().symmetryEnabled,
              brush: this.port.getSettings().brush,
              brushAngleStatic: this.port.getSettings().brushAngleStatic,
            },
          )
        : applyTilemapPoints(
            base,
            tilemapBrushPoints(this.port.getBrushContext(), base, from, to, gesture.tool),
            gesture.tile,
          );
      gesture.transaction.setTimeline(next);
      gesture.pixelPerfectStarted = !!gesture.pixelPerfect;
      gesture.last = current;
      this.port.publish(true);
    } catch (error) {
      gesture.transaction.cancel();
      this.gesture = null;
      this.port.setStatus(error instanceof Error ? error.message : String(error));
      this.port.publish(true);
    }
  }

  endGesture(input?: TilemapPointerInput) {
    this.eyedropperPointer = null;
    if (input) this.updateGesture(input);
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    gesture.transaction.commit();
    this.port.publish(true);
  }

  cancelGesture() {
    this.eyedropperPointer = null;
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    gesture.transaction.cancel();
    this.port.publish(true);
  }

  beginSelectionTransform(handle: SelectionHandle, at: Point, copy = false): boolean {
    const source = this.port.getSelectionSource();
    if (!source?.image.tilemap || !source.image.mask) return false;
    const transaction = this.port.beginTransaction(copy ? "Copy Selection" : "Move Selection");
    if (!transaction) return false;
    const start = point(at);
    this.selectionGesture = {
      transaction,
      base: source.timeline,
      image: source.image,
      start,
      last: start,
      copy,
      selection: source.selection,
      handle,
      initial: {
        source: source.image.pixels,
        mask: source.image.mask,
        bounds: {
          x: source.selection.x,
          y: source.selection.y,
          width: source.selection.width,
          height: source.selection.height,
        },
        angle: 0,
        copy,
      },
    };
    this.port.publish(false);
    return true;
  }

  updateSelectionTransform(input: TilemapPointerInput) {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    const tileset = gesture.image.tilemap!.tileset;
    try {
      const current =
        gesture.handle === "move"
          ? {
              ...input,
              x:
                gesture.start.x +
                Math.round((input.x - gesture.start.x) / tileset.tileWidth) * tileset.tileWidth,
              y:
                gesture.start.y +
                Math.round((input.y - gesture.start.y) / tileset.tileHeight) * tileset.tileHeight,
            }
          : input;
      const transform = dragSelectionTransform(
        gesture.initial,
        gesture.handle,
        gesture.start,
        current,
        gesture.handle.startsWith("rotate")
          ? (input.actionModifiers?.angleSnap ?? !!input.shift)
          : (input.actionModifiers?.maintainAspectRatio ?? !!input.shift),
        input.actionModifiers?.scaleFromPivot ?? !!input.alt,
        input.actionModifiers?.lockAxis ?? !!input.shift,
      );
      gesture.last = point(input);
      if (
        transform.angle === gesture.initial.angle &&
        Object.keys(gesture.initial.bounds).every(
          (key) =>
            transform.bounds[key as keyof Rect] === gesture.initial.bounds[key as keyof Rect],
        )
      ) {
        gesture.transaction.setTimeline(gesture.base);
        gesture.transaction.setSelection(gesture.selection);
        this.port.setPointer(point(input));
        this.port.publish(true);
        return;
      }
      const output = transformTilemapSelection(
        gesture.image,
        transform,
        undefined,
        gesture.selection,
      );
      gesture.transaction.setTimeline(gesture.base);
      gesture.transaction.setSelection(gesture.selection);
      if (!gesture.copy) {
        const cleared = clearTilemapSelection(gesture.base, this.port.getBrushContext());
        gesture.transaction.setTimeline(cleared);
      }
      gesture.transaction.pasteTilemap(output.image, output.origin);
      gesture.transaction.setSelection(output.image.mask);
      this.port.setPointer(point(input));
      this.port.publish(true);
    } catch (error) {
      gesture.transaction.cancel();
      this.selectionGesture = null;
      this.port.setStatus(error instanceof Error ? error.message : String(error));
      this.port.publish(true);
    }
  }

  endSelectionTransform(input?: TilemapPointerInput) {
    if (input) this.updateSelectionTransform(input);
    const gesture = this.selectionGesture;
    if (!gesture) return;
    this.selectionGesture = null;
    gesture.transaction.commit();
    this.port.publish(true);
  }

  cancelSelectionTransform() {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    this.selectionGesture = null;
    gesture.transaction.cancel();
    this.port.publish(true);
  }
}

function clearTilemapSelection(timeline: SpriteTimeline, context: TilemapBrushContext) {
  const map = timeline.frames[timeline.activeFrame].cels[timeline.activeLayer]?.tilemap;
  if (!map) return timeline;
  const points = tilemapBrushPoints(
    context,
    timeline,
    { x: 0, y: 0 },
    { x: map.width - 1, y: map.height - 1 },
    "filled_rectangle",
  );
  return applyTilemapPoints(timeline, points, 0);
}
