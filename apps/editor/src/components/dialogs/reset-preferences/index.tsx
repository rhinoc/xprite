import {
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUi, type UiMessageKey } from "$/i18n";
import {
  PreferenceResetTarget,
  SUPPORTED_PREFERENCE_RESET_TARGETS,
} from "$/managers/preferences/reset-preferences";
import { Button, Divider, type SurfaceBounds } from "@xprite/ui";

const RESET_ROWS: readonly [PreferenceResetTarget, UiMessageKey, UiMessageKey][] = [
  [PreferenceResetTarget.Configuration, "ui.reset.preferences.configuration", "ui.preferences"],
  [PreferenceResetTarget.Tools, "ui.reset.preferences.tools", "ui.tools"],
  [PreferenceResetTarget.Filters, "ui.reset.preferences.filters", "ui.reset.preferences.filters"],
  [PreferenceResetTarget.UserShades, "ui.reset.preferences.shades", "ui.reset.preferences.shades"],
  [
    PreferenceResetTarget.InstalledResources,
    "ui.reset.preferences.installed",
    "ui.reset.preferences.installed.short",
  ],
  [
    PreferenceResetTarget.RecentFiles,
    "ui.reset.preferences.recent",
    "ui.reset.preferences.recent.short",
  ],
  [
    PreferenceResetTarget.PerFile,
    "ui.reset.preferences.per-file",
    "ui.reset.preferences.per-file.short",
  ],
  [
    PreferenceResetTarget.Windows,
    "ui.reset.preferences.windows",
    "ui.reset.preferences.windows.short",
  ],
  [
    PreferenceResetTarget.UserBrushes,
    "ui.reset.preferences.brushes",
    "ui.reset.preferences.brushes.short",
  ],
];
const RESET_CONTENT_X = 358;
const RESET_CONTENT_WIDTH = 333;
const RESET_FIRST_ROW_Y = 121;
const RESET_ROW_STEP = 16;
const RESET_LAYOUT = {
  rowHeight: 12,
  dividerY: RESET_FIRST_ROW_Y + RESET_ROWS.length * RESET_ROW_STEP,
  dividerHeight: 4,
  toggleY: RESET_FIRST_ROW_Y + RESET_ROWS.length * RESET_ROW_STEP + 12,
  toggleDesktopWidth: 230,
  buttonDesktopX: 631,
  buttonY: RESET_FIRST_ROW_Y + RESET_ROWS.length * RESET_ROW_STEP + 8,
  buttonNarrowY: RESET_FIRST_ROW_Y + RESET_ROWS.length * RESET_ROW_STEP + 32,
  buttonWidth: 60,
  buttonHeight: 17,
};

export function ResetPreferences({
  box,
  client,
  value,
  onChange,
  enabled,
  onReset,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  value: readonly PreferenceResetTarget[];
  onChange: (value: PreferenceResetTarget[]) => void;
  enabled: boolean;
  onReset: () => void;
}) {
  const narrowLayout = usePreferencesDialogNarrowLayout();
  const supported = SUPPORTED_PREFERENCE_RESET_TARGETS;
  return (
    <>
      {RESET_ROWS.map(([target, label, shortLabel], index) => (
        <PreferencesCheckbox
          key={target}
          label={tUi(narrowLayout ? shortLabel : label)}
          aria-label={tUi(label)}
          checked={value.includes(target)}
          disabled={!enabled || !supported.includes(target)}
          onCheckedChange={(checked) =>
            onChange(checked ? [...value, target] : value.filter((item) => item !== target))
          }
          bounds={box(
            RESET_CONTENT_X,
            RESET_FIRST_ROW_Y + index * RESET_ROW_STEP,
            RESET_CONTENT_WIDTH,
            RESET_LAYOUT.rowHeight,
          )}
          relativeTo={client}
        />
      ))}
      <Divider
        bounds={box(
          RESET_CONTENT_X,
          RESET_LAYOUT.dividerY,
          RESET_CONTENT_WIDTH,
          RESET_LAYOUT.dividerHeight,
        )}
        relativeTo={client}
      />
      <PreferencesCheckbox
        label={tUi("ui.reset.preferences.toggle")}
        checked={supported.every((target) => value.includes(target))}
        disabled={!enabled}
        onCheckedChange={(checked) => onChange(checked ? [...supported] : [])}
        bounds={box(
          RESET_CONTENT_X,
          RESET_LAYOUT.toggleY,
          narrowLayout ? RESET_CONTENT_WIDTH : RESET_LAYOUT.toggleDesktopWidth,
          RESET_LAYOUT.rowHeight,
        )}
        relativeTo={client}
      />
      <Button
        text={tUi("ui.reset")}
        aria-label={tUi("ui.reset")}
        disabled={!enabled || !value.some((target) => supported.includes(target))}
        onClick={onReset}
        bounds={box(
          narrowLayout ? RESET_CONTENT_X : RESET_LAYOUT.buttonDesktopX,
          narrowLayout ? RESET_LAYOUT.buttonNarrowY : RESET_LAYOUT.buttonY,
          RESET_LAYOUT.buttonWidth,
          RESET_LAYOUT.buttonHeight,
        )}
        relativeTo={client}
      />
    </>
  );
}
