import { clientPoint, clientToLocal, layoutSize, type GeometryPoint } from "@xprite/ui/utils";

const MAX_PITCH = (5 * Math.PI) / 180;
const MAX_YAW = (7 * Math.PI) / 180;
const FOLLOW_MILLISECONDS = 160;
const MAX_FRAME_MILLISECONDS = 100;
const SETTLED_RADIANS = 0.00001;
const MOUSE_POINTER_TYPE = "mouse";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOUSE_QUERY = "(any-hover: hover) and (any-pointer: fine)";

interface TiltBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pointer motion remains independent of the film clock, including while paused. */
export class IpadPointerTilt {
  readonly rotation = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };
  private pendingPoint?: GeometryPoint;
  private bounds: TiltBounds = { x: 0, y: 0, width: 1, height: 1 };
  private previousTime = performance.now();
  private readonly reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  private readonly mouse = window.matchMedia(MOUSE_QUERY);

  constructor(
    private readonly host: HTMLElement,
    private readonly changed: () => void,
    private readonly enabled: () => boolean,
  ) {
    // The overflow canvas does not receive pointer events or block page controls.
    window.addEventListener("pointermove", this.move, { passive: true });
    window.addEventListener("pointerout", this.leave);
    window.addEventListener("pointercancel", this.reset);
    window.addEventListener("blur", this.reset);
    document.addEventListener("visibilitychange", this.reset);
    this.reducedMotion.addEventListener("change", this.reset);
    this.mouse.addEventListener("change", this.reset);
  }

  private move = (event: PointerEvent) => {
    if (
      event.pointerType !== MOUSE_POINTER_TYPE ||
      !this.enabled() ||
      this.reducedMotion.matches ||
      !this.mouse.matches
    ) {
      this.reset();
      return;
    }
    this.pendingPoint = clientPoint(event);
    this.changed();
  };

  private applyPoint(sample: GeometryPoint) {
    const point = clientToLocal(this.host, sample);
    const size = layoutSize(this.host);
    if (size.width <= 0 || size.height <= 0) {
      this.reset();
      return;
    }
    const x = (point.x / size.width - this.bounds.x) / this.bounds.width;
    const y = (point.y / size.height - this.bounds.y) / this.bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      this.reset();
      return;
    }
    this.target.x = (y * 2 - 1) * MAX_PITCH;
    this.target.y = (x * 2 - 1) * MAX_YAW;
  }

  setBounds(bounds: TiltBounds): void {
    this.bounds = bounds;
  }

  private leave = (event: PointerEvent) => {
    if (event.relatedTarget === null) this.reset();
  };

  reset = () => {
    const changed = this.pendingPoint !== undefined || this.target.x !== 0 || this.target.y !== 0;
    this.pendingPoint = undefined;
    this.target.x = 0;
    this.target.y = 0;
    if (changed) this.changed();
  };

  get needsFrame(): boolean {
    return (
      this.pendingPoint !== undefined ||
      this.rotation.x !== this.target.x ||
      this.rotation.y !== this.target.y
    );
  }

  resume(now: number): void {
    this.previousTime = now;
  }

  update(now: number): boolean {
    if (this.pendingPoint) {
      const point = this.pendingPoint;
      this.pendingPoint = undefined;
      this.applyPoint(point);
    }
    const elapsed = Math.max(0, Math.min(MAX_FRAME_MILLISECONDS, now - this.previousTime));
    this.previousTime = now;
    const follow = 1 - Math.exp(-elapsed / FOLLOW_MILLISECONDS);
    const previousX = this.rotation.x;
    const previousY = this.rotation.y;
    if (this.reducedMotion.matches || !this.mouse.matches) {
      this.rotation.x = 0;
      this.rotation.y = 0;
    } else {
      this.rotation.x += (this.target.x - this.rotation.x) * follow;
      this.rotation.y += (this.target.y - this.rotation.y) * follow;
      if (Math.abs(this.target.x - this.rotation.x) < SETTLED_RADIANS)
        this.rotation.x = this.target.x;
      if (Math.abs(this.target.y - this.rotation.y) < SETTLED_RADIANS)
        this.rotation.y = this.target.y;
    }
    return previousX !== this.rotation.x || previousY !== this.rotation.y;
  }

  dispose(): void {
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerout", this.leave);
    window.removeEventListener("pointercancel", this.reset);
    window.removeEventListener("blur", this.reset);
    document.removeEventListener("visibilitychange", this.reset);
    this.reducedMotion.removeEventListener("change", this.reset);
    this.mouse.removeEventListener("change", this.reset);
  }
}
