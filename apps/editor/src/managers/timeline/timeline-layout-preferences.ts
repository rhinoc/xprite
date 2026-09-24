import { browserLocalStorage } from "@xprite/bedrock/browser/localstorage";

const HEIGHT_KEY = "xse.timeline.dock-height.v2";
const WIDTH_KEY = "xse.timeline.dock-width.v1";

function readPixelSize(key: string, minimum: number): number | null {
  try {
    const value = Number(browserLocalStorage.getItem(key));
    return Number.isFinite(value) && value >= minimum ? value : null;
  } catch {
    return null;
  }
}

/** Read the user's saved timeline dock size; storage failure leaves layout defaults in control. */
export function readTimelineDockHeight(minimum: number, fallback: number) {
  return readPixelSize(HEIGHT_KEY, minimum) ?? fallback;
}

export function readTimelineDockWidth(minimum: number) {
  return readPixelSize(WIDTH_KEY, minimum);
}

export function saveTimelineDockHeight(height: number) {
  try {
    browserLocalStorage.setItem(HEIGHT_KEY, String(height));
  } catch {
    // The active session keeps the resized dock even when persistence is unavailable.
  }
}

export function saveTimelineDockWidth(width: number) {
  try {
    browserLocalStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // The active session keeps the resized dock even when persistence is unavailable.
  }
}
