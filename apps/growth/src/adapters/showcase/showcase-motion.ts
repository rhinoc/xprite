import { SHOWCASE_DEVICES, ShowcaseDevice } from "$/managers/showcase/showcase-device";

const FOCUS_DURATION_MS = 1400;
export const SNAP_DURATION_MS = 460;
const MAX_FRAME_MS = 64;
const ENTER_DURATION_MS = 1000;
const ENTER_STAGGER_MS = 110;
const ENTER_FADE_MS = 650;
const ENTER_TOTAL_MS = ENTER_DURATION_MS + ENTER_STAGGER_MS * (SHOWCASE_DEVICES.length - 1);
export const CAROUSEL_SPACING = 1.1;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const easeInOut = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** A single position owns dragging and snapping, so release never resets the preview. */
export class ShowcaseMotion {
  position = 0;
  focus = 0;
  private target = 0;
  private from = 0;
  private snapElapsed = SNAP_DURATION_MS;
  private focusElapsed = 0;
  private selected = false;
  private dragOrigin = 0;
  private dragging = false;
  private entranceElapsed: number | undefined;

  update(elapsed: number, reducedMotion: boolean): boolean {
    const previousPosition = this.position;
    const previousFocus = this.focus;
    const previousEntrance = this.entranceElapsed;
    const delta = Math.max(0, Math.min(MAX_FRAME_MS, elapsed));
    // Start with the first rendered frame, after models and screen assets are ready.
    this.entranceElapsed = reducedMotion
      ? ENTER_TOTAL_MS
      : this.entranceElapsed === undefined
        ? 0
        : Math.min(ENTER_TOTAL_MS, this.entranceElapsed + delta);
    if (this.selected) this.focusElapsed += delta;
    this.focus = !this.selected
      ? 0
      : reducedMotion
        ? 1
        : easeInOut(this.focusElapsed / FOCUS_DURATION_MS);
    if (!this.dragging) {
      this.snapElapsed += delta;
      const progress = reducedMotion ? 1 : easeOut(this.snapElapsed / SNAP_DURATION_MS);
      this.position =
        progress === 1 ? this.target : this.from + (this.target - this.from) * progress;
    }
    return (
      previousPosition !== this.position ||
      previousFocus !== this.focus ||
      previousEntrance !== this.entranceElapsed
    );
  }

  get entranceOpacity() {
    return easeOut((this.entranceElapsed ?? 0) / ENTER_FADE_MS);
  }

  deviceEntrance(index: number) {
    return easeOut(((this.entranceElapsed ?? 0) - index * ENTER_STAGGER_MS) / ENTER_DURATION_MS);
  }

  get hasSelection() {
    return this.selected;
  }

  get needsFrame(): boolean {
    return (
      this.entranceElapsed !== ENTER_TOTAL_MS ||
      (this.selected && this.focus < 1) ||
      (!this.dragging && this.position !== this.target)
    );
  }

  get settled() {
    return (
      this.entranceElapsed === ENTER_TOTAL_MS &&
      this.selected &&
      this.focus === 1 &&
      !this.dragging &&
      this.position === this.target
    );
  }

  select(device: ShowcaseDevice) {
    const count = SHOWCASE_DEVICES.length;
    const index = SHOWCASE_DEVICES.indexOf(device);
    const currentIndex = ((this.target % count) + count) % count;
    let distance = index - currentIndex;
    if (this.focus < 1) distance = index - this.target;
    else {
      if (distance > count / 2) distance -= count;
      if (distance < -count / 2) distance += count;
    }
    this.selected = true;
    this.target += distance;
    this.from = this.position;
    this.snapElapsed = 0;
    this.dragging = false;
  }

  beginDrag() {
    this.dragOrigin = this.position;
    this.dragging = true;
  }

  previewDrag(progress: number) {
    if (this.dragging) this.position = this.dragOrigin - progress / CAROUSEL_SPACING;
  }
}
