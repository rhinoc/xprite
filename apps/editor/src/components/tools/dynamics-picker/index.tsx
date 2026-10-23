import * as React from "react";

import { DitheringSelector } from "$/components/tools/dithering-selector";
import { tUi, tUiSource } from "$/i18n";
import {
  PRESSURE_GAIN_SLIDER_LIMIT,
  SLOW_TRACKING_SLIDER_MAX,
  pressureGainLabel,
  pressureGainSliderValue,
  slowTrackingLabel,
  slowTrackingSliderValue,
  withPressureGainSliderValue,
  withSlowTrackingSliderValue,
  type DynamicsSettings,
} from "$/managers/preferences/dynamics-state";
import { DynamicsColorOrderControl, DynamicsInputControl } from "$/managers/tools/tool-options";
import {
  createUiPortal,
  FontRole,
  Button,
  ScrollArea,
  Text,
  TextVariant,
  Checkbox,
  Slider,
  Divider,
  Tooltip,
  TooltipPlacement,
  type SurfaceBounds,
  type SurfaceViewport,
  useUi,
} from "@xprite/ui";
import { measureUiText, UiPart } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { anchoredPopoverStyle, useAnchoredPopover } from "@xprite/ui/popover";

export interface DynamicsPickerProps {
  bounds: SurfaceBounds;
  value: DynamicsSettings;
  onValueChange: (value: DynamicsSettings) => void;
  shared: boolean;
  onSharedChange: (shared: boolean) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushAngle: number;
  onBrushAngleChange: (angle: number) => void;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
}

enum DynamicsOutput {
  Size = "size",
  Angle = "angle",
  Color = "color",
}
const OUTPUTS = [DynamicsOutput.Size, DynamicsOutput.Angle, DynamicsOutput.Color] as const;
const OUTPUT_LABELS = {
  [DynamicsOutput.Size]: "Size",
  [DynamicsOutput.Angle]: "Angle",
  [DynamicsOutput.Color]: "Color",
} as const;
const OUTPUT_INPUT_KEYS = {
  [DynamicsOutput.Size]: "sizeInput",
  [DynamicsOutput.Angle]: "angleInput",
  [DynamicsOutput.Color]: "colorInput",
} as const;
const INPUT_CHOICES = [
  { input: DynamicsInputControl.None, label: "None" },
  { input: DynamicsInputControl.Pressure, label: "Pressure" },
  { input: DynamicsInputControl.Speed, label: "Speed" },
] as const;
const MIN_SIZE = 1;
const MAX_SIZE = 64;
const MAX_ANGLE = 180;
const LABELS = ["Smoothing", "Size", "Angle", "Color", "Low", "High", "Pressure gain"] as const;
const COLOR_ORDER_LABELS = ["BG > FG", "FG > BG"] as const;
const PADDING = 6;
const LABEL_X = 8;
const LABEL_GAP = 8;
const BUTTON_TEXT_PADDING = 16;
const MIN_CONTROL_WIDTH = 192;
const ROW_HEIGHT = 28;
const ROW_STEP = 30;
const COLOR_ROW_HEIGHT = 58;
const SEPARATOR_HEIGHT = 8;
const SHARED_HEIGHT = 24;
const BOTTOM_PADDING = 8;

interface PanelColumns {
  labelWidth: number;
  controlX: number;
  choiceWidth: number;
  controlWidth: number;
  width: number;
}

/** Column widths follow the translated label and button text. */
function panelColumns(): PanelColumns {
  const textWidth = (texts: readonly string[], font?: FontRole) =>
    Math.max(...texts.map((text) => measureUiText(tUiSource(text), font)));
  const labelWidth = Math.max(
    textWidth(LABELS, FontRole.Compact) + LABEL_GAP,
    textWidth(COLOR_ORDER_LABELS) + BUTTON_TEXT_PADDING + PADDING + LABEL_GAP / 2 - LABEL_X,
  );
  const controlX = LABEL_X + labelWidth;
  const choiceWidth = textWidth(INPUT_CHOICES.map((choice) => choice.label)) + BUTTON_TEXT_PADDING;
  const controlWidth = Math.max(MIN_CONTROL_WIDTH, choiceWidth * INPUT_CHOICES.length);
  return {
    labelWidth,
    controlX,
    choiceWidth: Math.floor(controlWidth / INPUT_CHOICES.length),
    controlWidth,
    width: controlX + controlWidth + PADDING,
  };
}

interface PanelLayout {
  height: number;
  smoothingY: number;
  outputs: Record<DynamicsOutput, { inputY: number; valuesY: number | null }>;
  gainY: number | null;
  separatorY: number;
  sharedY: number;
}

