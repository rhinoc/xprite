import { isTouchTap } from "$/managers/input/controllers/touch-contact";

export enum TouchHistoryAction {
  Undo = "undo",
  Redo = "redo",
}

export interface TouchHistoryPreferences {
  undoGestureEnabled: boolean;
  redoGestureEnabled: boolean;
  rapidHistoryEnabled: boolean;
  rapidHistoryDelayMs: number;
}

const HISTORY_REPEAT_INTERVAL_MS = 90;
const HISTORY_TAP_MAX_DURATION_MS = 300;

/** Owns history gesture policy. Coordinates, capture and view transforms stay
 * outside this controller; every traversal checks the canonical editor state. */
export class CanvasHistoryGestureController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private count = 0;
  private startedAt = 0;
  private moved = false;
  private released = false;
  private repeated = false;

  constructor(
    private readonly preferences: () => TouchHistoryPreferences,
    private readonly traverse: (action: TouchHistoryAction) => boolean,
  ) {}

  begin(count: number, startedAt: number, moved: boolean) {
    this.cancel();
    this.startedAt = startedAt;
    this.update(count, moved);
  }

  update(count: number, moved: boolean) {
    this.moved ||= moved;
    if (count !== this.count) {
      this.clearTimer();
      this.count = count;
    }
    if (this.moved || count > 3 || this.released) {
      this.clearTimer();
      return;
    }
    const preferences = this.preferences();
    if (!this.timer && !this.repeated && preferences.rapidHistoryEnabled && this.action())
      this.timer = setTimeout(() => this.repeat(), preferences.rapidHistoryDelayMs);
  }

  /** Releasing any finger stops repeat. Lifting sequentially still produces
   * one tap when the final finger lifts, using the maximum contact count. */
  release() {
    this.released = true;
    this.clearTimer();
  }

  finish(endedAt: number) {
    this.clearTimer();
    const action = this.action();
    if (
      action &&
      !this.repeated &&
      isTouchTap(this.startedAt, endedAt, this.moved, HISTORY_TAP_MAX_DURATION_MS)
    )
      this.traverse(action);
    this.cancel();
  }

  cancel() {
    this.clearTimer();
    this.count = 0;
    this.moved = false;
    this.released = false;
    this.repeated = false;
  }

  private action(): TouchHistoryAction | null {
    const preferences = this.preferences();
    if (this.count === 2 && preferences.undoGestureEnabled) return TouchHistoryAction.Undo;
    if (this.count === 3 && preferences.redoGestureEnabled) return TouchHistoryAction.Redo;
    return null;
  }

  private repeat() {
    this.timer = null;
    const action = this.action();
    if (!action || this.moved || this.released || !this.preferences().rapidHistoryEnabled) return;
    // Consume the hold even at the end of history, so releasing cannot fire
    // another action or changing fingers cannot reverse a consumed hold.
    this.repeated = true;
    if (this.traverse(action))
      this.timer = setTimeout(() => this.repeat(), HISTORY_REPEAT_INTERVAL_MS);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
