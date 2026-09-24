import { EditorAllocationError } from "$/base/errors";
import type { PointerInput } from "$/base/pointer-input";
import type { PixelMask, Point, Rect } from "$/base/primitives";
import { snapPointToGrid } from "$/canvas";
import type { ClipboardController } from "$/clipboard/controller";
import type { FloatingPaste } from "$/clipboard/types";
import type { EditorDocument } from "$/document/types";
import { INLINE_TEXT_MOVE_REGION_PADDING } from "$/drawing";
import type { BitmapTextController } from "$/drawing/text/controller";
import { PointerDownRoute } from "$/editor/input/router";
import { transformClipboardAsepriteSamples } from "$/import-export/aseprite/profile-clipboard";
import {
  dragSelectionTransform,
  rasterizeSelectionTransform,
  type SelectionTransform,
  type SelectionHandle,
} from "$/selection/transform";

interface SelectionTransformDrag {
  start: Point;
  initial: SelectionTransform;
  handle: SelectionHandle;
  floating: FloatingPaste;
  mask: PixelMask;
  fineControlLocked: boolean;
}

interface SelectionBoundsDrag {
  start: Point;
  mask: PixelMask;
}

interface PasteDrag {
  start: Point;
  origin: Point;
}

export interface EditorPriorityGesturePort {
  getDocument(): EditorDocument | null;
  getZoom(): number;
  getSelectionGrid(): { enabled: boolean; bounds: Rect };
  setPointer(point: Point): void;
  beginHistoryTransaction(document: EditorDocument, label: string): void;
  commitHistory(document: EditorDocument): boolean;
  cancelHistoryTransaction(document: EditorDocument): boolean;
  snapInput(input: PointerInput): PointerInput;
  setAllocationError(error: EditorAllocationError | null): void;
  publish(pixelsChanged?: boolean): void;
}

/** Owns cross-domain priority drags while delegating text and paste data to their modules. */
export class EditorPriorityGestureController {
  private transformDrag: SelectionTransformDrag | null = null;
  private selectionBoundsDrag: SelectionBoundsDrag | null = null;
  private pasteDrag: PasteDrag | null = null;

  constructor(
    private readonly text: Pick<
      BitmapTextController,
      | "getDraft"
      | "getDrag"
      | "setDrag"
      | "cancelInlineText"
      | "commitInlineText"
      | "moveInlineText"
    >,
    private readonly clipboard: Pick<
      ClipboardController,
      | "getFloatingPaste"
      | "setFloatingPaste"
      | "getSelectionTransform"
      | "setSelectionTransform"
      | "getTransformedMask"
      | "setTransformedMask"
      | "commitFloatingPaste"
      | "cancelFloatingPaste"
    >,
    private readonly port: EditorPriorityGesturePort,
  ) {}

  reset(): void {
    this.transformDrag = null;
    this.selectionBoundsDrag = null;
    this.pasteDrag = null;
    this.text.setDrag(null);
  }

  clearPasteDrag(): void {
    this.transformDrag = null;
    this.pasteDrag = null;
  }

  beginSelectionBoundsDrag(at: Point, mask: PixelMask): void {
    const document = this.port.getDocument();
    if (!document) return;
    this.port.beginHistoryTransaction(document, "Move Selection Bounds");
    this.selectionBoundsDrag = { start: { ...at }, mask };
  }

  beginSelectionTransformDrag(
    at: PointerInput,
    handle: SelectionHandle,
    transform: SelectionTransform,
    floating: FloatingPaste,
    mask: PixelMask,
  ): void {
    this.transformDrag = {
      start: { ...at },
      initial: transform,
      handle,
      floating,
      mask,
      fineControlLocked: at.actionModifiers?.fineControl ?? at.physicalCtrl ?? !!at.ctrl,
    };
  }

