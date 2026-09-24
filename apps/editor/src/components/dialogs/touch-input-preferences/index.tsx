import {
  PreferencesLabel,
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUi, tUiSource } from "$/i18n";
import {
  MIN_TOUCH_HOLD_DELAY_MS,
  MAX_TOUCH_HOLD_DELAY_MS,
  FingerMode,
  PinchZoomMode,
  type TouchInputPreferences,
} from "$/managers/preferences/touch-input-preferences";
import { Combobox, type SurfaceBounds } from "@xprite/ui";

const TOUCH_HOLD_DELAY_STEP_MS = 50;
const TOUCH_HOLD_DELAY_OPTIONS = Array.from(
  { length: (MAX_TOUCH_HOLD_DELAY_MS - MIN_TOUCH_HOLD_DELAY_MS) / TOUCH_HOLD_DELAY_STEP_MS + 1 },
  (_, index) => {
    const delay = MIN_TOUCH_HOLD_DELAY_MS + index * TOUCH_HOLD_DELAY_STEP_MS;
    return { value: String(delay), label: String(delay) };
  },
);

const FINGER_MODE_OPTIONS = [
  { value: FingerMode.Auto, label: "Automatic: draw with fingers until a pen is used" },
  { value: FingerMode.Draw, label: "Draw with fingers" },
  { value: FingerMode.Pan, label: "Navigate with fingers" },
];

export function TouchInputPreferencesSection({
  box,
  client,
  value,
  onChange,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  value: TouchInputPreferences;
  onChange?: (patch: Partial<TouchInputPreferences>) => void;
}) {
  const narrow = usePreferencesDialogNarrowLayout();
  const modeY = 121;
  const pinchY = narrow ? 174 : 156;
  const firstY = narrow ? 227 : 191;
  const rowHeight = 25;
  const checkboxes = [
    { key: "undoGestureEnabled", label: "Two-finger tap to undo" },
    { key: "redoGestureEnabled", label: "Three-finger tap to redo" },
    { key: "rapidHistoryEnabled", label: "Hold to repeat undo and redo" },
    { key: "longPressPickEnabled", label: "Touch and hold to pick a color" },
  ] as const;
  const delays = [
    { key: "rapidHistoryDelayMs", label: "Repeat delay (ms)", enabled: value.rapidHistoryEnabled },
    {
      key: "longPressPickDelayMs",
      label: "Color-pick delay (ms)",
      enabled: value.longPressPickEnabled,
    },
  ] as const;
  return (
    <>
      <PreferencesLabel
        text={tUiSource("Single-finger action")}
        bounds={box(358, modeY, narrow ? 333 : 112, 16)}
        relativeTo={client}
      />
      <Combobox
        value={value.fingerMode}
        options={FINGER_MODE_OPTIONS.map((option) => ({
          ...option,
          label: tUiSource(option.label),
        }))}
        aria-label={tUiSource("Single-finger action")}
        disabled={!onChange}
        bounds={box(narrow ? 358 : 474, narrow ? modeY + 21 : modeY, narrow ? 333 : 217, 18)}
        relativeTo={client}
        onValueChange={(fingerMode) => onChange?.({ fingerMode: fingerMode as FingerMode })}
      />
      <PreferencesLabel
        text={tUi("ui.touch.pinch.zoom")}
        bounds={box(358, pinchY, narrow ? 333 : 112, 16)}
        relativeTo={client}
      />
      <Combobox
        value={value.pinchZoomMode}
        options={[
          { value: PinchZoomMode.Smooth, label: tUi("ui.touch.pinch.zoom.smooth") },
          { value: PinchZoomMode.SnapOnRelease, label: tUi("ui.touch.pinch.zoom.snap.on.release") },
          { value: PinchZoomMode.Stepped, label: tUi("ui.touch.pinch.zoom.stepped") },
        ]}
        aria-label={tUi("ui.touch.pinch.zoom")}
        disabled={!onChange}
        bounds={box(narrow ? 358 : 474, narrow ? pinchY + 21 : pinchY, narrow ? 333 : 217, 18)}
        relativeTo={client}
        onValueChange={(pinchZoomMode) =>
          onChange?.({ pinchZoomMode: pinchZoomMode as PinchZoomMode })
        }
      />
      {checkboxes.map(({ key, label }, index) => (
        <PreferencesCheckbox
          key={key}
          label={tUiSource(label)}
          checked={value[key]}
          disabled={!onChange}
          onCheckedChange={(checked) => onChange?.({ [key]: checked })}
          bounds={box(358, firstY + index * rowHeight, 333, 17)}
          relativeTo={client}
        />
      ))}
      {delays.map(({ key, label, enabled }, index) => {
        const y = firstY + checkboxes.length * rowHeight + index * (narrow ? 46 : rowHeight);
        return (
          <span key={key}>
            <PreferencesLabel
              text={tUiSource(label)}
              bounds={box(358, y, narrow ? 333 : 160, 16)}
              relativeTo={client}
            />
            <Combobox
              value={String(value[key])}
              options={TOUCH_HOLD_DELAY_OPTIONS}
              disabled={!onChange || !enabled}
              aria-label={tUiSource(label)}
              bounds={box(narrow ? 358 : 520, narrow ? y + 21 : y, narrow ? 333 : 90, 18)}
              relativeTo={client}
              onValueChange={(delay) => onChange?.({ [key]: Number(delay) })}
            />
          </span>
        );
      })}
    </>
  );
}
