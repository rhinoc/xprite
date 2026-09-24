import { clientPoint } from "$/base/utils/dom-geometry";
const TOUCH_DRAG_THRESHOLD = 8;
const POINTER_DRAG_THRESHOLD = 1;

export enum PointerDragAxis {
  Horizontal = "horizontal",
  Vertical = "vertical",
  Both = "both",
}

type PointerPosition = { clientX: number; clientY: number };

/** Ignore tap jitter until movement reaches the threshold on the relevant axis. */
export class PointerDragActivation {
  private started = false;
  private readonly threshold: number;
  private readonly x: number;
  private readonly y: number;

  constructor(
    pointer: PointerPosition & { pointerType: string },
    private readonly axis = PointerDragAxis.Both,
  ) {
    this.x = clientPoint(pointer).x;
    this.y = clientPoint(pointer).y;
    this.threshold =
      pointer.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : POINTER_DRAG_THRESHOLD;
  }

  update(pointer: PointerPosition): boolean {
    if (this.started) return true;
    const dx = clientPoint(pointer).x - this.x;
    const dy = clientPoint(pointer).y - this.y;
    const distance =
      this.axis === PointerDragAxis.Horizontal
        ? Math.abs(dx)
        : this.axis === PointerDragAxis.Vertical
          ? Math.abs(dy)
          : Math.hypot(dx, dy);
    this.started = distance >= this.threshold;
    return this.started;
  }
}
