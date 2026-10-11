import { useMemo, useRef, useState } from "react";

import { tUi } from "$/i18n";
import type { ColorHoverValue } from "$/managers/colors/color-hover-store";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { useColorSelectorPreferences } from "$/managers/preferences/use-color-selector-preferences";
import {
  ColorSelectorMode,
  ColorSelectorRegion,
  ColorWheelHarmony,
  colorSelectorIndicators,
  hsvaToRgba,
  rgbaToHex,
  rgbaToHsla,
  rgbaToHsva,
  hexToRgba,
  isColorWheel,
  sampleColorSelector,
  selectorStateForColor,
  stepColorSelector,
  type ColorSelectorSample,
  type ColorSelectorPoint,
  type Hsla,
  type Hsva,
  type Rgba,
  type RasterEditor,
} from "@xprite/editor-core";
export const EditorSelectorMode = ColorSelectorMode;
export const EditorSelectorPart = ColorSelectorRegion;
export type EditorSelectorPart = ColorSelectorRegion;
export const EditorColorHarmony = ColorWheelHarmony;
export type EditorColorHarmony = ColorWheelHarmony;
export enum EditorSelectorInput {
  Mouse = "mouse",
  Touch = "touch",
  Pen = "pen",
  Keyboard = "keyboard",
}
enum EditorSelectorButton {
  Primary = 0,
  Secondary = 2,
}
export interface EditorSelectorInteraction {
  input: EditorSelectorInput;
  button: number | null;
  captured: boolean;
  paint: boolean;
}
interface Draft {
  color: string;
  hsv: Hsva;
  hsl: Hsla;
  owner: number | string | null;
  core: RasterEditor | null;
  mode: ColorSelectorMode;
  harmony: ColorWheelHarmony;
  anchor?: Rgba;
}
interface ColorSelectorModelOptions {
  foreground: string;
  background: string;
  target: WorkingColorTarget;
  onTargetChange(target: WorkingColorTarget): void;
  onColorChange?(color: string, target: WorkingColorTarget): void;
  onHover?(sample: ColorHoverValue | null): void;
}
const FULL_TURN = 360;
const CHANNEL_MAX = 255;
const wrapHue = (value: number) => ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;
const KEYBOARD_INTERACTION: EditorSelectorInteraction = {
  button: null,
  input: EditorSelectorInput.Keyboard,
  captured: false,
  paint: false,
};

