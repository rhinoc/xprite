import { useEffect, useRef, useState, type CSSProperties } from "react";

import { PaletteWarning, PaletteWarningTarget } from "$/components/palette/palette-warning";
import { useColorProfile } from "$/components/tools/color-profile";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi, type UiMessageKey } from "$/i18n";
import type { ColorHoverValue } from "$/managers/colors/color-hover-store";
import {
  useColorSelectorModel,
  EditorSelectorMode,
  EditorColorHarmony,
  EditorSelectorPart,
  EditorSelectorInput,
  type EditorSelectorInteraction,
} from "$/managers/colors/color-selector-model";
import { useColorSource } from "$/managers/colors/color-sources";
import type { useWorkingColorDrag } from "$/managers/colors/working-color-drag";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import {
  useWheelInput,
  useWheelInputHandler,
  EditorWheelSurface,
  EditorWheelAction,
  wheelCellSizeDelta,
} from "$/managers/input/use-wheel-input";
import {
  displayEditorColorInSrgb as colorProfileToSrgb,
  parseEditorColor as hexToRgba,
  findEditorPaletteColor as paletteColorIndex,
} from "$/managers/tools/color-control";
import {
  ColorSelector,
  ColorSelectorPart,
  ColorSelectorInput,
  type ColorSelectorInteraction,
  Button,
  Menu,
  FocusRingBehavior,
  type ColorSelectorHandle,
  type ColorSelectorRgba,
  type SurfaceBounds,
  type MenuItem,
} from "@xprite/ui";
import { surfaceLayout } from "@xprite/ui/canvas";

import styles from "$/components/tools/color-controls/color-controls.module.css";

const DEFAULT_BOUNDS = { x: 4, y: 778, width: 148, height: 242 };
const COLOR_FIELD_HEIGHT = 30;
const COLOR_FIELD_GAP = 8;
const COLOR_FIELDS_TOP_INSET = 4;
const COLOR_FIELDS_FOOTER_HEIGHT =
  COLOR_FIELDS_TOP_INSET + COLOR_FIELD_HEIGHT * 2 + COLOR_FIELD_GAP;
const WARNING_WIDTH = 26;
const MODIFIED_HUE_STEP = 15;
const CHANNEL_MAX = 255;
const SELECTOR_PARTS: Record<ColorSelectorPart, EditorSelectorPart> = {
  [ColorSelectorPart.Main]: EditorSelectorPart.Main,
  [ColorSelectorPart.Bottom]: EditorSelectorPart.Bottom,
  [ColorSelectorPart.Alpha]: EditorSelectorPart.Alpha,
};
const SELECTOR_INPUTS: Record<ColorSelectorInput, EditorSelectorInput> = {
  [ColorSelectorInput.Mouse]: EditorSelectorInput.Mouse,
  [ColorSelectorInput.Touch]: EditorSelectorInput.Touch,
  [ColorSelectorInput.Pen]: EditorSelectorInput.Pen,
  [ColorSelectorInput.Keyboard]: EditorSelectorInput.Keyboard,
};
const selectorInteraction = (interaction: ColorSelectorInteraction): EditorSelectorInteraction => ({
  ...interaction,
  input: SELECTOR_INPUTS[interaction.input],
});
const HARMONY_LABELS: readonly [EditorColorHarmony, UiMessageKey][] = [
  [EditorColorHarmony.None, "ui.color.wheel.no.harmonies"],
  [EditorColorHarmony.Complementary, "ui.color.wheel.complementary"],
  [EditorColorHarmony.Monochromatic, "ui.color.wheel.monochromatic"],
  [EditorColorHarmony.Analogous, "ui.color.wheel.analogous"],
  [EditorColorHarmony.SplitComplementary, "ui.color.wheel.split.complementary"],
  [EditorColorHarmony.Triadic, "ui.color.wheel.triadic"],
  [EditorColorHarmony.Tetradic, "ui.color.wheel.tetradic"],
  [EditorColorHarmony.Square, "ui.color.wheel.square"],
];

export interface ColorFieldsProps {
  colorDrag?: ReturnType<typeof useWorkingColorDrag>;
  foreground: string;
  background?: string;
  onForegroundClick?: () => void;
  onBackgroundClick?: () => void;
  onHoverColor?: (target: "foreground" | "background" | null) => void;
  onHoverSampleColor?: (sample: ColorHoverValue | null) => void;
  onColorChange?: (color: string, target: WorkingColorTarget) => void;
  target?: WorkingColorTarget;
  onTargetChange?: (target: WorkingColorTarget) => void;
  palette?: readonly (readonly number[])[];
  onAddColor?: (target: "foreground" | "background") => void;
  canAddColor?: boolean;
  bounds?: SurfaceBounds;
  className?: string;
  style?: CSSProperties;
}

