import type { PointerInput } from "$/base/pointer-input";
import {
  DrawingGestureController,
  DrawingGesturePointerDownRoute,
} from "$/drawing/gesture-controller";
import type { SelectionController } from "$/selection/controller";
import type { SpriteSliceController } from "$/sprite/slice-controller";
import type { TilemapGestureController } from "$/tilemap/gesture-controller";

export enum EditorInputOwner {
  None = "none",
  Slice = "slice",
  TilemapSelection = "tilemap-selection",
  TilemapStroke = "tilemap-stroke",
  EditorPriority = "editor-priority",
  DrawingGesture = "drawing-gesture",
  GridSelection = "grid-selection",
}

export enum PointerDownRoute {
  Continue = "continue",
  Handled = "handled",
  CancelActiveGesture = "cancel-active-gesture",
}

/**
 * Adapter for the editor-owned interaction state that has not moved into a
 * feature controller yet. Individual callbacks keep the router independent
 * from RasterEditor and its document implementation.
 */
export interface EditorInputHandlerPort {
  preparePointerDown(input: PointerInput): PointerInput;
  handlePriorityPointerDown(input: PointerInput): PointerDownRoute;
  prepareNewGesture(input: PointerInput): void;
  prepareEditorPointerMove(input: PointerInput): PointerInput;
  hasDocument(): boolean;
  isSliceToolActive(): boolean;
  isEyedropperToolActive(input: PointerInput): boolean;
  isGridSelectionToolActive?(): boolean;
  isTilemapTilesModeActive(): boolean;
  moveEditorPriorityGesture(input: PointerInput): boolean;
  endEditorPriorityGesture(input?: PointerInput): boolean;
  hasEditorPriorityGesture(): boolean;
  cancelEditorPriorityGesture(): void;
  cancelEditorPointerDrag(): boolean;
}

/**
 * Routes pointer input by feature priority and owns the current gesture
 * lifecycle. Feature controllers receive only their own handlers and state;
 * the router never receives an editor instance.
 */
export class EditorInputRouter {
  private activeOwner = EditorInputOwner.None;
  private eyedropperOwner: EditorInputOwner.DrawingGesture | EditorInputOwner.TilemapStroke | null =
    null;

  constructor(
    private readonly slices: Pick<
      SpriteSliceController,
      "beginGesture" | "updateGesture" | "endGesture" | "cancelGesture" | "isGestureActive"
    >,
    private readonly tilemap: Pick<
      TilemapGestureController,
      | "beginGesture"
      | "updateGesture"
      | "endGesture"
      | "cancelGesture"
      | "isGestureActive"
      | "beginSelectionTransform"
      | "updateSelectionTransform"
      | "endSelectionTransform"
      | "cancelSelectionTransform"
      | "isSelectionTransformActive"
    >,
    private readonly drawing: Pick<
      DrawingGestureController,
      | "beginGesture"
      | "moveGesture"
      | "endGesture"
      | "cancelGesture"
      | "cancelPointerGesture"
      | "isGestureActive"
      | "handleContinuationPointerDown"
    >,
    private readonly editor: EditorInputHandlerPort,
    private readonly selection?: Pick<
      SelectionController,
      | "beginGridGesture"
      | "updateGridGesture"
      | "endGridGesture"
      | "cancelGridGesture"
      | "isGridGestureActive"
    >,
  ) {}

  getActiveOwner = (): EditorInputOwner => this.refreshOwner();

  reset() {
    this.cancelEyedropper();
    this.selection?.cancelGridGesture();
    this.activeOwner = EditorInputOwner.None;
  }

  pointerDown(rawInput: PointerInput) {
    this.cancelEyedropper();
    if (this.editor.isEyedropperToolActive(rawInput)) {
      this.editor.preparePointerDown(rawInput);
      if (!this.editor.hasDocument()) return;
      if (this.editor.isTilemapTilesModeActive() && this.tilemap.beginGesture(rawInput))
        this.eyedropperOwner = EditorInputOwner.TilemapStroke;
      else {
        this.drawing.beginGesture(rawInput);
        this.eyedropperOwner = EditorInputOwner.DrawingGesture;
      }
      this.refreshOwner();
      return;
    }
    if (rawInput.clickCount === 2 && this.editor.isGridSelectionToolActive?.()) {
      this.editor.prepareNewGesture(rawInput);
      this.selection?.beginGridGesture(rawInput);
      this.refreshOwner();
      return;
    }
    const input = this.editor.preparePointerDown(rawInput);
    const priority = this.editor.handlePriorityPointerDown(input);
    if (priority === PointerDownRoute.Handled) {
      this.refreshOwner();
      return;
    }
    if (priority === PointerDownRoute.CancelActiveGesture) {
      this.cancelGesture();
      return;
    }
    const drawingPriority = this.drawing.handleContinuationPointerDown(input);
    if (drawingPriority === DrawingGesturePointerDownRoute.Handled) {
      this.refreshOwner();
      return;
    }
    if (drawingPriority === DrawingGesturePointerDownRoute.CancelActiveGesture) {
      this.cancelGesture();
      return;
    }

    this.cancelGesture();
    this.editor.prepareNewGesture(input);
    if (!this.editor.hasDocument()) {
      this.refreshOwner();
      return;
    }

    if (this.editor.isSliceToolActive()) {
      this.slices.beginGesture(input);
      this.refreshOwner();
      return;
    }
    if (this.editor.isTilemapTilesModeActive() && this.tilemap.beginGesture(input)) {
      this.refreshOwner();
      return;
    }

    this.drawing.beginGesture(input);
    this.refreshOwner();
  }

