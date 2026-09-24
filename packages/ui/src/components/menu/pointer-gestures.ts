import { clientPoint } from "$/base/utils/dom-geometry";
export interface PointerContact {
  pointerId: number;
  pointerType: string;
  button: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

export const TOUCH_LONG_PRESS_DELAY_MS = 550;
export const TOUCH_MOVE_THRESHOLD = 9;
export enum LongPressActivation {
  Hold = "hold",
  Release = "release",
}

const LONG_PRESS_MOVE_THRESHOLD = TOUCH_MOVE_THRESHOLD;
const DOUBLE_PRESS_INTERVAL_MS = 380;
const DOUBLE_PRESS_DISTANCE = 18;
const MAX_TAP_DURATION_MS = 350;

function copyContact(input: PointerContact): PointerContact {
  return {
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    button: input.button,
    clientX: clientPoint(input).x,
    clientY: clientPoint(input).y,
    timeStamp: input.timeStamp,
  };
}

/** Counts completed stationary taps. Mouse callers use the platform click count. */
export class PointerClickSequence {
  private previous: { input: PointerContact; target: unknown } | null = null;
  private current: { input: PointerContact; target: unknown; count: number } | null = null;

  press(input: PointerContact, target: unknown): number {
    const previous = this.previous;
    const count =
      previous &&
      previous.target === target &&
      previous.input.pointerType === input.pointerType &&
      previous.input.button === input.button &&
      input.timeStamp - previous.input.timeStamp < DOUBLE_PRESS_INTERVAL_MS &&
      Math.hypot(
        clientPoint(input).x - clientPoint(previous.input).x,
        clientPoint(input).y - clientPoint(previous.input).y,
      ) < DOUBLE_PRESS_DISTANCE
        ? 2
        : 1;
    this.previous = null;
    this.current = { input: copyContact(input), target, count };
    return count;
  }

  move(input: PointerContact): void {
    const current = this.current;
    if (
      current?.input.pointerId === input.pointerId &&
      Math.hypot(
        clientPoint(input).x - clientPoint(current.input).x,
        clientPoint(input).y - clientPoint(current.input).y,
      ) >= TOUCH_MOVE_THRESHOLD
    )
      this.reset();
  }

  release(input: PointerContact): number {
    this.move(input);
    const current = this.current;
    this.current = null;
    if (
      !current ||
      current.input.pointerId !== input.pointerId ||
      input.timeStamp - current.input.timeStamp > MAX_TAP_DURATION_MS
    )
      return 0;
    if (current.count === 1) this.previous = { input: copyContact(input), target: current.target };
    return current.count;
  }

  reset(): void {
    this.previous = null;
    this.current = null;
  }
}

/** Cancels long press on movement, a second contact, cancellation or disposal. */
export class TouchLongPressGesture {
  private contacts = new Set<number>();
  private pending: { input: PointerContact; target: Element } | null = null;
  private ready = false;
  private opened = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly open: (input: PointerContact, target: Element) => void,
    private readonly canOpen?: (input: PointerContact, target: Element) => boolean,
  ) {}

  press(
    input: PointerContact,
    target: Element | null,
    activation = LongPressActivation.Release,
  ): void {
    if (input.pointerType !== "touch") return;
    this.contacts.add(input.pointerId);
    this.clearPending();
    if (this.contacts.size !== 1 || input.button !== 0 || !target) return;
    this.pending = { input: copyContact(input), target };
    this.timer = setTimeout(() => {
      const pending = this.pending;
      this.timer = null;
      if (!pending || !pending.target.isConnected) return;
      if (activation === LongPressActivation.Release) {
        // Drag targets can reserve the hold for reordering.
        this.ready = true;
      } else if (this.canOpen?.(pending.input, pending.target) ?? true) {
        this.opened = true;
        this.open(pending.input, pending.target);
      }
    }, TOUCH_LONG_PRESS_DELAY_MS);
  }

  move(input: PointerContact): void {
    if (this.opened) return;
    const pending = this.pending;
    if (
      pending?.input.pointerId === input.pointerId &&
      Math.hypot(
        clientPoint(input).x - clientPoint(pending.input).x,
        clientPoint(input).y - clientPoint(pending.input).y,
      ) >= LONG_PRESS_MOVE_THRESHOLD
    )
      this.clearPending();
  }

  release(input: PointerContact): boolean {
    this.move(input);
    this.contacts.delete(input.pointerId);
    const pending = this.pending;
    if (pending?.input.pointerId !== input.pointerId) return false;
    const opened = this.opened;
    const open =
      this.ready && pending.target.isConnected && (this.canOpen?.(input, pending.target) ?? true);
    this.clearPending();
    if (open) this.open(pending.input, pending.target);
    return opened || open;
  }

  cancel(input?: PointerContact): void {
    if (input) this.contacts.delete(input.pointerId);
    else this.contacts.clear();
    this.clearPending();
  }

  private clearPending(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.ready = false;
    this.opened = false;
  }
}

const COMPATIBILITY_MOUSE_SUPPRESSION_MS = 700;
const COMPATIBILITY_MOUSE_DISTANCE = 32;

/** A completed touch action must not click/focus content exposed by its popup closing. */
export class PointerCompatibilityMouseSuppression {
  private completed: { x: number; y: number; until: number } | null = null;

  complete(input: PointerContact): void {
    this.completed = {
      x: clientPoint(input).x,
      y: clientPoint(input).y,
      until: Date.now() + COMPATIBILITY_MOUSE_SUPPRESSION_MS,
    };
  }

  connect(host: Window): () => void {
    const reset = () => {
      this.completed = null;
    };
    const consume = (event: MouseEvent) => {
      // Keyboard and assistive activation has no physical click count.
      if ((event.type === "click" || event.type === "dblclick") && event.detail === 0) return;
      const completed = this.completed;
      if (
        !completed ||
        Date.now() >= completed.until ||
        Math.hypot(clientPoint(event).x - completed.x, clientPoint(event).y - completed.y) >=
          COMPATIBILITY_MOUSE_DISTANCE
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    // A fresh pointer action always owns its normal mouse/click sequence.
    host.addEventListener("pointerdown", reset, true);
    host.addEventListener("mousedown", consume, true);
    host.addEventListener("mouseup", consume, true);
    host.addEventListener("click", consume, true);
    host.addEventListener("dblclick", consume, true);
    host.addEventListener("blur", reset);
    return () => {
      host.removeEventListener("pointerdown", reset, true);
      host.removeEventListener("mousedown", consume, true);
      host.removeEventListener("mouseup", consume, true);
      host.removeEventListener("click", consume, true);
      host.removeEventListener("dblclick", consume, true);
      host.removeEventListener("blur", reset);
      reset();
    };
  }
}
