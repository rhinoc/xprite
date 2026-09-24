import { clientPoint } from "$/base/utils/dom-geometry";
import { PointerDragActivation, PointerDragAxis } from "$/base/utils/pointer-drag-activation";

type PointerPosition = { clientX: number; clientY: number };

export interface PointerResizeGestureOptions {
  axis: PointerDragAxis.Horizontal | PointerDragAxis.Vertical;
  initialValue: number;
  /** Nonzero client pixels per value unit. Include zoom; negate to reverse growth. Defaults to 1. */
  pixelsPerUnit?: number;
}

/** Shared drag activation and relative value calculation for resize handles. */
export class PointerResizeGesture {
  private readonly activation: PointerDragActivation;
  private readonly startCoordinate: number;
  private readonly pixelsPerUnit: number;

  constructor(
    pointer: PointerPosition & { pointerType: string },
    private readonly options: PointerResizeGestureOptions,
  ) {
    this.activation = new PointerDragActivation(pointer, options.axis);
    this.startCoordinate =
      options.axis === PointerDragAxis.Horizontal ? clientPoint(pointer).x : clientPoint(pointer).y;
    this.pixelsPerUnit = options.pixelsPerUnit ?? 1;
  }

  valueAt(pointer: PointerPosition): number | null {
    if (!this.activation.update(pointer)) return null;
    const coordinate =
      this.options.axis === PointerDragAxis.Horizontal
        ? clientPoint(pointer).x
        : clientPoint(pointer).y;
    return this.options.initialValue + (coordinate - this.startCoordinate) / this.pixelsPerUnit;
  }
}
