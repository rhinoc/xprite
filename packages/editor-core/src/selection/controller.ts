import { UINT8_MAX } from "$/base/numeric-constants";
import type { PointerInput } from "$/base/pointer-input";
import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import type { Point } from "$/base/primitives";
import type { Rect } from "$/base/primitives";
import type { EditorTool } from "$/drawing/tool-settings";
import { FlipOrientation } from "$/image-editing/transform";
import {
  canSelectCelContent as canSelectCelContentFromProjection,
  celContentSelection,
  type CelContentColorReference,
  type CelContentSelectionProjection,
} from "$/selection/cel-content";
import { SelectionEditController, type SelectionEditPort } from "$/selection/edit-controller";
import {
  combineColorRangeSelection,
  invertedSelection,
  layerColorRangeSelection,
  modifySelection,
  combineSelection,
  rectangleSelection,
  selectionModeForInput,
} from "$/selection/operations";
import type { SelectionHandle } from "$/selection/transform";
import { SelectionTransformController } from "$/selection/transform-controller";
import { SelectionMode, type SelectionModifier } from "$/selection/types";

const GRID_SELECTION_HISTORY_LABEL = "Rectangular Marquee";

export interface SelectionControllerData {
  readonly width: number;
  readonly height: number;
  readonly selection: PixelMask | null;
  readonly hiddenSelection: PixelMask | null;
  readonly grid?: Rect;
  readonly colorRangeSource: {
    readonly pixels: PixelBuffer;
    readonly x: number;
    readonly y: number;
  } | null;
}

export interface SelectionControllerChange {
  readonly selection?: PixelMask | null;
  readonly hiddenSelection?: PixelMask | null;
}

export interface ColorRangePreview {
  readonly color: Rgba;
  readonly tolerance: number;
  readonly mode: SelectionMode;
  readonly preview?: boolean;
}

/** Narrow editor boundary for committed mask changes and transient previews. */
export interface SelectionControllerPort {
  readSelectionData(): SelectionControllerData | null;
  readCelContent(): CelContentSelectionProjection | null;
  readCelContentColorReference(): CelContentColorReference | null;
  readPreview(): PixelMask | null;
  getSelectionMode(): SelectionMode;
  resolvePendingCel(): boolean;
  commitHistoryTransaction(
    label: string,
    change: SelectionControllerChange,
    replacesSelection: boolean,
  ): void;
  setTool(tool: EditorTool): void;
  setStatus(message: string): void;
  setPreview(preview: PixelMask | null | undefined): void;
  publish(): void;
}

export class SelectionController {
  private gridGesture: {
    start: Point;
    grid: Rect;
    base: PixelMask | null;
  } | null = null;
  private readonly editing: SelectionEditController;
  private transforms?: SelectionTransformController;

  constructor(
    private readonly port: SelectionControllerPort,
    editPort: SelectionEditPort,
    private readonly createTransformController: () => SelectionTransformController,
  ) {
    this.editing = new SelectionEditController(editPort);
  }

  isGridGestureActive(): boolean {
    return this.gridGesture !== null;
  }

  beginGridGesture(input: PointerInput): boolean {
    if (!this.port.resolvePendingCel()) return false;
    const data = this.port.readSelectionData();
    if (!data?.grid || data.grid.width <= 0 || data.grid.height <= 0) return false;
    this.gridGesture = { start: input, grid: { ...data.grid }, base: data.selection };
    this.updateGridGesture(input);
    return true;
  }

