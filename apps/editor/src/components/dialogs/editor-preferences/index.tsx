import {
  PreferencesLabel,
  PreferencesCheckbox,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUi, tUiSource } from "$/i18n";
import { WheelDevice, type DetectedWheelDevice } from "$/managers/input/wheel-device-context";
import { RightClickMode, type EditorPreferences } from "$/managers/preferences/editor-preferences";
import { Combobox, type SurfaceBounds } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";

const EDITOR_OPTIONS: readonly { label: string; key?: keyof EditorPreferences }[] = [
  { label: "Zoom with scroll wheel", key: "zoomWithWheel" },
  { label: "Zoom sliding two fingers up or down", key: "zoomWithSlide" },
  { label: "Zoom from center with scroll wheel", key: "zoomFromCenterWithWheel" },
  { label: "Zoom from center with keys", key: "zoomFromCenterWithKeys" },
  { label: "Show scroll-bars in sprite editor" },
  { label: "Auto-scroll on editor edges", key: "autoScroll" },
  { label: "Auto-fit on screen when a sprite is opened", key: "autoFit" },
  { label: "Preview straight line immediately with the Pencil tool", key: "straightLinePreview" },
  {
    label: "Discard custom brush whenever the eyedropper is used",
    key: "discardBrushOnEyedropper",
  },
];

export function EditorPreferencesSection({
  box,
  client,
  value,
  enabled,
  onChange,
  showScrollbars,
  onShowScrollbarsChange,
  wheelDevice,
  onWheelDeviceChange,
  detectedWheelDevice,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  value: EditorPreferences;
  enabled: boolean;
  onChange: (patch: Partial<EditorPreferences>) => void;
  showScrollbars: boolean;
  onShowScrollbarsChange: (value: boolean) => void;
  wheelDevice: WheelDevice;
  onWheelDeviceChange?: (value: WheelDevice) => void;
  detectedWheelDevice: DetectedWheelDevice | null;
}) {
  const assets = useUiAssets();
  return (
    <>
      {EDITOR_OPTIONS.map(({ key, label }, index) => (
        <PreferencesCheckbox
          key={label}
          label={label}
          bounds={box(358, 120 + index * 16, 333, 12)}
          relativeTo={client}
          checked={key ? !!value[key] : showScrollbars}
          disabled={key ? !enabled : false}
          onCheckedChange={(checked) =>
            key ? onChange({ [key]: checked }) : onShowScrollbarsChange(checked)
          }
        />
      ))}
      <PreferencesLabel
        text="Downsampling:"
        bounds={box(358, 270, 81, 16)}
        relativeTo={client}
        color={assets?.style.colors.disabled}
      />
      <Combobox
        aria-label="Downsampling"
        bounds={box(443, 270, 146, 16)}
        relativeTo={client}
        value="bilinear"
        options={[{ value: "bilinear", label: "Bilinear mipmapping" }]}
        disabled
        onValueChange={() => {}}
      />
      <PreferencesLabel text="Right-click:" bounds={box(358, 292, 81, 16)} relativeTo={client} />
      <Combobox
        aria-label="Right-click"
        bounds={box(443, 292, 248, 16)}
        relativeTo={client}
        value={value.rightClickMode}
        options={[
          {
            value: RightClickMode.PaintBackground,
            label: tUi("ui.preferences.editor.background_paint"),
          },
          {
            value: RightClickMode.PickForeground,
            label: tUi("ui.preferences.editor.pick_foreground"),
          },
          { value: RightClickMode.Erase, label: tUi("ui.preferences.editor.erase") },
          { value: RightClickMode.Scroll, label: tUi("ui.preferences.editor.scroll") },
          { value: RightClickMode.RectangularMarquee, label: tUi("ui.rectangular.marquee") },
          { value: RightClickMode.Lasso, label: tUi("ui.lasso") },
          {
            value: RightClickMode.SelectLayerAndMove,
            label: tUi("ui.preferences.editor.select_layer_move"),
          },
        ]}
        disabled={!enabled}
        onValueChange={(rightClickMode) =>
          onChange({ rightClickMode: rightClickMode as RightClickMode })
        }
      />
      <PreferencesLabel text="Wheel device:" bounds={box(358, 336, 81, 16)} relativeTo={client} />
      <Combobox
        aria-label="Wheel device"
        bounds={box(443, 336, 146, 16)}
        relativeTo={client}
        value={wheelDevice}
        options={[
          {
            value: WheelDevice.Auto,
            label: tUi("ui.automatic.2", {
              value1: tUiSource(
                detectedWheelDevice === WheelDevice.Mouse
                  ? "Mouse"
                  : detectedWheelDevice === WheelDevice.Trackpad
                    ? "Trackpad"
                    : "Unknown",
              ),
            }),
          },
          { value: WheelDevice.Mouse, label: "Mouse wheel" },
          { value: WheelDevice.Trackpad, label: "Trackpad" },
        ]}
        disabled={!onWheelDeviceChange}
        onValueChange={(device) => onWheelDeviceChange?.(device as WheelDevice)}
      />
    </>
  );
}
