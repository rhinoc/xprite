/** Device and target ownership: no DOM, coordinates, commands or preferences storage. */
export enum FingerMode {
  Auto = "auto",
  Draw = "draw",
  Pan = "pan",
}
export enum CanvasPointerTarget {
  Surface = "surface",
  Editable = "editable",
}
export interface PointerIdentity {
  pointerId: number;
  pointerType: string;
}
export type PointerStart = {
  action: "ignore" | "edit" | "pan" | "touch-gesture";
  interrupt: boolean;
};

export class CanvasPointerController {
  private preference: FingerMode = FingerMode.Auto;
  private penDetected = false;
  private owner: PointerIdentity | null = null;
  private touches = new Set<number>();
  private ignored = new Set<number>();
  private multiTouch = false;
  private fingerModeListeners = new Set<() => void>();

  subscribeFingerMode = (listener: () => void) => {
    this.fingerModeListeners.add(listener);
    return () => {
      this.fingerModeListeners.delete(listener);
    };
  };

  private notifyFingerMode(previous: FingerMode) {
    if (previous === this.getSnapshot().effectiveFingerMode) return;
    for (const listener of this.fingerModeListeners) listener();
  }

  private detectPen() {
    if (this.penDetected) return;
    const previous = this.getSnapshot().effectiveFingerMode;
    this.penDetected = true;
    this.notifyFingerMode(previous);
  }

  /** Changes apply to the next gesture; an in-progress stroke retains ownership. */
  setFingerMode(mode: FingerMode) {
    const previous = this.getSnapshot().effectiveFingerMode;
    this.preference = mode;
    this.notifyFingerMode(previous);
  }
  getSnapshot() {
    return {
      fingerMode: this.preference,
      penDetected: this.penDetected,
      effectiveFingerMode:
        this.preference === FingerMode.Auto
          ? this.penDetected
            ? FingerMode.Pan
            : FingerMode.Draw
          : this.preference,
    } as const;
  }
  /** Arbitration details for input traces; callers receive detached collections. */
  getDiagnosticSnapshot() {
    return {
      ...this.getSnapshot(),
      owner: this.owner ? { ...this.owner } : null,
      touches: [...this.touches],
      ignored: [...this.ignored],
      multiTouch: this.multiTouch,
    };
  }
  /** Forget detection explicitly, for example when the user disconnects a stylus. */
  resetPenDetection() {
    const previous = this.getSnapshot().effectiveFingerMode;
    this.penDetected = false;
    this.notifyFingerMode(previous);
  }
  /** Target intent affects the next contact, never an existing owner or multi-touch session. */
  begin(pointer: PointerIdentity, target = CanvasPointerTarget.Surface): PointerStart {
    const { pointerId: id, pointerType: type } = pointer;
    if (type === "pen") this.detectPen();
    // A new down starts a fresh physical contact even when blur lost its old up.
    // Moves/ups alone still cannot revive a suppressed contact.
    this.ignored.delete(id);
    if (this.touches.has(id) || this.owner?.pointerId === id)
      return { action: "ignore", interrupt: false };
    let interrupt = false;
    // A pen takes precedence over fingers, but never steals a mouse/other pen stroke.
    if (type === "pen" && this.touches.size) {
      interrupt = true;
      this.reset();
    }
    if (
      (this.owner && this.owner.pointerType !== "touch") ||
      (type !== "touch" && this.touches.size)
    ) {
      this.ignored.add(id);
      return { action: "ignore", interrupt: false };
    }
    if (type === "touch") {
      this.touches.add(id);
      if (this.touches.size > 1 || this.multiTouch) {
        interrupt = !this.multiTouch;
        this.multiTouch = true;
        this.owner = null;
        return { action: "touch-gesture", interrupt };
      }
    }
    this.owner = { pointerId: id, pointerType: type };
    return {
      action:
        type === "touch" &&
        target !== CanvasPointerTarget.Editable &&
        this.getSnapshot().effectiveFingerMode === FingerMode.Pan
          ? "pan"
          : "edit",
      interrupt,
    };
  }
  acceptsMove(pointer: PointerIdentity) {
    if (pointer.pointerType === "pen") this.detectPen();
    if (this.ignored.has(pointer.pointerId)) return false;
    if (this.owner) return this.owner.pointerId === pointer.pointerId;
    if (this.touches.size) return this.touches.has(pointer.pointerId);
    return pointer.pointerType !== "touch";
  }
  end(pointer: PointerIdentity) {
    if (this.ignored.delete(pointer.pointerId)) return false;
    const owned = this.owner?.pointerId === pointer.pointerId;
    const touch = this.touches.delete(pointer.pointerId);
    if (owned) this.owner = null;
    if (!this.touches.size) this.multiTouch = false;
    return owned || touch;
  }
  cancel(pointer: PointerIdentity) {
    if (this.ignored.delete(pointer.pointerId)) return false;
    if (this.owner?.pointerId !== pointer.pointerId && !this.touches.has(pointer.pointerId))
      return false;
    this.reset();
    this.ignored.delete(pointer.pointerId);
    return true;
  }
  /** Remaining physical contacts stay suppressed until they lift. */
  reset() {
    for (const id of this.touches) this.ignored.add(id);
    if (this.owner) this.ignored.add(this.owner.pointerId);
    this.owner = null;
    this.touches.clear();
    this.multiTouch = false;
  }
}