  updateGridGesture(input: PointerInput): void {
    const gesture = this.gridGesture;
    const data = this.port.readSelectionData();
    if (!gesture || !data) return;
    const { grid, start } = gesture;
    const tile = (at: Point) => ({
      x: grid.x + Math.floor((at.x - grid.x) / grid.width) * grid.width,
      y: grid.y + Math.floor((at.y - grid.y) / grid.height) * grid.height,
    });
    const first = tile(start),
      last = tile(input);
    const incoming = rectangleSelection(
      { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y) },
      {
        x: Math.max(first.x, last.x) + grid.width - 1,
        y: Math.max(first.y, last.y) + grid.height - 1,
      },
      data.width,
      data.height,
    );
    this.port.setPreview(
      combineSelection(
        gesture.base,
        incoming,
        selectionModeForInput(this.port.getSelectionMode(), input),
        data.width,
        data.height,
      ),
    );
    this.port.publish();
  }

  endGridGesture(input?: PointerInput): void {
    if (!this.gridGesture) return;
    if (input) this.updateGridGesture(input);
    const selection = this.port.readPreview();
    this.gridGesture = null;
    this.port.setPreview(undefined);
    this.port.commitHistoryTransaction(
      GRID_SELECTION_HISTORY_LABEL,
      { selection, hiddenSelection: null },
      true,
    );
  }

  cancelGridGesture(): void {
    if (!this.gridGesture) return;
    this.gridGesture = null;
    this.port.setPreview(undefined);
    this.port.publish();
  }

  beginTransform(handle: SelectionHandle, at: PointerInput, copy = false): boolean {
    this.transforms ??= this.createTransformController();
    return this.transforms.begin(handle, at, copy);
  }

  canRotateSelection(): boolean {
    return this.editing.canRotateSelection();
  }

  canShiftSelectionContents(): boolean {
    return this.editing.canShiftSelectionContents();
  }

  fillSelection(): boolean {
    return this.editing.fillSelection();
  }

  strokeSelection(): boolean {
    return this.editing.strokeSelection();
  }

  rotateSelection(degrees: number): boolean {
    return this.editing.rotateSelection(degrees);
  }

  shiftSelectionContents(dx: number, dy: number): boolean {
    return this.editing.shiftSelectionContents(dx, dy);
  }

  flipSelection(orientation: FlipOrientation): void {
    this.editing.flipSelection(orientation);
  }

  clearSelectionPixels(keepSelection = false): void {
    this.editing.clearSelectionPixels(keepSelection);
  }

  nudgeSelection(dx: number, dy: number, boundsOnly = false): boolean {
    return this.editing.nudgeSelection(dx, dy, boundsOnly);
  }

  hasSelection(): boolean {
    return !!this.port.readSelectionData()?.selection;
  }

  canReselect(): boolean {
    const data = this.port.readSelectionData();
    return !!data && !data.selection && !!data.hiddenSelection;
  }

  canColorRange(): boolean {
    return !!this.port.readSelectionData()?.colorRangeSource;
  }

  canSelectCelContent(): boolean {
    return canSelectCelContentFromProjection(this.port.readCelContent());
  }

  preview(): PixelMask | null {
    return this.port.readPreview();
  }

  invert(): void {
    const data = this.port.readSelectionData();
    if (!data) return;
    this.port.commitHistoryTransaction(
      "Invert Selection",
      { selection: invertedSelection(data.width, data.height, data.selection) },
      true,
    );
  }

  selectAll(): void {
    const data = this.port.readSelectionData();
    if (!data) return;
    this.port.commitHistoryTransaction(
      "Select All",
      {
        selection: {
          x: 0,
          y: 0,
          width: data.width,
          height: data.height,
          data: new Uint8Array(data.width * data.height).fill(UINT8_MAX),
        },
      },
      true,
    );
  }

  reselect(): void {
    const data = this.port.readSelectionData();
    if (!data?.hiddenSelection || data.selection) return;
    this.port.commitHistoryTransaction(
      "Reselect",
      { selection: data.hiddenSelection, hiddenSelection: null },
      false,
    );
  }

  deselect(): void {
    const data = this.port.readSelectionData();
    if (!data) return;
    this.port.commitHistoryTransaction(
      "Deselect",
      {
        selection: null,
        ...(data.selection ? { hiddenSelection: data.selection } : {}),
      },
      false,
    );
  }

  modify(
    operation: SelectionModifier,
    quantity: number,
    brush: "circle" | "square" = "circle",
  ): void {
    const data = this.port.readSelectionData();
    if (!data?.selection) return;
    this.port.commitHistoryTransaction(
      "Modify Selection",
      {
        selection: modifySelection(
          data.selection,
          operation,
          quantity,
          brush,
          data.width,
          data.height,
        ),
        hiddenSelection: null,
      },
      true,
    );
  }

  selectColorRange(color: Rgba, tolerance = 0, mode?: SelectionMode): void {
    if (!this.canColorRange() || !this.port.resolvePendingCel()) return;
    const data = this.port.readSelectionData();
    if (!data?.colorRangeSource) return;
    let selection: PixelMask | null;
    try {
      selection = combineColorRangeSelection(
        data.selection,
        layerColorRangeSelection(data.colorRangeSource, color, tolerance),
        mode ?? this.port.getSelectionMode() ?? SelectionMode.Replace,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.port.setStatus(error.message);
      this.port.publish();
      return;
    }
    this.port.commitHistoryTransaction("Color Range", { selection, hiddenSelection: null }, true);
  }

  previewColorRange(values: ColorRangePreview | null): void {
    const data = this.port.readSelectionData();
    try {
      this.port.setPreview(
        values && values.preview !== false && data?.colorRangeSource
          ? combineColorRangeSelection(
              data.selection,
              layerColorRangeSelection(data.colorRangeSource, values.color, values.tolerance),
              values.mode,
            )
          : undefined,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.port.setPreview(undefined);
      this.port.setStatus(error.message);
    }
    this.port.publish();
  }

  selectCelContent(): boolean {
    if (!this.port.resolvePendingCel()) return false;
    const source = this.port.readCelContent();
    if (!canSelectCelContentFromProjection(source) || !source) return false;
    const reference = source.layer.background ? this.port.readCelContentColorReference() : null;
    const selection = celContentSelection(source, reference);
    if (!selection) return false;
    this.port.commitHistoryTransaction(
      "Transform Selection",
      { selection, hiddenSelection: null },
      true,
    );
    this.port.setTool("marquee");
    this.port.publish();
    return true;
  }
}