function panelLayout(value: DynamicsSettings): PanelLayout {
  let y = PADDING;
  const smoothingY = y;
  y += ROW_STEP + SEPARATOR_HEIGHT;
  const outputs = {} as PanelLayout["outputs"];
  for (const output of OUTPUTS) {
    const inputY = y;
    y += ROW_STEP;
    let valuesY: number | null = null;
    if (value[OUTPUT_INPUT_KEYS[output]] !== DynamicsInputControl.None) {
      valuesY = y;
      y += output === DynamicsOutput.Color ? COLOR_ROW_HEIGHT + 2 : 2 * ROW_STEP;
    }
    outputs[output] = { inputY, valuesY };
  }
  let gainY: number | null = null;
  if (
    OUTPUTS.some((output) => value[OUTPUT_INPUT_KEYS[output]] === DynamicsInputControl.Pressure)
  ) {
    y += SEPARATOR_HEIGHT;
    gainY = y;
    y += ROW_STEP;
  }
  const separatorY = y;
  const sharedY = separatorY + SEPARATOR_HEIGHT + PADDING;
  return {
    height: sharedY + SHARED_HEIGHT + BOTTOM_PADDING,
    smoothingY,
    outputs,
    gainY,
    separatorY,
    sharedY,
  };
}

/** Brush dynamics panel. Each output picks a pointer input and maps it from a
 * low value to the current brush value. Preferences remain controlled. */