  pointerMove(input: PointerInput) {
    if (this.eyedropperOwner) {
      if (this.eyedropperOwner === EditorInputOwner.TilemapStroke)
        this.tilemap.updateGesture(input);
      else this.drawing.moveGesture(input);
      this.refreshOwner();
      return;
    }
    switch (this.refreshOwner()) {
      case EditorInputOwner.GridSelection:
        this.selection?.updateGridGesture(input);
        break;
      case EditorInputOwner.Slice:
        this.slices.updateGesture(input);
        break;
      case EditorInputOwner.TilemapSelection:
        this.tilemap.updateSelectionTransform(input);
        break;
      case EditorInputOwner.TilemapStroke:
        this.tilemap.updateGesture(input);
        break;
      default: {
        const editorInput = this.editor.prepareEditorPointerMove(input);
        if (this.editor.moveEditorPriorityGesture(editorInput)) break;
        this.drawing.moveGesture(editorInput);
      }
    }
    this.refreshOwner();
  }

  pointerUp(input?: PointerInput) {
    if (this.eyedropperOwner) {
      if (this.eyedropperOwner === EditorInputOwner.TilemapStroke) this.tilemap.endGesture(input);
      else this.drawing.endGesture(input);
      this.eyedropperOwner = null;
      this.refreshOwner();
      return;
    }
    switch (this.refreshOwner()) {
      case EditorInputOwner.GridSelection:
        this.selection?.endGridGesture(input);
        break;
      case EditorInputOwner.Slice:
        this.slices.endGesture(input);
        break;
      case EditorInputOwner.TilemapSelection:
        this.tilemap.endSelectionTransform(input);
        break;
      case EditorInputOwner.TilemapStroke:
        this.tilemap.endGesture(input);
        break;
      default: {
        if (!this.editor.endEditorPriorityGesture(input)) this.drawing.endGesture(input);
      }
    }
    this.refreshOwner();
  }

  /** Pointer-capture loss reverts an in-flight drag but preserves staged paste/text. */
  pointerCancel() {
    if (this.cancelEyedropper()) return;
    if (this.selection?.isGridGestureActive()) {
      this.selection.cancelGridGesture();
      this.refreshOwner();
      return;
    }
    if (this.editor.cancelEditorPointerDrag()) {
      this.refreshOwner();
      return;
    }
    if (this.refreshOwner() === EditorInputOwner.DrawingGesture) {
      this.drawing.cancelPointerGesture();
      this.refreshOwner();
      return;
    }
    this.cancelGesture();
  }

  /** Explicit gesture cancellation (for example Escape) cancels the active feature. */
  cancelGesture() {
    if (this.cancelEyedropper()) return;
    const owner = this.refreshOwner();
    if (owner === EditorInputOwner.GridSelection) this.selection?.cancelGridGesture();
    else if (owner === EditorInputOwner.Slice) this.slices.cancelGesture();
    else if (owner === EditorInputOwner.TilemapSelection) this.tilemap.cancelSelectionTransform();
    else if (owner === EditorInputOwner.TilemapStroke) this.tilemap.cancelGesture();
    else if (owner === EditorInputOwner.DrawingGesture) this.drawing.cancelGesture();
    else this.editor.cancelEditorPriorityGesture();
    this.refreshOwner();
  }

  private cancelEyedropper(): boolean {
    const owner = this.eyedropperOwner;
    if (!owner) return false;
    this.eyedropperOwner = null;
    if (owner === EditorInputOwner.TilemapStroke) this.tilemap.cancelGesture();
    else this.drawing.cancelGesture();
    this.refreshOwner();
    return true;
  }

  private refreshOwner(): EditorInputOwner {
    if (this.eyedropperOwner) {
      const active =
        this.eyedropperOwner === EditorInputOwner.TilemapStroke
          ? this.tilemap.isGestureActive()
          : this.drawing.isGestureActive();
      if (active) return (this.activeOwner = this.eyedropperOwner);
      this.eyedropperOwner = null;
    }
    if (this.selection?.isGridGestureActive()) this.activeOwner = EditorInputOwner.GridSelection;
    else if (this.slices.isGestureActive()) this.activeOwner = EditorInputOwner.Slice;
    else if (this.tilemap.isSelectionTransformActive())
      this.activeOwner = EditorInputOwner.TilemapSelection;
    else if (this.tilemap.isGestureActive()) this.activeOwner = EditorInputOwner.TilemapStroke;
    else if (this.editor.hasEditorPriorityGesture())
      this.activeOwner = EditorInputOwner.EditorPriority;
    else if (this.drawing.isGestureActive()) this.activeOwner = EditorInputOwner.DrawingGesture;
    else this.activeOwner = EditorInputOwner.None;
    return this.activeOwner;
  }
}