export function ColorFields({
  colorDrag,
  foreground,
  background = "#000000",
  onForegroundClick,
  onBackgroundClick,
  onHoverColor,
  onHoverSampleColor,
  onColorChange,
  target,
  onTargetChange,
  palette,
  onAddColor,
  canAddColor = true,
  bounds = DEFAULT_BOUNDS,
  className,
  style,
}: ColorFieldsProps) {
  const colorProfile = useColorProfile();
  const [localTarget, setLocalTarget] = useState(WorkingColorTarget.Foreground);
  const selectorTarget = target ?? localTarget;
  const setSelectorTarget = (value: WorkingColorTarget) => {
    setLocalTarget(value);
    onTargetChange?.(value);
  };
  const previousColors = useRef({ foreground, background });
  useEffect(() => {
    if (target === undefined) {
      if (foreground !== previousColors.current.foreground)
        setSelectorTarget(WorkingColorTarget.Foreground);
      else if (background !== previousColors.current.background)
        setSelectorTarget(WorkingColorTarget.Background);
    }
    previousColors.current = { foreground, background };
  }, [foreground, background, target]);
  const selector = useColorSelectorModel({
    foreground,
    background,
    target: selectorTarget,
    onTargetChange: setSelectorTarget,
    onColorChange,
    onHover: onHoverSampleColor,
  });
  const control = useRef<ColorSelectorHandle>(null);
  const selectorElement = useRef<HTMLDivElement>(null);
  useColorSource(selectorElement, (point) => {
    const color = control.current?.readColor(point);
    return color ? { color, profile: colorProfile } : null;
  });
  const wheel = useWheelInput();
  useWheelInputHandler(selectorElement, (event) => {
    const decision = wheel.resolve(event, EditorWheelSurface.ColorSelector);
    if (decision.action !== EditorWheelAction.Hue || control.current?.isDragging()) return;
    const amount =
      wheelCellSizeDelta(decision) *
      (decision.shift || decision.ctrl || decision.meta || decision.alt ? MODIFIED_HUE_STEP : 1);
    if (!amount) return;
    event.preventDefault();
    event.stopPropagation();
    selector.rotateHue(amount);
  });
  const displayColor = (color: ColorSelectorRgba) => {
    const srgb = colorProfileToSrgb(color, colorProfile);
    return `rgba(${srgb[0]},${srgb[1]},${srgb[2]},${srgb[3] / CHANNEL_MAX})`;
  };
  const warnings = [foreground, background].map(
    (color) => palette !== undefined && paletteColorIndex(palette, hexToRgba(color)) < 0,
  );
  const selectorHeight = Math.max(0, bounds.height - COLOR_FIELDS_FOOTER_HEIGHT);
  const fields = [0, 1].map((index) => ({
    x: bounds.x,
    y:
      bounds.y +
      selectorHeight +
      COLOR_FIELDS_TOP_INSET +
      index * (COLOR_FIELD_HEIGHT + COLOR_FIELD_GAP),
    width: bounds.width,
    height: COLOR_FIELD_HEIGHT,
  }));
  const colorBounds = fields.map((field, index) => ({
    ...field,
    width: field.width - (warnings[index] ? WARNING_WIDTH : 0),
  }));
  const spectrum = selector.mode === EditorSelectorMode.Spectrum;
  const normal = selector.mode === EditorSelectorMode.NormalMapWheel;
  const backgroundTarget = selectorTarget === WorkingColorTarget.Background;
  const labels = {
    [ColorSelectorPart.Main]: tUi(
      backgroundTarget
        ? normal
          ? "ui.selector.background.normal"
          : spectrum
            ? "ui.selector.background.spectrum"
            : selector.wheel
              ? "ui.selector.background.wheel"
              : "ui.background.saturation.and.brightness"
        : normal
          ? "ui.selector.foreground.normal"
          : spectrum
            ? "ui.selector.foreground.spectrum"
            : selector.wheel
              ? "ui.selector.foreground.wheel"
              : "ui.foreground.saturation.and.brightness",
    ),
    [ColorSelectorPart.Bottom]: tUi(
      backgroundTarget
        ? spectrum
          ? "ui.selector.background.saturation"
          : selector.wheel
            ? "ui.selector.background.brightness"
            : "ui.background.hue"
        : spectrum
          ? "ui.selector.foreground.saturation"
          : selector.wheel
            ? "ui.selector.foreground.brightness"
            : "ui.foreground.hue",
    ),
    [ColorSelectorPart.Alpha]: tUi(
      backgroundTarget ? "ui.touch.background.opacity" : "ui.foreground.opacity",
    ),
  };
  const wheelOptions: MenuItem[] = [
    {
      label: tUi("ui.color.wheel.discrete"),
      checked: selector.discrete,
      onSelect: () => selector.setPreferences({ discrete: !selector.discrete }),
    },
    ...(!normal
      ? HARMONY_LABELS.map(([harmony, label], index) => ({
          label: tUi(label),
          separator: index === 0,
          checked: selector.harmony === harmony,
          onSelect: () => selector.setPreferences({ harmony }),
        }))
      : []),
  ];
  const layout = surfaceLayout(bounds);
  return (
    <div
      className={className}
      style={{ position: "relative", width: layout.width, height: layout.height, ...style }}
    >
      <ColorSelector
        key={selector.mode}
        bounds={{ ...bounds, height: selectorHeight }}
        elementRef={selectorElement}
        controlRef={control}
        sample={(part, point, interaction) =>
          selector.sample(SELECTOR_PARTS[part], point, selectorInteraction(interaction))
        }
        displayColor={displayColor}
        indicators={(part, width, height) =>
          selector.indicators(SELECTOR_PARTS[part], width, height)
        }
        onChange={(sample, interaction) =>
          selector.onChange(sample, selectorInteraction(interaction))
        }
        onHover={selector.onHover}
        onKeyStep={(part, horizontal, vertical) =>
          selector.onKeyStep(SELECTOR_PARTS[part], horizontal, vertical)
        }
        labels={labels}
        valueText={selector.valueText}
        valueNow={selector.valueNow}
        gestureOwner={selector.gestureOwner}
      />
      {selector.wheel && (
        <div className={styles.wheelOptions}>
          <Menu
            label={tUi("ui.color.wheel.options")}
            items={wheelOptions}
            renderTrigger={(props) => (
              <Button
                {...props}
                icon="pal_options"
                pixelSize={{ width: 10, height: 10 }}
                aria-label={tUi("ui.color.wheel.options")}
              />
            )}
          />
        </div>
      )}
      {warnings.map(
        (warning, index) =>
          warning && (
            <PaletteWarning
              key={index}
              bounds={{
                x: bounds.x + bounds.width - 26,
                y: fields[index].y,
                width: 26,
                height: COLOR_FIELD_HEIGHT,
              }}
              relativeTo={bounds}
              target={
                index === 0 ? PaletteWarningTarget.Foreground : PaletteWarningTarget.Background
              }
              disabled={!canAddColor || !onAddColor}
              onClick={() => onAddColor?.(index === 0 ? "foreground" : "background")}
            />
          ),
      )}
      {[foreground, background].map((color, index) => (
        <EditorColorButton
          key={index}
          value={color}
          bounds={colorBounds[index]}
          relativeTo={bounds}
          focusRing={FocusRingBehavior.Always}
          aria-pressed={
            target !== undefined
              ? selectorTarget ===
                (index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground)
              : undefined
          }
          aria-label={tUi(index ? "ui.background.color.color" : "ui.foreground.color.color", {
            color,
          })}
          title={
            colorDrag
              ? tUi(
                  colorDrag.screenAvailable
                    ? "ui.color.button.help.screen"
                    : "ui.color.button.help",
                )
              : undefined
          }
          onPointerEnter={() => {
            onHoverColor?.(index ? "background" : "foreground");
          }}
          onPointerLeave={() => {
            onHoverColor?.(null);
          }}
          onFocus={() => onHoverColor?.(index ? "background" : "foreground")}
          onBlur={() => onHoverColor?.(null)}
          style={{ touchAction: colorDrag ? "none" : undefined }}
          pressed={colorDrag?.dragging ? false : undefined}
          onPointerDown={(event) => {
            if (event.button === 0 && event.isPrimary) {
              setSelectorTarget(
                index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground,
              );
              colorDrag?.start(
                index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground,
                event.currentTarget,
                event.pointerId,
                event.altKey,
              );
            }
          }}
          onClick={(event) => {
            if (colorDrag && !colorDrag.shouldOpenPopup(event.detail === 0)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (colorDrag && event.altKey) {
              event.preventDefault();
              event.stopPropagation();
              colorDrag.pickScreen(
                index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground,
              );
              return;
            }
            setSelectorTarget(
              index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground,
            );
            (index ? onBackgroundClick : onForegroundClick)?.();
          }}
        />
      ))}
    </div>
  );
}
