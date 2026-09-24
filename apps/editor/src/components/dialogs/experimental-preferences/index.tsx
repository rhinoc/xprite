import {
  PreferencesLabel,
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUiSource } from "$/i18n";
import {
  MAX_TOOLTIP_DELAY,
  type EditorPreferences,
} from "$/managers/preferences/editor-preferences";
import { TOOL_COLOR_CHANNEL_MAX } from "$/managers/tools/color-control";
import { Input } from "@xprite/ui";
import { Combobox } from "@xprite/ui";
import { Slider } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";

const EXPERIMENTAL_ISSUE_REFERENCES = [
  { x: 530, y: 136, text: "(#1671)" },
  { x: 494, y: 152, text: "(#1096)" },
  { x: 496, y: 168, text: "(#3225)" },
  { x: 512, y: 373, text: "(#960)" },
] as const;

export interface ExperimentalPreferencesProps {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  editorPreferences: EditorPreferences;
  onEditorPreferencesChange?: (patch: Partial<EditorPreferences>) => void;
  composeGroups: boolean;
  onComposeGroupsChange?: (value: boolean) => void;
}
/** options.xml Experimental page, measured from the original intact hidden widget tree. */
export function ExperimentalPreferences({
  box,
  client,
  editorPreferences,
  onEditorPreferencesChange,
  composeGroups,
  onComposeGroupsChange,
}: ExperimentalPreferencesProps) {
  const assets = useUiAssets();
  const narrow = usePreferencesDialogNarrowLayout();
  const rows = [
    ["UI with multiple windows", 120, false, 333],
    ["New render engine for sprite editor", 136, true, 168],
    ["New layer blending method", 152, true, 132],
    ["Compose groups separately", 168, composeGroups, 134],
    ["Use native clipboard", 184, true, 333],
    ["Use native file dialog", 200, true, 333],
    ["Apply Saturation/Value to Hue slider on Tint/Shade/Tone selector", 216, false, 333],
    ["Flash layer when it is selected", 232, false, 333],
    ["New selection tools implementation", 248, false, 333],
    ["Use shaders for color selectors", 373, true, 150],
    ["Cache compressed tilesets for faster saving (uses more memory)", 389, true, 333],
  ] as const;
  return (
    <>
      {rows.map(([label, y, checked, width]) => (
        <PreferencesCheckbox
          key={label}
          label={
            narrow
              ? [tUiSource(label), EXPERIMENTAL_ISSUE_REFERENCES.find((item) => item.y === y)?.text]
                  .filter(Boolean)
                  .join(" ")
              : label
          }
          bounds={box(358, y, narrow ? 333 : width, 12)}
          relativeTo={client}
          checked={checked}
          disabled={y !== 168 || !onComposeGroupsChange}
          onCheckedChange={y === 168 ? (onComposeGroupsChange ?? (() => {})) : () => {}}
        />
      ))}
      {!narrow &&
        EXPERIMENTAL_ISSUE_REFERENCES.map(({ x, y, text }) => (
          <PreferencesLabel
            key={String(text)}
            bounds={box(x + 1, y + 1, 36, 12)}
            relativeTo={client}
            text={String(text)}
            color={assets?.style.colors.disabled}
          />
        ))}
      <PreferencesLabel
        bounds={box(359, 265, 58, 15)}
        relativeTo={client}
        text="Tooltip Delay:"
        color={!onEditorPreferencesChange ? assets?.style.colors.disabled : undefined}
      />
      <Input
        bounds={box(420, 264, 56, 15)}
        relativeTo={client}
        value={String(editorPreferences.tooltipDelay)}
        suffix="ms"
        aria-label="Tooltip Delay"
        disabled={!onEditorPreferencesChange}
        inputMode="numeric"
        onValueChange={(text) => {
          const delay = Number(text);
          if (text.trim() && Number.isInteger(delay) && delay >= 0 && delay <= MAX_TOOLTIP_DELAY)
            onEditorPreferencesChange?.({ tooltipDelay: delay });
        }}
      />
      <PreferencesLabel
        bounds={box(359, 284, 128, 16)}
        relativeTo={client}
        text="Opacity for non-active layers:"
        color={!onEditorPreferencesChange ? assets?.style.colors.disabled : undefined}
      />
      <Slider
        bounds={box(490, 283, 128, 16)}
        relativeTo={client}
        value={editorPreferences.nonActiveLayersOpacity}
        min={0}
        max={TOOL_COLOR_CHANNEL_MAX}
        label={String(editorPreferences.nonActiveLayersOpacity)}
        aria-label="Opacity for non-active layers"
        disabled={!onEditorPreferencesChange}
        onValueChange={(nonActiveLayersOpacity) =>
          onEditorPreferencesChange?.({ nonActiveLayersOpacity })
        }
      />
      <PreferencesLabel
        bounds={box(359, 319, 129, 16)}
        relativeTo={client}
        text="RGB to palette index mapping:"
        color={assets?.style.colors.disabled}
      />
      <Combobox
        bounds={box(491, 318, 159, 16)}
        relativeTo={client}
        value="octree"
        options={[{ value: "octree", label: "Default (Octree)" }]}
        aria-label="RGB to palette index mapping"
        disabled
        onValueChange={() => {}}
      />
      <PreferencesLabel
        bounds={box(359, 339, 129, 16)}
        relativeTo={client}
        text="Color Best Fit Criteria:"
        color={assets?.style.colors.disabled}
      />
      <Combobox
        bounds={box(491, 338, 159, 16)}
        relativeTo={client}
        value="euclidean"
        options={[{ value: "euclidean", label: "Default (Euclidean)" }]}
        aria-label="Color Best Fit Criteria"
        disabled
        onValueChange={() => {}}
      />
    </>
  );
}