export function useColorSelectorModel(options: ColorSelectorModelOptions) {
  const preferences = useColorSelectorPreferences();
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const owner = snapshot?.document?.id ?? snapshot?.document?.name ?? null;
  const gestureOwner = useMemo(() => ({}), [core, owner, preferences.mode]);
  const [drafts, setDrafts] = useState<Partial<Record<WorkingColorTarget, Draft>>>({});
  const latest = useRef(options);
  latest.current = options;
  const interactionTarget = (interaction: EditorSelectorInteraction) =>
    interaction.button === EditorSelectorButton.Secondary
      ? WorkingColorTarget.Background
      : interaction.input === EditorSelectorInput.Mouse &&
          interaction.button === EditorSelectorButton.Primary
        ? WorkingColorTarget.Foreground
        : latest.current.target;
  const stateForTarget = (target: WorkingColorTarget) => {
    const color = hexToRgba(latest.current[target]);
    const state = selectorStateForColor(color, preferences);
    const draft = drafts[target];
    if (draft?.core === core && draft.owner === owner && draft.color === rgbaToHex(color)) {
      state.hsv = draft.hsv;
      state.hsl = draft.hsl;
      if (draft.anchor && draft.mode === preferences.mode && draft.harmony === preferences.harmony)
        return selectorStateForColor(draft.anchor, preferences);
    }
    return state;
  };
  const displayed = stateForTarget(options.target);
  const commit = (sample: ColorSelectorSample, interaction: EditorSelectorInteraction) => {
    const target = interactionTarget(interaction);
    const color = rgbaToHex(sample.color);
    const hsv = sample.hsv ?? rgbaToHsva(sample.color);
    const hsl = sample.hsl ?? rgbaToHsla(sample.color);
    // Retain chart coordinates at black, white, and gray, where RGB loses hue or saturation.
    const hue = sample.hsv?.[0] ?? sample.hsl?.[0];
    const draftHsv: Hsva = [
      hsv[1] === 0 && hue !== undefined ? hue : hsv[0],
      hsv[1],
      hsv[2],
      hsv[3],
    ];
    const draftHsl: Hsla = [
      hsl[1] === 0 && hue !== undefined ? hue : hsl[0],
      hsl[1],
      hsl[2],
      hsl[3],
    ];
    setDrafts((previous) => ({
      ...previous,
      [target]: {
        color,
        hsv: draftHsv,
        hsl: draftHsl,
        core,
        owner,
        mode: preferences.mode,
        harmony: preferences.harmony,
        anchor: sample.harmony ? displayed.color : undefined,
      },
    }));
    latest.current.onTargetChange(target);
    latest.current.onColorChange?.(color, target);
  };
  return {
    ...preferences,
    gestureOwner,
    wheel: isColorWheel(preferences.mode),
    state: displayed,
    sample: (
      part: EditorSelectorPart,
      point: ColorSelectorPoint,
      interaction: EditorSelectorInteraction,
    ) => {
      return sampleColorSelector(displayed, part, point, interaction);
    },
    indicators: (part: EditorSelectorPart, width: number, height: number) =>
      colorSelectorIndicators(displayed, part, width, height),
    onChange: commit,
    onHover: (sample: ColorSelectorSample | null) => {
      if (!sample) {
        options.onHover?.(null);
        return;
      }
      const hsv = sample.hsv ?? rgbaToHsva(sample.color);
      const hsl = sample.hsl;
      options.onHover?.({
        hex: rgbaToHex(sample.color),
        description: hsl
          ? tUi("ui.color.selector.hover.hsl", {
              hue: Math.trunc(hsl[0]),
              saturation: Math.trunc(hsl[1] * 100),
              lightness: Math.trunc(hsl[2] * 100),
              red: sample.color[0],
              green: sample.color[1],
              blue: sample.color[2],
            })
          : tUi("ui.color.selector.hover.hsv", {
              hue: Math.trunc(hsv[0]),
              saturation: Math.trunc(hsv[1] * 100),
              brightness: Math.trunc(hsv[2] * 100),
              red: sample.color[0],
              green: sample.color[1],
              blue: sample.color[2],
            }),
      });
    },
    onKeyStep: (part: EditorSelectorPart, horizontal: number, vertical: number) =>
      commit(
        stepColorSelector(
          displayed,
          part,
          part === EditorSelectorPart.Main ? horizontal : horizontal - vertical,
          vertical,
        ),
        KEYBOARD_INTERACTION,
      ),
    rotateHue: (delta: number) => {
      const hsv: Hsva = [
        wrapHue(displayed.hsv[0] + delta),
        displayed.hsv[1],
        displayed.hsv[2],
        displayed.color[3] || CHANNEL_MAX,
      ];
      commit({ color: hsvaToRgba(hsv), hsv }, KEYBOARD_INTERACTION);
    },
    valueText: {
      [EditorSelectorPart.Main]:
        preferences.mode === ColorSelectorMode.Spectrum
          ? `HSL ${Math.round(displayed.hsl[0])}° ${Math.round(displayed.hsl[1] * 100)}% ${Math.round(displayed.hsl[2] * 100)}%`
          : preferences.mode === ColorSelectorMode.NormalMapWheel
            ? `RGB ${displayed.color.slice(0, 3).join(" ")}`
            : `HSV ${Math.round(displayed.hsv[0])}° ${Math.round(displayed.hsv[1] * 100)}% ${Math.round(displayed.hsv[2] * 100)}%`,
      [EditorSelectorPart.Bottom]: `${Math.round((preferences.mode === ColorSelectorMode.Spectrum ? displayed.hsl[1] : preferences.mode === ColorSelectorMode.TintShadeTone ? displayed.hsv[0] / FULL_TURN : displayed.hsv[2]) * 100)}%`,
      [EditorSelectorPart.Alpha]: `${Math.round((displayed.color[3] / CHANNEL_MAX) * 100)}%`,
    },
    valueNow: {
      [EditorSelectorPart.Main]:
        (preferences.mode === ColorSelectorMode.Spectrum
          ? displayed.hsl[0] / FULL_TURN
          : preferences.mode === ColorSelectorMode.NormalMapWheel
            ? displayed.color[0] / CHANNEL_MAX
            : displayed.hsv[1]) * 100,
      [EditorSelectorPart.Bottom]:
        (preferences.mode === ColorSelectorMode.Spectrum
          ? displayed.hsl[1]
          : preferences.mode === ColorSelectorMode.TintShadeTone
            ? displayed.hsv[0] / FULL_TURN
            : displayed.hsv[2]) * 100,
      [EditorSelectorPart.Alpha]: (displayed.color[3] / CHANNEL_MAX) * 100,
    },
  };
}
