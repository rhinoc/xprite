/**
 * Shared open/select gestures for the Files Finder list.
 *
 * Classic Mac OS 8 Finder opens with a double-click (and ⌘↓ / Enter / Open).
 * Touch / coarse pointers use a single tap to open — matching common mobile
 * file browsers and avoiding double-tap-to-open, which is easy to miss and
 * pairs poorly with synthesized ghost clicks after a folder navigation.
 *
 * After navigating into a folder, browsers (especially with touch) often
 * deliver a delayed click at the same coordinates. That click lands on
 * whatever is now under the finger — typically a file in the new listing —
 * and used to open that file into the editor. `armFolderNavSuppression`
 * ignores item activations for a short window after any folder change.
 */

export const FOLDER_NAV_SUPPRESS_MS = 450;

/** True when a primary click/tap should open (folders navigate, files open). */
export function opensOnPrimaryClick(pointerType: string | undefined): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

export function createFolderNavGate(now: () => number = () => performance.now()) {
  let ignoreUntil = Number.NEGATIVE_INFINITY;
  return {
    /** Call whenever the Files folder path changes (into or up). */
    arm() {
      ignoreUntil = now() + FOLDER_NAV_SUPPRESS_MS;
    },
    /** True while post-navigation ghost clicks should be ignored. */
    suppressed() {
      return now() < ignoreUntil;
    },
  };
}
