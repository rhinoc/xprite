import { FingerMode } from "$/managers/input/controllers/pointer-controller";

export { FingerMode };

export enum PinchZoomMode {
  Smooth = "smooth",
  SnapOnRelease = "snap-on-release",
  Stepped = "stepped",
}

export interface TouchInputPreferences {
  fingerMode: FingerMode;
  pinchZoomMode: PinchZoomMode;
  undoGestureEnabled: boolean;
  redoGestureEnabled: boolean;
  rapidHistoryEnabled: boolean;
  rapidHistoryDelayMs: number;
  longPressPickEnabled: boolean;
  longPressPickDelayMs: number;
}

export const TOUCH_INPUT_PREFERENCE_KEY = "xse.workspace.touch-input.v1";
export const MIN_TOUCH_HOLD_DELAY_MS = 250;
export const MAX_TOUCH_HOLD_DELAY_MS = 1500;
export const DEFAULT_TOUCH_INPUT_PREFERENCES: TouchInputPreferences = {
  fingerMode: FingerMode.Auto,
  pinchZoomMode: PinchZoomMode.SnapOnRelease,
  undoGestureEnabled: true,
  redoGestureEnabled: true,
  rapidHistoryEnabled: true,
  rapidHistoryDelayMs: 550,
  longPressPickEnabled: true,
  longPressPickDelayMs: 450,
};

export function normalizeTouchInputPreferences(value: unknown): TouchInputPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const boolean = (key: keyof TouchInputPreferences): boolean =>
    typeof saved[key] === "boolean"
      ? (saved[key] as boolean)
      : (DEFAULT_TOUCH_INPUT_PREFERENCES[key] as boolean);
  const delay = (key: "rapidHistoryDelayMs" | "longPressPickDelayMs") => {
    const value = saved[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(MIN_TOUCH_HOLD_DELAY_MS, Math.min(MAX_TOUCH_HOLD_DELAY_MS, Math.round(value)))
      : DEFAULT_TOUCH_INPUT_PREFERENCES[key];
  };
  return {
    fingerMode: Object.values(FingerMode).includes(saved.fingerMode as FingerMode)
      ? (saved.fingerMode as FingerMode)
      : FingerMode.Auto,
    pinchZoomMode: Object.values(PinchZoomMode).includes(saved.pinchZoomMode as PinchZoomMode)
      ? (saved.pinchZoomMode as PinchZoomMode)
      : DEFAULT_TOUCH_INPUT_PREFERENCES.pinchZoomMode,
    undoGestureEnabled: boolean("undoGestureEnabled"),
    redoGestureEnabled: boolean("redoGestureEnabled"),
    rapidHistoryEnabled: boolean("rapidHistoryEnabled"),
    rapidHistoryDelayMs: delay("rapidHistoryDelayMs"),
    longPressPickEnabled: boolean("longPressPickEnabled"),
    longPressPickDelayMs: delay("longPressPickDelayMs"),
  };
}
