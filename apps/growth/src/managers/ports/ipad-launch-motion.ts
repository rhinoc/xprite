/** The app starts after touch-up. All values are absolute film seconds. */
export const LAUNCH_TIMING = {
  enter: 6.08,
  hover: 6.67,
  press: 6.78,
  touch: 6.88,
  release: 7,
  lifted: 7.1,
  exit: 7.44,
  open: 7.03,
  opened: 7.5,
} as const;

export const CREATE_TIMING = {
  enter: 8.1,
  hover: 8.68,
  press: 8.76,
  touch: 8.85,
  release: 9,
  lifted: 9.15,
  dialog: 9.1,
  move: 9.2,
  arrive: 10.34,
  confirmPress: 10.59,
  confirmTouch: 10.7,
  confirmRelease: 10.82,
  confirmLifted: 10.98,
  exit: 11.4,
} as const;

const ICON_PRESS_SCALE = 0.95;
const CONTENT_REVEAL_START = 0.03;
const CONTENT_REVEAL_END = 0.2;
const DESKTOP_SCALE_CHANGE = 0.035;
const DESKTOP_BLUR = 2.5;

function normalized(start: number, end: number, time: number): number {
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

function smooth(start: number, end: number, time: number): number {
  const progress = normalized(start, end, time);
  return progress * progress * (3 - 2 * progress);
}

/** One shared clock for the fingertip, pressed icon, and expanding app surface. */
export function launchFrame(time: number) {
  const elapsed = normalized(LAUNCH_TIMING.open, LAUNCH_TIMING.opened, time);
  // Monotonic ease-out: fast launch with a restrained settle and no spring overshoot.
  const progress = 1 - (1 - elapsed) ** 3;
  const iconPressed =
    smooth(LAUNCH_TIMING.press, LAUNCH_TIMING.touch, time) *
    (1 - smooth(LAUNCH_TIMING.release, LAUNCH_TIMING.lifted, time));
  const contentOpacity = smooth(
    LAUNCH_TIMING.open + CONTENT_REVEAL_START,
    LAUNCH_TIMING.open + CONTENT_REVEAL_END,
    time,
  );
  return {
    progress,
    iconPressed,
    iconScale: 1 - iconPressed * (1 - ICON_PRESS_SCALE),
    contentOpacity,
    iconOpacity: 1 - contentOpacity,
    desktopScale: 1 + progress * DESKTOP_SCALE_CHANGE,
    desktopBlur: progress * DESKTOP_BLUR,
    handVisible: time >= LAUNCH_TIMING.enter && time < LAUNCH_TIMING.exit,
    handApproach: smooth(LAUNCH_TIMING.enter, LAUNCH_TIMING.hover, time),
    handPress: smooth(LAUNCH_TIMING.press, LAUNCH_TIMING.touch, time),
    handRetreat: smooth(LAUNCH_TIMING.release, LAUNCH_TIMING.exit, time),
    handLift: smooth(LAUNCH_TIMING.release, LAUNCH_TIMING.lifted, time),
  };
}