  handlePointerDown(input: PointerInput): PointerDownRoute {
    const draft = this.text.getDraft();
    if (draft) {
      if ((input.button ?? 0) === 2) {
        this.text.cancelInlineText();
        return PointerDownRoute.Handled;
      }
      const bounds = draft.bounds;
      const padding = INLINE_TEXT_MOVE_REGION_PADDING / this.port.getZoom();
      if (
        input.x < bounds.x - padding ||
        input.y < bounds.y - padding ||
        input.x >= bounds.x + bounds.width + padding ||
        input.y >= bounds.y + bounds.height + padding
      ) {
        this.text.commitInlineText();
        return PointerDownRoute.Handled;
      }
      this.text.setDrag({
        start: { x: Math.floor(input.x), y: Math.floor(input.y) },
        origin: { x: bounds.x, y: bounds.y },
        moved: false,
      });
      return PointerDownRoute.Handled;
    }

    const floating = this.clipboard.getFloatingPaste();
    if (!floating) return PointerDownRoute.Continue;
    this.port.setPointer({ x: Math.floor(input.x), y: Math.floor(input.y) });
    if ((input.button ?? 0) !== 0) {
      this.clipboard.cancelFloatingPaste();
      return PointerDownRoute.Handled;
    }
    if (
      input.x >= floating.x &&
      input.y >= floating.y &&
      input.x < floating.x + floating.pixels.width &&
      input.y < floating.y + floating.pixels.height
    ) {
      const transform = this.clipboard.getSelectionTransform();
      if (transform) {
        const mask = this.clipboard.getTransformedMask();
        if (mask) this.beginSelectionTransformDrag(input, "move", transform, floating, mask);
      } else {
        const at = { x: Math.floor(input.x), y: Math.floor(input.y) };
        this.pasteDrag = { start: at, origin: { x: floating.x, y: floating.y } };
      }
      this.port.publish();
      return PointerDownRoute.Handled;
    }
    // Dropping staged pixels forwards the same press to the next input owner.
    if (!this.clipboard.commitFloatingPaste()) return PointerDownRoute.Handled;
    return PointerDownRoute.Continue;
  }

  hasGesture(): boolean {
    return !!(
      this.selectionBoundsDrag ||
      this.text.getDraft() ||
      this.clipboard.getFloatingPaste()
    );
  }

  hasMovedSelectionBounds(): boolean {
    const document = this.port.getDocument();
    return !!(
      this.selectionBoundsDrag &&
      document &&
      document.selection !== this.selectionBoundsDrag.mask
    );
  }

  isSelectionTransformMoveActive(): boolean {
    return this.transformDrag?.handle === "move";
  }

  move(input: PointerInput): boolean {
    const boundsDrag = this.selectionBoundsDrag;
    const document = this.port.getDocument();
    if (boundsDrag && document) {
      let dx = Math.floor(input.x) - boundsDrag.start.x;
      let dy = Math.floor(input.y) - boundsDrag.start.y;
      if (input.actionModifiers?.lockAxis ?? input.shift) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      document.selection = {
        ...boundsDrag.mask,
        x: boundsDrag.mask.x + dx,
        y: boundsDrag.mask.y + dy,
      };
      this.port.setPointer({ x: Math.floor(input.x), y: Math.floor(input.y) });
      this.port.publish();
      return true;
    }

    const draft = this.text.getDraft();
    if (draft) {
      this.port.setPointer({ x: Math.floor(input.x), y: Math.floor(input.y) });
      const drag = this.text.getDrag();
      if (
        drag &&
        Math.hypot(input.x - drag.start.x, input.y - drag.start.y) * this.port.getZoom() >= 5
      ) {
        drag.moved = true;
        this.text.moveInlineText({
          x: drag.origin.x + input.x - drag.start.x,
          y: drag.origin.y + input.y - drag.start.y,
        });
      } else this.port.publish();
      return true;
    }

    const transformDrag = this.transformDrag;
    if (transformDrag) {
      this.port.setPointer({ x: Math.floor(input.x), y: Math.floor(input.y) });
      const fineControlRequested =
        input.actionModifiers?.fineControl ?? input.physicalCtrl ?? !!input.ctrl;
      // Ctrl at pointer-down is a copy gesture. Release it before using fine movement.
      if (!fineControlRequested) transformDrag.fineControlLocked = false;
      let next = dragSelectionTransform(
        transformDrag.initial,
        transformDrag.handle,
        transformDrag.start,
        input,
        transformDrag.handle.startsWith("rotate")
          ? (input.actionModifiers?.angleSnap ?? !!input.shift)
          : (input.actionModifiers?.maintainAspectRatio ?? !!input.shift),
        input.actionModifiers?.scaleFromPivot ?? !!input.alt,
        input.actionModifiers?.lockAxis ?? !!input.shift,
        fineControlRequested && !transformDrag.fineControlLocked,
      );
      if (transformDrag.handle === "move") {
        const grid = this.port.getSelectionGrid();
        if (grid.enabled !== (input.actionModifiers?.snapToGrid ?? !!input.alt)) {
          const origin = snapPointToGrid(grid.bounds, next.bounds),
            dx = origin.x - next.bounds.x,
            dy = origin.y - next.bounds.y;
          next = {
            ...next,
            bounds: { ...next.bounds, x: origin.x, y: origin.y },
            ...(next.pivotPoint
              ? { pivotPoint: { x: next.pivotPoint.x + dx, y: next.pivotPoint.y + dy } }
              : {}),
          };
        }
      }
      const moveDelta = {
        x: next.bounds.x - transformDrag.initial.bounds.x,
        y: next.bounds.y - transformDrag.initial.bounds.y,
      };
      try {
        const reuseRaster =
          transformDrag.handle === "pivot" ||
          (transformDrag.handle === "move" &&
            Number.isInteger(moveDelta.x) &&
            Number.isInteger(moveDelta.y));
        const rendered = reuseRaster
          ? {
              pixels: transformDrag.floating.pixels,
              mask:
                transformDrag.handle === "move"
                  ? {
                      ...transformDrag.mask,
                      x: transformDrag.mask.x + moveDelta.x,
                      y: transformDrag.mask.y + moveDelta.y,
                    }
                  : transformDrag.mask,
            }
          : rasterizeSelectionTransform(next);
        this.clipboard.setSelectionTransform(next);
        this.clipboard.setTransformedMask(rendered.mask);
        if (document) document.selection = rendered.mask;
        this.clipboard.setFloatingPaste({
          ...transformDrag.floating,
          asepriteSamples: reuseRaster
            ? transformDrag.floating.asepriteSamples
            : transformDrag.floating.sourceAsepriteSamples
              ? transformClipboardAsepriteSamples(
                  transformDrag.floating.sourceAsepriteSamples,
                  next,
                  transformDrag.floating.sourceTransparentIndex,
                )
              : undefined,
          pixels: rendered.pixels,
          x: rendered.mask.x,
          y: rendered.mask.y,
        });
        this.port.setAllocationError(null);
      } catch (error) {
        if (!(error instanceof EditorAllocationError)) throw error;
        this.port.setAllocationError(error);
      }
      this.port.publish();
      return true;
    }

    const floating = this.clipboard.getFloatingPaste();
    if (!floating) return false;
    const at = { x: Math.floor(input.x), y: Math.floor(input.y) };
    this.port.setPointer(at);
    const pasteDrag = this.pasteDrag;
    if (pasteDrag) {
      let dx = at.x - pasteDrag.start.x;
      let dy = at.y - pasteDrag.start.y;
      if (input.actionModifiers?.lockAxis) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      this.clipboard.setFloatingPaste({
        ...floating,
        x: pasteDrag.origin.x + dx,
        y: pasteDrag.origin.y + dy,
      });
    }
    this.port.publish();
    return true;
  }

