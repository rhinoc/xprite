import type { PointerInput } from "$/base/pointer-input";
import {
  BrushImagePattern,
  type Brush,
  type PixelBuffer,
  type PixelMask,
  type Point,
  type Rect,
} from "$/base/primitives";
import { brushMask } from "$/canvas/raster";
import { DynamicPaintStroke } from "$/canvas/raster/dynamic-paint-stroke";
import { PixelPerfectPath, PixelPerfectTracePolicy } from "$/canvas/raster/pixel-perfect";
import { PixelPerfectStroke } from "$/canvas/raster/pixel-perfect-stroke";
import { StrokeDynamics } from "$/canvas/raster/stroke-dynamics";
import { getXpriteToolCapabilities } from "$/drawing/capabilities";
import { AsepriteLineFreehandController } from "$/drawing/line/controller";
import { AsepriteShapeController, isShapeTool } from "$/drawing/shapes";
import {
  LibreSpriteTwoPointsController,
  isTwoPointShape,
  supportsCornerRadius,
} from "$/drawing/shapes/modifiers";
import { inlineTextBox } from "$/drawing/text/inline-text";
import type { AsepriteDynamicsSettings, ToolSettings } from "$/drawing/tool-settings";
import type { HistoryCommand } from "$/history/history";
import { canMoveSelectionPixels } from "$/selection";
import { SelectionMode } from "$/selection/types";
import type { SpriteTimeline } from "$/timeline/timeline";

const SELECTION_CONTACT_CLICK_SLOP = 12;
const SELECTION_MOUSE_CLICK_SLOP = 4;
const SELECTION_MOUSE_CLICK_DURATION_MS = 250;

export enum DrawingGesturePointerDownRoute {
  Continue = "continue",
  Handled = "handled",
  CancelActiveGesture = "cancel-active-gesture",
}

export interface DrawingGestureSettings {
  tool: ToolSettings["tool"];
  brush: Brush;
  pixelPerfect: boolean;
  dynamics?: AsepriteDynamicsSettings;
  selectionMode?: SelectionMode;
  selectionMoveOnAddMode?: boolean;
  selectionCornerRadius?: number;
  rectangleCornerRadius?: number;
  autoSelectLayer: boolean;
  eyedropperChannel?: ToolSettings["eyedropperChannel"];
  discardBrushOnEyedropper?: ToolSettings["discardBrushOnEyedropper"];
  fontHeight?: number;
  textScale: number;
}

/** Read-only facts about the active raster target; this never exposes a document. */
export interface DrawingPaintTarget {
  width: number;
  height: number;
  layerOffset: Point;
  selection: PixelMask | null;
  editable: boolean;
  movable: boolean;
  positionLocked: boolean;
}

interface DrawingGestureCommit {
  replacesSelection?: boolean;
  extraCommands?: readonly HistoryCommand[];
  manualTilemapPreview?: SpriteTimeline;
}

export interface DrawingGestureTransaction {
  capture(image: PixelBuffer, rect: Rect): void;
  commit(options?: DrawingGestureCommit): void;
  cancel(): void;
}

export interface DrawingGestureState {
  heldSelectionModifiers?: { squareAspect: boolean; drawFromCenter: boolean; rotateShape: boolean };
  selectionClick?: {
    start: Point;
    time?: number;
    screen: boolean;
    contact: boolean;
    maxDistance: number;
    maxX: number;
    maxY: number;
  };
  twoPoints?: LibreSpriteTwoPointsController;
  lineFreehand?: AsepriteLineFreehandController;
  controller?: AsepriteShapeController;
  selectionMode?: SelectionMode;
  selectionBase?: PixelMask | null;
  dynamics: StrokeDynamics | null;
  speed: Point;
  pressure: number;
  previousPressure: number;
  sprayRemainder: number;
  sprayBrushPatternOrigin?: Point;
  previousBrush?: Brush;
  previousGradient?: number;
  brushPatternOrigin?: Point;
  dynamicPaint?: DynamicPaintStroke;
  indexedPixelWriter?: unknown;
  dynamicBranches?: Map<number, DynamicPaintStroke>;
  points: Point[];
  button: number;
  tool: ToolSettings["tool"];
  startOffset: Point;
  painted: boolean;
  wrotePixels?: boolean;
  coverage: Set<number>;
  pixelPerfect: PixelPerfectStroke | null;
  fillPixelPerfect: PixelPerfectPath | null;
  manualTilemapBase?: SpriteTimeline;
  manualTilemapPreviewTimeline?: SpriteTimeline;
}

