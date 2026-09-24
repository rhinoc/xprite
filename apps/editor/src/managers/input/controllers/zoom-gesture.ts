import { stepAsepriteZoom, type Point } from "@xprite/editor-core";

const ZOOM_DRAG_THRESHOLD = 8;
const ZOOM_PERCENT = 100;
const SECONDARY_POINTER_BUTTON = 2;

/** Zoom-tool clicks commit on release. Crossing the native GUI-pixel threshold
 * switches to horizontal zoom steps anchored at the original press. */
export class CanvasZoomGesture {
  private moved = false;

  constructor(
    readonly origin: Point,
    private readonly initialZoom: number,
    private readonly button: number,
  ) {}

  move(point: Point): number | null {
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    if (!this.moved && Math.hypot(dx, dy) <= ZOOM_DRAG_THRESHOLD) return null;
    this.moved = true;
    return (
      stepAsepriteZoom(this.initialZoom * ZOOM_PERCENT, Math.trunc(dx / ZOOM_DRAG_THRESHOLD)) /
      ZOOM_PERCENT
    );
  }

  finish(point: Point): number {
    const zoom = this.move(point);
    return (
      zoom ??
      stepAsepriteZoom(
        this.initialZoom * ZOOM_PERCENT,
        this.button === SECONDARY_POINTER_BUTTON ? -1 : 1,
      ) / ZOOM_PERCENT
    );
  }
}
