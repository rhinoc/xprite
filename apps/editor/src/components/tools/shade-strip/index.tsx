import { useCallback } from "react";

import { useColorProfile } from "$/components/tools/color-profile";
import {
  ShadeStrip,
  shadeStripWidth,
  type ShadeColor,
  type ShadeStripProps,
} from "$/components/tools/shade-strip-base";
import { tUiSource } from "$/i18n";
import { useUserPresets } from "$/managers/preferences/use-user-presets";
import { displayEditorColorInSrgb as colorProfileToSrgb } from "$/managers/tools/color-control";

const EMPTY_PROMPT = "Select colors in the palette";

export type EditorShadeColor = ShadeColor & {
  readonly paletteIndex?: number;
};

export type EditorShadeStripProps = Omit<ShadeStripProps<EditorShadeColor>, "toDisplayColor">;

/** Supplies the editor's working color profile to the reusable shade strip. */
export function EditorShadeStrip(props: EditorShadeStripProps) {
  const colorProfile = useColorProfile();
  const presets = useUserPresets();
  const toDisplayColor = useCallback(
    (color: EditorShadeColor) => colorProfileToSrgb(color, colorProfile),
    [colorProfile],
  );
  return (
    <ShadeStrip
      {...props}
      toDisplayColor={toDisplayColor}
      presetsReady={presets.ready}
      savedShades={presets.shades.map(presets.restoreShade)}
      onSaveShade={() => {
        if (presets.ready) presets.manager.saveShade(props.colors);
      }}
      onRemoveShade={(index) => presets.manager.removeShade(index)}
    />
  );
}

export function editorShadeStripWidth(colors: readonly EditorShadeColor[]) {
  return shadeStripWidth(colors, tUiSource(EMPTY_PROMPT));
}