export interface DrawingGesturePort {
  getSettings(): DrawingGestureSettings;
  getPaintTarget(): DrawingPaintTarget | null;
  /** Handles immediate tools and selection-specific pointer commands before a stroke starts. */
  handlePointerDownAction(
    input: PointerInput,
    settings: DrawingGestureSettings,
    target: DrawingPaintTarget,
  ): boolean;
  isSelectionTool(tool: ToolSettings["tool"]): boolean;
  selectionModeForInput(input: PointerInput, mode: SelectionMode): SelectionMode;
  selectionContains(mask: PixelMask, at: Point): boolean;
  beginSelectionTransform(handle: "move", at: Point, copy: boolean): boolean;
  beginTransaction(label: string): DrawingGestureTransaction | null;
  createAsepriteIndexWriter(button: number): unknown;
  getManualTilemapBase(): SpriteTimeline | undefined;
  getLastDrawingPoint(): Point | null;
  getPointer(): Point | null;
  preparePointerMove(input: PointerInput): PointerInput;
  supportsPixelPerfect(settings: DrawingGestureSettings): boolean;
  draw(
    gesture: DrawingGestureState,
    points: Point[],
    tool: ToolSettings["tool"],
    button: number,
    tracePolicy?: PixelPerfectTracePolicy,
  ): boolean;
  applySelection(gesture: DrawingGestureState, clearClick: boolean): string | null;
  beginCelMovement(useTimelineRange?: boolean, autoSelectLayer?: boolean): boolean;
  endCelMovement(): void;
  cancelCelMovement(): void;
  setLayerOffset(offset: Point): void;
  refreshManualTilemapPreview(gesture: DrawingGestureState): void;
  manualTilemapPreviewChanged(base: SpriteTimeline, preview: SpriteTimeline): boolean;
  isTilemapTarget(): boolean;
  prepareRasterForCommit(): void;
  setLastDrawingPoint(point: Point): HistoryCommand | undefined;
  setLineFreehandPreview(
    preview: {
      start: Point;
      end: Point;
      button: number;
      tool: ToolSettings["tool"];
    } | null,
  ): void;
  updateIdlePointer(input: PointerInput): void;
  isPointerActionActive(): boolean;
  clearPointerAction(): void;
  setPointer(point: Point): void;
  setStatus(status: string): void;
  reportDrawFailure(error: Error): void;
  beginInlineText(bounds: Rect): void;
  updateCornerRadius(radius: number): void;
  publish(pixelsChanged?: boolean): void;
}

const point = (value: Point): Point => ({ x: Math.floor(value.x), y: Math.floor(value.y) });

function brushPressureFromPointer(input: PointerInput): number {
  return input.pointerType === "pen" || input.pointerType === "eraser"
    ? Math.max(0, Math.min(1, Number.isFinite(input.pressure) ? input.pressure! : 1))
    : 1;
}

