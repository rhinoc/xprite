const MOBILE_PLATFORM_PATTERN = /Android|iPad|iPhone|iPod/i;
const APPLE_DESKTOP_PLATFORM = "MacIntel";
const IPAD_MIN_TOUCH_POINTS = 2;

/** Browsers expose input hints, not whether a physical keyboard is connected. */
export function browserKeyboardLikelyAvailable(): boolean {
  if (typeof navigator === "undefined") return true;
  const mobilePlatform = MOBILE_PLATFORM_PATTERN.test(navigator.userAgent);
  const desktopModeIPad =
    navigator.platform === APPLE_DESKTOP_PLATFORM &&
    navigator.maxTouchPoints >= IPAD_MIN_TOUCH_POINTS;
  const touchOnlyPointer =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches &&
    !window.matchMedia?.("(any-pointer: fine)").matches;
  return !mobilePlatform && !desktopModeIPad && !touchOnlyPointer;
}