export function DynamicsPicker({
  bounds,
  value,
  onValueChange,
  shared,
  onSharedChange,
  brushSize,
  onBrushSizeChange,
  brushAngle,
  onBrushAngleChange,
  relativeTo,
  viewport = DEFAULT_SURFACE_VIEWPORT,
}: DynamicsPickerProps) {
  const { style: uiStyle } = useUi();
  const {
    triggerRef: trigger,
    panelRef: panel,
    popover: popup,
    open: openPopover,
    close,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(viewport);
  const id = React.useId();
  const active =
    value.slowTracking > 0 ||
    OUTPUTS.some((output) => value[OUTPUT_INPUT_KEYS[output]] !== DynamicsInputControl.None);
  const layout = panelLayout(value);
  const { labelWidth, controlX, choiceWidth, controlWidth, width } = panelColumns();
  const height = layout.height;
  const pb = popup ? { x: popup.x, y: popup.y, width, height } : null;
  const update = (next: Partial<DynamicsSettings>) => onValueChange({ ...value, ...next });
  const toggle = () => {
    if (popup) close();
    else openPopover({ width, height });
  };
  const b = (x: number, y: number, w: number, h: number): SurfaceBounds => ({
    x: (pb?.x ?? 0) + x,
    y: (pb?.y ?? 0) + y,
    width: w,
    height: h,
  });
  const common = { relativeTo: pb ?? undefined, viewport: popup?.viewport ?? viewport };
  const label = (text: string, y: number) => (
    <Text
      variant={TextVariant.Control}
      {...common}
      bounds={b(LABEL_X, y, labelWidth, ROW_HEIGHT)}
      text={text}
      font={FontRole.Compact}
    />
  );
  const rangeRows = (output: DynamicsOutput.Size | DynamicsOutput.Angle, y: number) => {
    const size = output === DynamicsOutput.Size;
    const min = size ? MIN_SIZE : -MAX_ANGLE,
      max = size ? MAX_SIZE : MAX_ANGLE;
    const name = tUiSource(OUTPUT_LABELS[output]);
    return (
      <>
        {label("Low", y)}
        <Slider
          {...common}
          bounds={b(controlX, y, controlWidth, ROW_HEIGHT)}
          font={FontRole.Compact}
          min={min}
          max={max}
          value={size ? value.sizeLow : value.angleLow}
          aria-label={tUi("ui.minimum", { value1: name })}
          onValueChange={(n) => update(size ? { sizeLow: n } : { angleLow: n })}
        />
        {label("High", y + ROW_STEP)}
        <Slider
          {...common}
          bounds={b(controlX, y + ROW_STEP, controlWidth, ROW_HEIGHT)}
          font={FontRole.Compact}
          min={min}
          max={max}
          value={size ? brushSize : brushAngle}
          aria-label={tUi("ui.maximum", { value1: name })}
          onValueChange={size ? onBrushSizeChange : onBrushAngleChange}
        />
      </>
    );
  };
  const colorRows = (y: number) => {
    const backgroundFirst = value.colorOrder === DynamicsColorOrderControl.BackgroundToForeground;
    return (
      <>
        <Button
          {...common}
          bounds={b(PADDING, y, controlX - PADDING - LABEL_GAP / 2, ROW_HEIGHT)}
          text={backgroundFirst ? "BG > FG" : "FG > BG"}
          aria-label={tUi("ui.gradient.direction")}
          onClick={() =>
            update({
              colorOrder: backgroundFirst
                ? DynamicsColorOrderControl.ForegroundToBackground
                : DynamicsColorOrderControl.BackgroundToForeground,
            })
          }
        />
        <DitheringSelector
          {...common}
          bounds={b(controlX, y, controlWidth, COLOR_ROW_HEIGHT)}
          value={value.ditherMatrix}
          onValueChange={(ditherMatrix) => update({ ditherMatrix })}
        />
      </>
    );
  };
  return (
    <>
      <Tooltip text="Dynamics" placement={TooltipPlacement.Bottom} disabled={!!popup}>
        <Button
          bounds={bounds}
          relativeTo={relativeTo}
          viewport={viewport}
          id={`${id}-trigger`}
          buttonRef={trigger}
          icon={active ? "dynamics_on" : "dynamics"}
          iconOffset={{ x: 2, y: 0 }}
          selected={!!popup}
          aria-label="Dynamics"
          aria-haspopup="dialog"
          aria-expanded={!!popup}
          aria-controls={popup ? id : undefined}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.preventDefault();
              toggle();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) toggle();
          }}
        />
      </Tooltip>
      {popup &&
        pb &&
        createUiPortal(
          <div
            ref={panel}
            id={id}
            data-popup=""
            data-popup-for={`${id}-trigger`}
            role="dialog"
            aria-label={tUi("ui.dynamics")}
            style={{
              ...anchoredPopoverStyle(popup, pb),
              backgroundColor: uiStyle.colors.menuitem_normal_face,
            }}
          >
            <ScrollArea
              style={{ height: "100%" }}
              viewport={popup.viewport}
              scrollX={false}
              contentStyle={{ height: surfaceLayout(pb, popup.viewport).height, minHeight: 0 }}
              aria-label={tUi("ui.dynamics")}
            >
              <UiPart
                part="menu"
                scale={2}
                drawCenter
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
              {label("Smoothing", layout.smoothingY)}
              <Slider
                {...common}
                bounds={b(controlX, layout.smoothingY, controlWidth, ROW_HEIGHT)}
                font={FontRole.Compact}
                min={0}
                max={SLOW_TRACKING_SLIDER_MAX}
                value={slowTrackingSliderValue(value)}
                label={slowTrackingLabel(slowTrackingSliderValue(value))}
                aria-label="Smoothing"
                onValueChange={(n) => onValueChange(withSlowTrackingSliderValue(value, n))}
              />
              <Divider
                bounds={b(
                  PADDING,
                  layout.smoothingY + ROW_STEP,
                  width - 2 * PADDING,
                  SEPARATOR_HEIGHT,
                )}
                relativeTo={pb}
              />
              {OUTPUTS.map((output) => {
                const { inputY, valuesY } = layout.outputs[output];
                const key = OUTPUT_INPUT_KEYS[output];
                return (
                  <React.Fragment key={output}>
                    {label(OUTPUT_LABELS[output], inputY)}
                    {INPUT_CHOICES.map((choice, index) => (
                      <Button
                        key={choice.input}
                        {...common}
                        bounds={b(controlX + index * choiceWidth, inputY, choiceWidth, ROW_HEIGHT)}
                        text={choice.label}
                        selected={value[key] === choice.input}
                        aria-label={tUi("ui.with", {
                          value1: tUiSource(OUTPUT_LABELS[output]),
                          value2: tUiSource(choice.label),
                        })}
                        aria-pressed={value[key] === choice.input}
                        onClick={() => update({ [key]: choice.input })}
                      />
                    ))}
                    {valuesY !== null &&
                      (output === DynamicsOutput.Color
                        ? colorRows(valuesY)
                        : rangeRows(output, valuesY))}
                  </React.Fragment>
                );
              })}
              {layout.gainY !== null && (
                <>
                  <Divider
                    bounds={b(
                      PADDING,
                      layout.gainY - SEPARATOR_HEIGHT,
                      width - 2 * PADDING,
                      SEPARATOR_HEIGHT,
                    )}
                    relativeTo={pb}
                  />
                  {label("Pressure gain", layout.gainY)}
                  <Slider
                    {...common}
                    bounds={b(controlX, layout.gainY, controlWidth, ROW_HEIGHT)}
                    font={FontRole.Compact}
                    min={-PRESSURE_GAIN_SLIDER_LIMIT}
                    max={PRESSURE_GAIN_SLIDER_LIMIT}
                    value={pressureGainSliderValue(value)}
                    label={pressureGainLabel(pressureGainSliderValue(value))}
                    aria-label="Pressure gain"
                    onValueChange={(n) => onValueChange(withPressureGainSliderValue(value, n))}
                  />
                </>
              )}
              <Divider
                bounds={b(PADDING, layout.separatorY, width - 2 * PADDING, SEPARATOR_HEIGHT)}
                relativeTo={pb}
              />
              <Checkbox
                {...common}
                bounds={b(PADDING, layout.sharedY, width - 2 * PADDING, SHARED_HEIGHT)}
                label="Same in all Tools"
                checked={shared}
                onCheckedChange={onSharedChange}
              />
            </ScrollArea>
          </div>,
          document.body,
        )}
    </>
  );
}