function historyToolLabel(tool: ToolSettings["tool"]): string {
  if (tool === "bucket") return "Paint Bucket";
  if (tool === "marquee") return "Rectangular Marquee";
  if (tool === "elliptical_marquee") return "Elliptical Marquee";
  if (tool === "polygonal_lasso") return "Polygonal Lasso";
  return tool.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type PixelPerfectInkTool = Extract<ToolSettings["tool"], "pencil" | "eraser" | "blur">;
function pixelPerfectInk(tool: PixelPerfectInkTool): "paint" | "erase" | "blur" {
  return tool === "eraser" ? "erase" : tool === "blur" ? "blur" : "paint";
}

function hasWrotePixelStroke(tool: ToolSettings["tool"]): boolean {
  return ["pencil", "spray", "eraser", "blur", "jumble", "bucket"].includes(tool);
}

function isShapeCommitTool(tool: ToolSettings["tool"]): boolean {
  return tool === "line" || tool === "rectangle" || tool === "contour" || isShapeTool(tool);
}

export class DrawingGestureController {
  private gesture: DrawingGestureState | null = null;
  private transaction: DrawingGestureTransaction | null = null;

  constructor(private readonly port: DrawingGesturePort) {}

  getGestureState = (): DrawingGestureState | null => this.gesture;

  isGestureActive = (): boolean =>
    this.gesture !== null || this.port.isPointerActionActive() === true;

  canFinishStagedGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture?.controller) return false;
    const distinct = new Set(gesture.points.map(({ x, y }) => `${x},${y}`));
    return distinct.size >= (gesture.tool === "polygonal_lasso" ? 3 : 2);
  }

  /** Apply the current multi-point preview without fabricating a pointer release. */
  finishStagedGesture(): boolean {
    if (!this.canFinishStagedGesture()) return false;
    const gesture = this.gesture!;
    gesture.controller = undefined;
    // Completing a polygon is not the replace-selection outside-click gesture.
    gesture.selectionClick = undefined;
    this.endGesture();
    return this.gesture === null;
  }

  hasPendingDocumentEdit = (): boolean =>
    !!this.gesture && !this.port.isSelectionTool(this.gesture.tool);

  getPreview = () => {
    const gesture = this.gesture;
    if (!gesture) return null;
    return {
      tool: gesture.tool,
      points: gesture.fillPixelPerfect?.getPoints() ?? [...gesture.points],
      button: gesture.button,
      ...(this.port.isSelectionTool(gesture.tool) && gesture.selectionMode
        ? { selectionMode: gesture.selectionMode }
        : {}),
      ...(gesture.tool === "move" ? { offset: this.port.getPaintTarget()?.layerOffset } : {}),
    };
  };

  reset() {
    this.port.clearPointerAction();
    this.transaction?.cancel();
    this.port.cancelCelMovement();
    this.transaction = null;
    this.gesture = null;
  }

  handleContinuationPointerDown(input: PointerInput): DrawingGesturePointerDownRoute {
    const gesture = this.gesture;
    if (!gesture?.controller || gesture.tool !== this.port.getSettings().tool)
      return DrawingGesturePointerDownRoute.Continue;
    if ((input.button ?? 0) !== gesture.button)
      return DrawingGesturePointerDownRoute.CancelActiveGesture;
    const at = point(input);
    this.port.setPointer(at);
    gesture.controller.press(at);
    gesture.points = gesture.controller.points.map((value) => ({ ...value }));
    this.port.publish();
    return DrawingGesturePointerDownRoute.Handled;
  }

  beginGesture(input: PointerInput) {
    this.port.clearPointerAction();
    const initialSettings = this.port.getSettings();
    const initialTarget = this.port.getPaintTarget();
    if (!initialTarget) return;
    if (this.port.handlePointerDownAction(input, initialSettings, initialTarget)) return;

    const settings = this.port.getSettings();
    const target = this.port.getPaintTarget();
    if (!target) return;
    const button = input.button ?? 0;
    const tool = settings.tool;
    const at = tool === "move" ? { x: input.x, y: input.y } : point(input);

    if (tool === "move" && target.positionLocked) {
      this.port.setStatus("Layer position is locked");
      this.port.publish();
      return;
    }
    if (
      !this.port.isSelectionTool(tool) &&
      !target.editable &&
      !(tool === "move" && target.movable)
    ) {
      this.port.setStatus("Layer is hidden or locked");
      this.port.publish();
      return;
    }
    if (tool === "text" && settings.fontHeight === undefined) {
      this.port.setStatus("Select a bitmap font before adding text");
      this.port.publish();
      return;
    }
    if (
      this.port.isSelectionTool(tool) &&
      tool !== "magic_wand" &&
      canMoveSelectionPixels(
        this.port.selectionModeForInput(input, settings.selectionMode ?? SelectionMode.Replace),
        settings.selectionMoveOnAddMode !== false,
        input.actionModifiers?.copySelection !== undefined
          ? input.actionModifiers.copySelection &&
              !(
                input.actionModifiers.addSelection ||
                input.actionModifiers.subtractSelection ||
                input.actionModifiers.intersectSelection
              )
          : !!input.ctrl && !input.shift,
      ) &&
      button === 0 &&
      target.selection &&
      this.port.selectionContains(target.selection, at)
    ) {
      this.port.beginSelectionTransform(
        "move",
        at,
        input.actionModifiers?.copySelection ?? !!input.ctrl,
      );
      return;
    }

    const toolCapabilities = getXpriteToolCapabilities(tool);
    const lastDrawingPoint = this.port.getLastDrawingPoint();
    const lineStart =
      (input.actionModifiers?.straightLineFromLastPoint ?? input.shift) &&
      lastDrawingPoint &&
      toolCapabilities.behavior.connectFreehandStroke
        ? lastDrawingPoint
        : undefined;
    const initialLinePoints = lineStart
      ? new AsepriteLineFreehandController(lineStart).move(
          at,
          input.actionModifiers?.angleSnapFromLastPoint ?? input.physicalCtrl ?? input.ctrl,
        )
      : undefined;
    const lineFreehand = initialLinePoints
      ? new AsepriteLineFreehandController(initialLinePoints[initialLinePoints.length - 1])
      : undefined;
    if (
      tool === "move" &&
      this.port.beginCelMovement(
        input.timelineRangeVisible !== false,
        settings.autoSelectLayer || !!input.actionModifiers?.autoSelectLayer,
      ) === false
    ) {
      this.port.setStatus("Nothing to move");
      this.port.publish();
      return;
    }
    const transaction = this.port.beginTransaction(historyToolLabel(tool));
    if (!transaction) {
      this.port.cancelCelMovement();
      return;
    }

    const gesture: DrawingGestureState = {
      heldSelectionModifiers: this.port.isSelectionTool(tool)
        ? {
            squareAspect: input.actionModifiers?.squareAspect ?? !!input.shift,
            drawFromCenter:
              input.actionModifiers?.drawFromCenter ?? !!(input.physicalCtrl ?? input.ctrl),
            rotateShape: input.actionModifiers?.rotateShape ?? !!input.alt,
          }
        : undefined,
      selectionClick: this.port.isSelectionTool(tool)
        ? {
            start: input.screen ?? at,
            time: input.timeStamp,
            screen: !!input.screen,
            contact:
              input.pointerType === "touch" ||
              input.pointerType === "pen" ||
              input.pointerType === "eraser",
            maxDistance: 0,
            maxX: 0,
            maxY: 0,
          }
        : undefined,
      selectionBase: target.selection,
      selectionMode: this.port.selectionModeForInput(
        input,
        settings.selectionMode ?? SelectionMode.Replace,
      ),
      dynamics: ["pencil", "eraser", "blur"].includes(tool)
        ? new StrokeDynamics(input, settings.dynamics)
        : null,
      speed: { x: 0, y: 0 },
      pressure: brushPressureFromPointer(input),
      previousPressure: brushPressureFromPointer(input),
      sprayRemainder: 0,
      points:
        lineStart && initialLinePoints
          ? [lineStart, initialLinePoints[initialLinePoints.length - 1]]
          : [at],
      button,
      tool,
      lineFreehand,
      startOffset: target.layerOffset,
      painted: false,
      coverage: new Set(),
      indexedPixelWriter: this.port.createAsepriteIndexWriter(button),
      manualTilemapBase: this.port.getManualTilemapBase(),
      pixelPerfect:
        settings.pixelPerfect &&
        this.port.supportsPixelPerfect(settings) &&
        (tool === "pencil" || tool === "eraser" || tool === "blur")
          ? new PixelPerfectStroke(pixelPerfectInk(tool))
          : null,
      fillPixelPerfect:
        settings.pixelPerfect &&
        this.port.supportsPixelPerfect(settings) &&
        (tool === "lasso" || tool === "contour")
          ? new PixelPerfectPath()
          : null,
    };

    if (
      tool !== "spray" &&
      settings.brush.shape === "image" &&
      settings.brush.image?.pattern === BrushImagePattern.AlignedToDestination
    ) {
      const firstPoint = initialLinePoints?.[0] ?? at;
      const bounds = brushMask(settings.brush);
      gesture.brushPatternOrigin = {
        x: firstPoint.x + bounds.x,
        y: firstPoint.y + bounds.y,
      };
    }
    if (lineFreehand) gesture.dynamics?.disableStabilizer();
    if (isTwoPointShape(tool)) {
      gesture.twoPoints = new LibreSpriteTwoPointsController(
        at,
        tool === "line" || tool === "gradient",
        supportsCornerRadius(tool)
          ? {
              cornerRadius:
                (tool === "marquee"
                  ? settings.selectionCornerRadius
                  : settings.rectangleCornerRadius) ?? 0,
            }
          : undefined,
      );
      gesture.points = gesture.twoPoints.points.map((value) => ({ ...value }));
    }
    if (tool === "curve" || tool === "polygon" || tool === "polygonal_lasso") {
      gesture.controller = new AsepriteShapeController(
        tool === "curve" ? "curve" : "polygon",
        input.pointerType === "touch",
      );
      gesture.controller.press(at);
      gesture.points = gesture.controller.points.map((value) => ({ ...value }));
    }
    gesture.fillPixelPerfect?.join([at]);
    this.gesture = gesture;
    this.transaction = transaction;
    this.port.setPointer(at);

    if (hasWrotePixelStroke(tool)) {
      if (
        !this.port.draw(
          gesture,
          initialLinePoints ?? [at],
          tool,
          button,
          lineFreehand ? PixelPerfectTracePolicy.Last : PixelPerfectTracePolicy.Accumulate,
        )
      ) {
        this.cancelAfterDrawFailure();
        return;
      }
      gesture.painted = true;
      this.port.refreshManualTilemapPreview(gesture);
    }
    this.port.publish(gesture.painted);
  }

  moveGesture(input: PointerInput) {
    const gesture = this.gesture;
    if (!gesture) {
      this.port.updateIdlePointer(input);
      return;
    }
    const settings = this.port.getSettings();
    const current =
      gesture.tool === "move"
        ? { x: input.x, y: input.y }
        : (gesture.dynamics?.update(input) ?? point(input));
    if (gesture.tool === "spray" || gesture.tool === "jumble") {
      gesture.previousPressure = gesture.pressure;
      gesture.pressure = brushPressureFromPointer(input);
    }
    this.port.setPointer(current);
    if (gesture.selectionClick) this.updateSelectionClick(gesture.selectionClick, input, current);
    if (gesture.twoPoints) {
      const held = gesture.heldSelectionModifiers;
      const squareAspect =
        gesture.tool === "line" || gesture.tool === "gradient"
          ? (input.actionModifiers?.angleSnap ?? input.shift)
          : (input.actionModifiers?.squareAspect ?? input.shift);
      const fromCenter = input.actionModifiers?.drawFromCenter ?? input.physicalCtrl ?? input.ctrl;
      const rotate = input.actionModifiers?.rotateShape ?? input.alt;
      if (held) {
        held.squareAspect &&= !!squareAspect;
        held.drawFromCenter &&= !!fromCenter;
        held.rotateShape &&= !!rotate;
      }
      gesture.twoPoints.move(current, {
        squareAspect: squareAspect && !held?.squareAspect,
        fromCenter: fromCenter && !held?.drawFromCenter,
        rotate: rotate && !held?.rotateShape,
        moveOrigin: input.actionModifiers?.moveOrigin ?? input.space,
        cornerRadius: input.actionModifiers?.cornerRadius,
      });
      if (input.actionModifiers?.cornerRadius && supportsCornerRadius(gesture.tool))
        this.port.updateCornerRadius(gesture.twoPoints.cornerRadius);
      gesture.points = gesture.twoPoints.points.map((value) => ({ ...value }));
      this.port.publish();
      return;
    }
    if (gesture.controller) {
      gesture.controller.move(current, {
        moveOrigin: input.actionModifiers?.moveOrigin ?? input.space,
      });
      gesture.points = gesture.controller.points.map((value) => ({ ...value }));
      this.port.publish();
      return;
    }
    if (gesture.lineFreehand) {
      const previous = gesture.lineFreehand.getLastPoint();
      const segment = gesture.lineFreehand.move(
        current,
        input.actionModifiers?.angleSnapFromLastPoint ?? input.physicalCtrl ?? input.ctrl,
      );
      const next = gesture.lineFreehand.getLastPoint();
      const brush = gesture.dynamics?.brush(settings.brush);
      const changedBrush =
        brush &&
        gesture.previousBrush &&
        (brush.size !== gesture.previousBrush.size || brush.angle !== gesture.previousBrush.angle);
      const changedGradient =
        gesture.dynamics && gesture.previousGradient !== gesture.dynamics.gradient();
      if (
        previous.x === next.x &&
        previous.y === next.y &&
        !changedBrush &&
        !changedGradient &&
        gesture.tool !== "spray" &&
        gesture.tool !== "jumble"
      )
        return;
      gesture.points = [gesture.lineFreehand.getStartPoint(), gesture.lineFreehand.getLastPoint()];
      if (gesture.tool === "jumble")
        gesture.speed = { x: current.x - previous.x, y: current.y - previous.y };
      if (
        !this.port.draw(
          gesture,
          segment,
          gesture.tool,
          gesture.button,
          PixelPerfectTracePolicy.Last,
        )
      ) {
        this.cancelAfterDrawFailure();
        return;
      }
      gesture.painted = true;
      this.port.refreshManualTilemapPreview(gesture);
      this.port.publish(true);
      return;
    }

    const previous = gesture.points[gesture.points.length - 1];
    const brush = gesture.dynamics?.brush(settings.brush);
    const changedBrush =
      brush &&
      gesture.previousBrush &&
      (brush.size !== gesture.previousBrush.size || brush.angle !== gesture.previousBrush.angle);
    const changedGradient =
      gesture.dynamics && gesture.previousGradient !== gesture.dynamics.gradient();
    if (
      previous.x === current.x &&
      previous.y === current.y &&
      !changedBrush &&
      !changedGradient &&
      gesture.tool !== "spray" &&
      gesture.tool !== "jumble"
    )
      return;

    gesture.fillPixelPerfect?.join(
      [previous, current],
      PixelPerfectTracePolicy.Accumulate,
      gesture.tool === "contour"
        ? {
            brush: settings.brush,
            brushAngleStatic: (gesture.dynamics?.settings?.angle ?? "static") === "static",
          }
        : undefined,
    );
    if (gesture.tool === "lasso" || gesture.tool === "contour") gesture.points.push(current);
    else gesture.points = [gesture.points[0], current];
    if (gesture.tool === "move") {
      let dx = current.x - gesture.points[0].x;
      let dy = current.y - gesture.points[0].y;
      if (input.actionModifiers?.lockAxis) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      this.port.setLayerOffset({
        x: gesture.startOffset.x + dx,
        y: gesture.startOffset.y + dy,
      });
      gesture.painted = true;
    } else if (["pencil", "spray", "eraser", "blur", "jumble"].includes(gesture.tool)) {
      if (gesture.tool === "jumble")
        gesture.speed = { x: current.x - previous.x, y: current.y - previous.y };
      if (!this.port.draw(gesture, [previous, current], gesture.tool, gesture.button)) {
        this.cancelAfterDrawFailure();
        return;
      }
      gesture.painted = true;
      this.port.refreshManualTilemapPreview(gesture);
    }
    this.port.publish(gesture.painted);
  }

  endGesture(input?: PointerInput) {
    this.port.clearPointerAction();
    if (input) {
      const gesture = this.gesture;
      const finalInput = gesture?.dynamics
        ? gesture.dynamics.releaseInput(input)
        : gesture && (gesture.tool === "spray" || gesture.tool === "jumble")
          ? { ...input, pressure: gesture.pressure }
          : input;
      this.moveGesture(this.port.preparePointerMove(finalInput));
    }
    const gesture = this.gesture;
    const transaction = this.transaction;
    if (!gesture || !transaction) return;
    if (gesture.tool === "text" && input && gesture.button !== (input.button ?? 0)) {
      this.cancelGesture();
      return;
    }
    if (
      gesture.controller?.release(
        this.port.getPointer() ?? gesture.points[gesture.points.length - 1],
      )
    ) {
      this.port.publish();
      return;
    }

    const clearSelectionClick = this.isReplaceSelectionClick(gesture, input);
    if (clearSelectionClick) {
      const error = this.port.applySelection(gesture, true);
      if (error) {
        this.cancelForSelectionError(transaction, error);
        return;
      }
      this.commitGesture(gesture, transaction, true);
      this.port.setStatus("Ready");
      this.port.publish();
      return;
    }

    if (isShapeCommitTool(gesture.tool)) {
      const points = gesture.fillPixelPerfect?.getPoints() ?? gesture.points;
      if (!this.port.draw(gesture, [...points], gesture.tool, gesture.button)) {
        this.cancelAfterDrawFailure();
        return;
      }
      gesture.painted = true;
      this.port.refreshManualTilemapPreview(gesture);
    } else if (this.port.isSelectionTool(gesture.tool)) {
      const error = this.port.applySelection(gesture, false);
      if (error) {
        this.cancelForSelectionError(transaction, error);
        return;
      }
    }

    const capabilities = getXpriteToolCapabilities(gesture.tool);
    let lastPointCommand: HistoryCommand | undefined;
    if (gesture.painted && capabilities.behavior.connectFreehandStroke) {
      const last =
        gesture.lineFreehand?.getLastPoint() ?? gesture.points[gesture.points.length - 1];
      if (last) lastPointCommand = this.port.setLastDrawingPoint(last);
    }
    this.gesture = null;
    this.transaction = null;

    const lastDrawingPoint = this.port.getLastDrawingPoint();
    if (
      (input?.actionModifiers?.straightLineFromLastPoint ?? input?.shift) &&
      gesture.painted &&
      lastDrawingPoint &&
      capabilities.behavior.connectFreehandStroke
    ) {
      const controller = new AsepriteLineFreehandController(lastDrawingPoint);
      controller.move(
        this.port.getPointer() ?? lastDrawingPoint,
        input?.actionModifiers?.angleSnapFromLastPoint ?? input?.physicalCtrl ?? input?.ctrl,
      );
      this.port.setLineFreehandPreview({
        start: controller.getStartPoint(),
        end: controller.getLastPoint(),
        button: gesture.button,
        tool: gesture.tool,
      });
    }

    if (
      (hasWrotePixelStroke(gesture.tool) || isShapeCommitTool(gesture.tool)) &&
      !gesture.wrotePixels
    ) {
      if (lastPointCommand) transaction.commit({ extraCommands: [lastPointCommand] });
      else transaction.cancel();
      this.port.setStatus("Ready");
      this.port.publish(true);
      return;
    }

    const target = this.port.getPaintTarget();
    if (gesture.painted && gesture.tool !== "move" && target && !this.port.isTilemapTarget())
      this.port.prepareRasterForCommit();
    const manualTilemapPreview =
      gesture.manualTilemapPreviewTimeline &&
      gesture.manualTilemapBase &&
      this.port.manualTilemapPreviewChanged(
        gesture.manualTilemapBase,
        gesture.manualTilemapPreviewTimeline,
      )
        ? gesture.manualTilemapPreviewTimeline
        : undefined;
    if (gesture.tool === "move") this.port.endCelMovement();
    transaction.commit({
      replacesSelection: this.port.isSelectionTool(gesture.tool),
      extraCommands: lastPointCommand ? [lastPointCommand] : [],
      manualTilemapPreview,
    });

    if (gesture.tool === "text" && this.port.getSettings().fontHeight !== undefined && target) {
      this.port.beginInlineText(
        inlineTextBox(
          gesture.points[0],
          gesture.points[gesture.points.length - 1],
          this.port.getSettings().fontHeight!,
          this.port.getSettings().textScale,
          target.width,
        ),
      );
      return;
    }

    const resultTarget = this.port.getPaintTarget();
    this.port.setStatus(
      gesture.tool === "move" && resultTarget
        ? `Cel offset ${resultTarget.layerOffset.x}, ${resultTarget.layerOffset.y}`
        : "Ready",
    );
    this.port.publish(gesture.painted);
  }

  cancelGesture() {
    this.port.clearPointerAction();
    const gesture = this.gesture;
    const transaction = this.transaction;
    if (!gesture) return;
    this.gesture = null;
    this.transaction = null;
    transaction?.cancel();
    this.port.cancelCelMovement();
    this.port.publish(gesture.painted);
  }

  /** Interrupted touch navigation retains accepted multi-point draft geometry. */
  cancelPointerGesture() {
    const gesture = this.gesture;
    if (gesture?.controller?.cancelTouchStep()) {
      gesture.points = gesture.controller.points.map((value) => ({ ...value }));
      this.port.publish();
      return;
    }
    this.cancelGesture();
  }

  capturePixelWrite(image: PixelBuffer, rect: Rect) {
    this.transaction?.capture(image, rect);
  }

  reportDrawFailure(error: Error) {
    this.port.reportDrawFailure(error);
  }

  shouldFinishInterruptedStroke(): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    return (
      (hasWrotePixelStroke(gesture.tool) && !!gesture.wrotePixels) ||
      (gesture.tool === "move" && gesture.painted)
    );
  }

  shouldFinishInterruptedSelection(): boolean {
    const gesture = this.gesture;
    return !!(
      gesture &&
      this.port.isSelectionTool(gesture.tool) &&
      gesture.tool !== "magic_wand" &&
      gesture.selectionClick &&
      (gesture.selectionClick.maxX >= 4 || gesture.selectionClick.maxY >= 4)
    );
  }

  private updateSelectionClick(
    click: NonNullable<DrawingGestureState["selectionClick"]>,
    input: PointerInput,
    current: Point,
  ) {
    const at = click.screen ? input.screen : current;
    if (!at) return;
    click.maxDistance = Math.max(
      click.maxDistance,
      Math.hypot(at.x - click.start.x, at.y - click.start.y),
    );
    click.maxX = Math.max(click.maxX, Math.abs(at.x - click.start.x));
    click.maxY = Math.max(click.maxY, Math.abs(at.y - click.start.y));
  }

  private isReplaceSelectionClick(gesture: DrawingGestureState, input?: PointerInput): boolean {
    const click = gesture.selectionClick;
    const justClicked =
      click &&
      ((click.maxX === 0 && click.maxY === 0) ||
        (click.contact && click.screen && click.maxDistance <= SELECTION_CONTACT_CLICK_SLOP) ||
        (click.screen &&
          click.maxX < SELECTION_MOUSE_CLICK_SLOP &&
          click.maxY < SELECTION_MOUSE_CLICK_SLOP &&
          click.time !== undefined &&
          input?.timeStamp !== undefined &&
          input.timeStamp - click.time < SELECTION_MOUSE_CLICK_DURATION_MS));
    return !!(
      this.port.isSelectionTool(gesture.tool) &&
      gesture.tool !== "magic_wand" &&
      justClicked &&
      (gesture.selectionMode === SelectionMode.Replace ||
        gesture.selectionMode === SelectionMode.Intersect)
    );
  }

  private commitGesture(
    gesture: DrawingGestureState,
    transaction: DrawingGestureTransaction,
    replacesSelection: boolean,
  ) {
    this.gesture = null;
    this.transaction = null;
    transaction.commit({ replacesSelection });
  }

  private cancelForSelectionError(transaction: DrawingGestureTransaction, message: string) {
    this.gesture = null;
    this.transaction = null;
    transaction.cancel();
    this.port.cancelCelMovement();
    this.port.setStatus(message);
    this.port.publish();
  }

  private cancelAfterDrawFailure() {
    this.gesture = null;
    this.transaction?.cancel();
    this.port.cancelCelMovement();
    this.transaction = null;
    this.port.publish(true);
  }
}
