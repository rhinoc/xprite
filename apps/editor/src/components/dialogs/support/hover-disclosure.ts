/** Delay before a hover opens the popover, so passing pointers do not flash it. */
export const HOVER_OPEN_DELAY_MS = 150;
/** Grace period for the pointer to travel from the trigger into the popover. */
export const HOVER_CLOSE_DELAY_MS = 250;

export interface DisclosureTimers {
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

const browserTimers: DisclosureTimers = {
  set: (callback, delay) => window.setTimeout(callback, delay),
  clear: (handle) => window.clearTimeout(handle),
};

/**
 * Hover/focus/tap state for a popover. A fine pointer opens it after a short delay and keeps it
 * open while the pointer is over the trigger or the popover; keyboard focus opens it at once;
 * coarse pointers (touch) toggle it with a tap instead.
 */
export class HoverDisclosure {
  private timer: number | null = null;
  private hovering = false;
  private focused = false;
  open = false;

  constructor(
    private readonly onChange: (open: boolean) => void,
    private readonly timers: DisclosureTimers = browserTimers,
  ) {}

  pointerEnter(pointerType: string) {
    if (pointerType !== "mouse" && pointerType !== "pen") return;
    this.hovering = true;
    this.schedule(true, this.open ? 0 : HOVER_OPEN_DELAY_MS);
  }

  pointerLeave(pointerType: string) {
    if (pointerType !== "mouse" && pointerType !== "pen") return;
    this.hovering = false;
    if (!this.focused) this.schedule(false, HOVER_CLOSE_DELAY_MS);
  }

  focus() {
    this.focused = true;
    this.schedule(true, 0);
  }

  blur() {
    this.focused = false;
    if (!this.hovering) this.schedule(false, 0);
  }

  /**
   * Click, tap, Enter or Space on the trigger. Touch toggles; on a fine pointer the hover has
   * usually opened it already, so activation only ever opens it there.
   */
  activate(coarsePointer: boolean) {
    this.schedule(coarsePointer ? !this.open : true, 0);
  }

  close() {
    this.hovering = false;
    this.schedule(false, 0);
  }

  dispose() {
    this.cancel();
  }

  private schedule(open: boolean, delay: number) {
    this.cancel();
    if (delay <= 0) {
      this.set(open);
      return;
    }
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.set(open);
    }, delay);
  }

  private cancel() {
    if (this.timer === null) return;
    this.timers.clear(this.timer);
    this.timer = null;
  }

  private set(open: boolean) {
    if (this.open === open) return;
    this.open = open;
    this.onChange(open);
  }
}
