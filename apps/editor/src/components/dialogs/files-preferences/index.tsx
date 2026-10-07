import type { MutableRefObject } from "react";

import {
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUi } from "$/i18n";
import {
  AnimationExportExtension,
  ImageExportExtension,
  SaveFileExtension,
} from "$/managers/preferences/file-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import type { RecoverySettings } from "$/managers/workspace/recovery-settings";
import { Button, Combobox, Slider } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";

const intervals = [
  [1 / 6, "10 Seconds"],
  [0.5, "30 Seconds"],
  [1, "1 Minute"],
  [2, "2 Minutes"],
  [5, "5 Minutes"],
  [10, "10 Minutes"],
  [15, "15 Minutes"],
  [30, "30 Minutes"],
] as const;
const retention = [
  [1, "1 Day"],
  [2, "2 Days"],
  [3, "3 Days"],
  [7, "1 Week"],
  [14, "2 Weeks"],
  [30, "1 Month"],
] as const;
const noop = () => {};

/** Files page controls follow options.xml; browser-only unavailable behaviors stay disabled. */
export function FilesPreferences({
  box,
  client,
  settings,
  onChange,
  filePreferences,
  onFilePreferencesChange,
  filePreferencesEnabled,
  canClearRecentFiles,
  onClearRecentFiles,
  enabled,
  retentionDays,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  settings: RecoverySettings;
  onChange: (patch: Partial<RecoverySettings>) => void;
  filePreferences: FilePreferences;
  onFilePreferencesChange: (patch: Partial<FilePreferences>) => void;
  filePreferencesEnabled: boolean;
  canClearRecentFiles: boolean;
  onClearRecentFiles: () => void;
  enabled: boolean;
  retentionDays: MutableRefObject<number>;
}) {
  const narrowLayout = usePreferencesDialogNarrowLayout();
  const combo = (
    label: string,
    y: number,
    value: number,
    options: ReadonlyArray<readonly [number, string]>,
    disabled: boolean,
    change: (value: number) => void,
    mobileY = y,
  ) => (
    <Combobox
      aria-label={label}
      bounds={narrowLayout ? box(358, mobileY, 333, 16) : box(600, y, 91, 16)}
      relativeTo={client}
      value={String(value)}
      options={options.map(([value, label]) => ({ value: String(value), label }))}
      disabled={disabled}
      onValueChange={(value) => change(Number(value))}
    />
  );
  const extensionCombo = (
    label: string,
    value: string,
    options: readonly { value: string; label: string }[],
    y: number,
    mobileY: number,
    change: (value: string) => void,
    disabled = false,
  ) => (
    <Combobox
      aria-label={label}
      bounds={narrowLayout ? box(358, mobileY, 333, 16) : box(527, y, 164, 16)}
      relativeTo={client}
      value={value}
      options={options}
      disabled={disabled || !filePreferencesEnabled}
      onValueChange={change}
    />
  );
  return (
    <>
      {extensionCombo(
        "File > Save:",
        filePreferences.saveDefaultExtension,
        [
          { value: SaveFileExtension.Aseprite, label: ".aseprite" },
          { value: SaveFileExtension.Png, label: ".png" },
        ],
        136,
        152,
        (value) => onFilePreferencesChange({ saveDefaultExtension: value as SaveFileExtension }),
      )}
      {extensionCombo(
        "File > Export (one image):",
        filePreferences.imageDefaultExtension,
        [
          { value: ImageExportExtension.Png, label: ".png" },
          { value: ImageExportExtension.Jpeg, label: ".jpg" },
          { value: ImageExportExtension.Webp, label: ".webp" },
          { value: ImageExportExtension.Gif, label: ".gif" },
          { value: ImageExportExtension.Apng, label: ".apng" },
        ],
        156,
        188,
        (value) =>
          onFilePreferencesChange({ imageDefaultExtension: value as ImageExportExtension }),
      )}
      {extensionCombo(
        "File > Export (animation):",
        filePreferences.animationDefaultExtension,
        [
          { value: AnimationExportExtension.Gif, label: ".gif" },
          { value: AnimationExportExtension.Apng, label: ".apng" },
          { value: AnimationExportExtension.Webp, label: ".webp" },
        ],
        176,
        224,
        (value) =>
          onFilePreferencesChange({ animationDefaultExtension: value as AnimationExportExtension }),
      )}
      {extensionCombo(
        "File > Export Sprite Sheet:",
        "png",
        [{ value: "png", label: ".png" }],
        196,
        260,
        noop,
        true,
      )}
      <Slider
        aria-label={tUi("ui.recent.items")}
        bounds={narrowLayout ? box(358, 302, 128, 16) : box(459, 220, 128, 16)}
        relativeTo={client}
        value={filePreferences.recentItemLimit}
        min={0}
        max={100}
        label={String(filePreferences.recentItemLimit)}
        disabled={!filePreferencesEnabled}
        onValueChange={(recentItemLimit) => onFilePreferencesChange({ recentItemLimit })}
      />
      <Button
        aria-label="Clear"
        text="Clear"
        bounds={narrowLayout ? box(494, 302, 60, 16) : box(591, 220, 60, 16)}
        relativeTo={client}
        disabled={!canClearRecentFiles}
        onClick={onClearRecentFiles}
      />
      <PreferencesCheckbox
        label="Show full file name path"
        checked
        bounds={narrowLayout ? box(358, 320, 333, 12) : box(459, 242, 232, 12)}
        relativeTo={client}
        disabled
        onCheckedChange={noop}
      />
      <PreferencesCheckbox
        label="Automatically save recovery data every"
        checked={settings.enabled}
        bounds={narrowLayout ? box(358, 360, 333, 16) : box(358, 281, 238, 16)}
        relativeTo={client}
        disabled={!enabled}
        onCheckedChange={(enabled) => onChange({ enabled })}
      />
      {combo(
        "Automatically save recovery data every",
        281,
        settings.intervalMinutes,
        intervals,
        !enabled || !settings.enabled,
        (intervalMinutes) => onChange({ intervalMinutes }),
        narrowLayout ? 376 : 297,
      )}
      <PreferencesCheckbox
        label="Keep edited sprite data for"
        checked={settings.retentionDays > 0}
        bounds={narrowLayout ? box(358, 398, 333, 16) : box(358, 301, 238, 16)}
        relativeTo={client}
        disabled={!enabled || !settings.enabled}
        onCheckedChange={(checked) =>
          onChange({ retentionDays: checked ? retentionDays.current : 0 })
        }
      />
      {combo(
        "Keep edited sprite data for",
        301,
        settings.retentionDays || retentionDays.current,
        retention,
        !enabled || !settings.enabled || settings.retentionDays === 0,
        (days) => {
          retentionDays.current = days;
          onChange({ retentionDays: days });
        },
        narrowLayout ? 414 : 335,
      )}
      <PreferencesCheckbox
        label="Keep closed sprite on memory for"
        checked={false}
        bounds={narrowLayout ? box(358, 436, 333, 16) : box(358, 321, 238, 16)}
        relativeTo={client}
        disabled
        onCheckedChange={noop}
      />
      {combo("Keep closed sprite on memory for", 321, 15, intervals, true, noop, 452)}
    </>
  );
}
