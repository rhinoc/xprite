import {
  EditorWheelAction as WheelAction,
  EditorWheelInputKind,
  type EditorWheelPolicyInput,
  type EditorWheelPreferences,
  type EditorWheelDecision,
  type EditorWheelNormalizedInput,
} from "$/managers/ports/platform";
import { libreSpriteWheelScrollDelta, libreSpriteWheelZoomSteps } from "@xprite/editor-core";

const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 64;

export function wheelCellSizeDelta(input: EditorWheelNormalizedInput): number {
  return input.precise ? input.x - input.y : Math.sign(input.x) - Math.sign(input.y);
}

export function wheelScalarDelta(
  input: EditorWheelNormalizedInput,
  logicalDelta: { x: number; y: number },
): number {
  return input.precise ? logicalDelta.x + logicalDelta.y : Math.sign(input.x) + Math.sign(input.y);
}

export function brushSizeAfterWheel(
  size: number,
  input: EditorWheelNormalizedInput,
  logicalDelta: { x: number; y: number },
): number {
  return Math.max(
    MIN_BRUSH_SIZE,
    Math.min(MAX_BRUSH_SIZE, Math.trunc(size - wheelScalarDelta(input, logicalDelta))),
  );
}

export function wheelZoomSteps(
  input: EditorWheelNormalizedInput,
  logicalDelta: { x: number; y: number },
): number {
  return libreSpriteWheelZoomSteps(wheelScalarDelta(input, logicalDelta), input.precise);
}

export enum EditorWheelSurface {
  Canvas = "canvas",
  Timeline = "timeline",
  Palette = "palette",
  Zoom = "zoom",
  ToolRail = "tool-rail",
}

export function resolveWheelDecision(
  input: EditorWheelNormalizedInput,
  surface: EditorWheelSurface,
  preferences: EditorWheelPreferences = {},
  resolveCustom?: (input: EditorWheelPolicyInput, fallback: WheelAction) => WheelAction | null,
): EditorWheelDecision {
  const fallback = resolveSurfaceWheelInput(input, surface, preferences);
  const customize =
    surface === EditorWheelSurface.Canvas &&
    !preferences.quickZoom &&
    input.kind !== EditorWheelInputKind.Magnify;
  const action =
    customize && resolveCustom && fallback !== null ? resolveCustom(input, fallback) : fallback;
  const slideAxis =
    surface === EditorWheelSurface.Canvas &&
    input.precise &&
    preferences.zoomWithSlide &&
    !preferences.quickZoom &&
    !input.ctrl &&
    !input.alt &&
    input.kind === EditorWheelInputKind.Wheel;
  return {
    ...input,
    action,
    axis: slideAxis ? (action === WheelAction.Horizontal ? "x" : "y") : null,
  };
}

/** Device interpretation is shared; each surface retains its native interaction. */
function resolveSurfaceWheelInput(
  input: EditorWheelPolicyInput,
  surface: EditorWheelSurface,
  preferences: EditorWheelPreferences = {},
): WheelAction | null {
  if (surface === EditorWheelSurface.ToolRail) {
    return input.kind === EditorWheelInputKind.Magnify || input.ctrl || input.meta
      ? null
      : WheelAction.Horizontal;
  }
  if (surface === EditorWheelSurface.Canvas) return resolveEditorWheelInput(input, preferences);
  if (surface === EditorWheelSurface.Palette) {
    const onlyControlOrCommand =
      Boolean(input.ctrl) !== Boolean(input.meta) && !input.alt && !input.shift;
    return input.kind === EditorWheelInputKind.Magnify || onlyControlOrCommand
      ? WheelAction.CellSize
      : WheelAction.Vertical;
  }
  if (
    surface === EditorWheelSurface.Zoom ||
    input.kind === EditorWheelInputKind.Magnify ||
    input.ctrl ||
    input.meta
  )
    return WheelAction.Zoom;
  return input.shift && !input.precise ? WheelAction.Horizontal : WheelAction.Vertical;
}

/** Product-owned mapping from modifiers, device class, and configured wheel
 * gestures to editor actions. `precise` marks continuous input, not magnitude.
 */
export function resolveEditorWheelInput(
  input: EditorWheelPolicyInput,
  preferences: EditorWheelPreferences = {},
): WheelAction {
  if (input.kind === EditorWheelInputKind.Magnify) return WheelAction.Zoom;
  const { x, y, precise, ctrl, shift, alt } = input;
  if (preferences.quickZoom) return WheelAction.Zoom;
  const modifier = (ctrl ? 1 : 0) | (shift ? 2 : 0) | (alt ? 4 : 0);
  const modifierActions: Readonly<Record<number, WheelAction>> = {
    4: WheelAction.Foreground,
    5: WheelAction.Foreground,
    6: WheelAction.Background,
    7: WheelAction.Background,
    1:
      (preferences.zoomWithWheel ?? true) && !precise
        ? WheelAction.Brush
        : preferences.zoomWithSlide && precise
          ? WheelAction.Brush
          : WheelAction.Zoom,
    3:
      (preferences.zoomWithWheel ?? true) && !precise
        ? WheelAction.Frame
        : preferences.zoomWithSlide && precise
          ? WheelAction.Frame
          : WheelAction.Zoom,
  };
  const modifiedAction = modifierActions[modifier];
  if (modifiedAction) return modifiedAction;

  if ((preferences.zoomWithWheel ?? true) && !precise)
    return x !== 0 || shift ? WheelAction.Horizontal : WheelAction.Zoom;

  if (preferences.zoomWithSlide && precise) {
    if (Math.abs(x) > Math.abs(y)) return WheelAction.Horizontal;
    return shift ? WheelAction.Vertical : WheelAction.Zoom;
  }

  return x !== 0 || shift ? WheelAction.Horizontal : WheelAction.Vertical;
}

/** Converts normalized input into canvas units after the view supplies local geometry. */
export function projectWheelDelta(
  decision: EditorWheelDecision,
  logical: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  let x = decision.precise ? logical.x : Math.sign(decision.x);
  let y = decision.precise ? logical.y : Math.sign(decision.y);
  if (decision.axis === "x") y = 0;
  else if (decision.axis === "y") x = 0;
  // Browsers may already have shifted a vertical wheel onto the horizontal axis.
  if (decision.action === WheelAction.Horizontal && !x) {
    x = y;
    y = 0;
  }
  if (
    !decision.precise &&
    (decision.action === WheelAction.Horizontal || decision.action === WheelAction.Vertical)
  )
    return libreSpriteWheelScrollDelta(decision.action, x, y, viewport, false);
  return { x, y };
}