  end(input?: PointerInput): boolean {
    const boundsDrag = this.selectionBoundsDrag;
    const document = this.port.getDocument();
    if (boundsDrag && document) {
      if (input) this.move(this.port.snapInput(input));
      this.port.commitHistory(document);
      this.selectionBoundsDrag = null;
      this.port.publish();
      return true;
    }
    if (this.text.getDraft()) {
      if (input) this.move(this.port.snapInput(input));
      const drag = this.text.getDrag();
      const clickedMoveArea = !!drag && !drag.moved;
      this.text.setDrag(null);
      // A click in the enlarged move region drops; a drag relocates the draft.
      if (clickedMoveArea) this.text.commitInlineText();
      return true;
    }
    if (this.clipboard.getFloatingPaste()) {
      if (input) this.move(this.port.snapInput(input));
      this.pasteDrag = null;
      this.transformDrag = null;
      this.port.publish();
      return true;
    }
    return false;
  }

  cancelPointerDrag(): boolean {
    const drag = this.text.getDrag();
    if (drag && this.text.getDraft()) {
      this.text.moveInlineText(drag.origin);
      this.text.setDrag(null);
      this.port.publish();
      return true;
    }
    if (this.transformDrag) {
      this.clipboard.setSelectionTransform(this.transformDrag.initial);
      this.clipboard.setFloatingPaste(this.transformDrag.floating);
      this.clipboard.setTransformedMask(this.transformDrag.mask);
      const document = this.port.getDocument();
      if (document) document.selection = this.transformDrag.mask;
      this.transformDrag = null;
      this.port.publish();
      return true;
    }
    if (this.pasteDrag) {
      const floating = this.clipboard.getFloatingPaste();
      if (floating) this.clipboard.setFloatingPaste({ ...floating, ...this.pasteDrag.origin });
      this.pasteDrag = null;
      this.port.publish();
      return true;
    }
    return !!(this.text.getDraft() || this.clipboard.getFloatingPaste());
  }

  cancelGesture(): boolean {
    const document = this.port.getDocument();
    if (this.selectionBoundsDrag && document) {
      this.port.cancelHistoryTransaction(document);
      this.selectionBoundsDrag = null;
      this.port.publish();
      return true;
    }
    if (this.text.getDraft()) {
      this.text.cancelInlineText();
      return true;
    }
    if (this.clipboard.getFloatingPaste()) {
      this.clipboard.cancelFloatingPaste();
      return true;
    }
    return false;
  }
}
