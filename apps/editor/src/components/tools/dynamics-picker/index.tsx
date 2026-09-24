import * as React from "react";
import { createPortal } from "react-dom";

import { DitheringSelector } from "$/components/tools/dithering-selector";
import { tUi, tUiSource } from "$/i18n";
import {
  setDynamicsStabilizer,
  type DynamicsSettings,
} from "$/managers/preferences/dynamics-state";
import {
  DynamicsSensorControl as AsepriteDynamicSensor,
  DynamicsColorFlow as AsepriteDynamicsColorDirection,
} from "$/managers/tools/tool-options";
import { Button, Label } from "@xprite/ui";
import { Checkbox } from "@xprite/ui";
import { Slider, SliderVariant } from "@xprite/ui";
import { Divider } from "@xprite/ui";
import { Tooltip } from "@xprite/ui";
import { type SurfaceBounds, type SurfaceViewport, useUi } from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { anchoredPopoverStyle, useAnchoredPopover } from "@xprite/ui/popover";
import { clientPoint } from "@xprite/ui/utils";

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
  showOptionsGrid?: boolean;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
}
const PARAMETERS = ["size", "angle", "gradient"] as const;
const NAMES = { size: "Size", angle: "Angle", gradient: "Gradient" };

/** DynamicsPopup owns its conditional layout and input responses. Preferences remain controlled. */
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
  showOptionsGrid = true,
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
  const [sensor, setSensor] = React.useState({ pressure: 0, velocity: 0 });
  const previous = React.useRef<{ x: number; y: number; t: number; vx: number; vy: number } | null>(
    null,
  );
  const id = React.useId();
  const active = PARAMETERS.some((key) => value[key] !== AsepriteDynamicSensor.Static);
  const pressure = PARAMETERS.some((key) => value[key] === AsepriteDynamicSensor.Pressure),
    velocity = PARAMETERS.some((key) => value[key] === AsepriteDynamicSensor.Velocity);
  // dynamics.xml natural layout; a preview-bearing DitheringSelector expands
  // the options grid to 176 GUI pixels while ButtonSet keeps its own size.
  const width = value.gradient !== AsepriteDynamicSensor.Static ? 364 : 260;
  const contentWidth = width - 12;
  let cursor = 46;
  const gridY = cursor;
  if (showOptionsGrid) cursor += 110;
  const headingY = cursor;
  if (active) cursor += 22;
  const rows: Partial<Record<(typeof PARAMETERS)[number], number>> = {};
  for (const key of PARAMETERS)
    if (value[key] !== AsepriteDynamicSensor.Static) {
      rows[key] = cursor;
      cursor += key === "gradient" ? 58 : 56;
    }
  const sensorHeadingY = cursor;
  if (active) cursor += 22;
  const pressureY = cursor;
  if (pressure) cursor += 28;
  const velocityY = cursor;
  if (velocity) cursor += 28;
  const separatorY = cursor + (active ? 8 : 0),
    sharedY = separatorY + 16,
    height = sharedY + 32;
  const pb = popup ? { x: popup.x, y: popup.y, width, height } : null;
  const update = (next: Partial<DynamicsSettings>) => onValueChange({ ...value, ...next });
  const open = () => {
    openPopover({ width, height });
    if (value.size !== AsepriteDynamicSensor.Static && brushSize === 1) onBrushSizeChange(4);
    previous.current = null;
  };
  const b = (x: number, y: number, w: number, h: number): SurfaceBounds => ({
    x: (pb?.x ?? 0) + x,
    y: (pb?.y ?? 0) + y,
    width: w,
    height: h,
  });
  const common = { relativeTo: pb ?? undefined, viewport: popup?.viewport ?? viewport };
  return (
    <>
      <Tooltip text="Dynamics" placement="bottom" disabled={!!popup}>
        <Button
          bounds={bounds}
          relativeTo={relativeTo}
          viewport={viewport}
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
              if (popup) close();
              else open();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) {
              if (popup) close();
              else open();
            }
          }}
        />
      </Tooltip>
      {popup &&
        pb &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={tUi("ui.dynamics")}
            onPointerEnter={() => {
              previous.current = null;
            }}
            onPointerMove={(e) => {
              const sx = popup.viewport.width / popup.viewport.sceneWidth,
                sy = popup.viewport.height / popup.viewport.sceneHeight;
              const x = clientPoint(e).x / sx,
                y = clientPoint(e).y / sy,
                t = e.timeStamp,
                prev = previous.current;
              const a = prev ? Math.max(0, Math.min(1, (t - prev.t) / 50)) : 0;
              const vx = prev ? (1 - a) * prev.vx + a * (x - prev.x) : 0,
                vy = prev ? (1 - a) * prev.vy + a * (y - prev.y) : 0;
              previous.current = { x, y, t, vx, vy };
              setSensor((old) => ({
                pressure: e.pointerType === "pen" ? e.pressure : old.pressure,
                velocity: Math.min(1, Math.hypot(vx, vy) / 32),
              }));
            }}
            style={{
              ...anchoredPopoverStyle(popup, pb),
              backgroundColor: uiStyle.colors.menuitem_normal_face,
            }}
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
            <Tooltip text="Stabilizer radius to avoid shaky lines" placement="bottom">
              <Checkbox
                {...common}
                bounds={b(6, 6, 112, 32)}
                label="Stabilizer"
                checked={value.stabilizer}
                onCheckedChange={(enabled) => onValueChange(setDynamicsStabilizer(value, enabled))}
              />
            </Tooltip>
            <Slider
              {...common}
              bounds={b(126, 6, width - 132, 32)}
              variant={SliderVariant.Normal}
              font="mini"
              min={0}
              max={64}
              value={value.stabilizer ? value.stabilizerFactor : 0}
              aria-label="Stabilizer factor"
              onValueChange={(factor) =>
                update({ stabilizerFactor: factor, stabilizer: factor > 0 })
              }
            />
            {showOptionsGrid &&
              ["", "Pressure", "Velocity", "Size", "", "", "Angle", "", "", "Gradient", "", ""].map(
                (text, index) => {
                  const col = index % 3,
                    row = Math.floor(index / 3),
                    parameter = PARAMETERS[row - 1];
                  const choice =
                    col === 1 ? AsepriteDynamicSensor.Pressure : AsepriteDynamicSensor.Velocity;
                  const check = row > 0 && col > 0;
                  return (
                    <Button
                      key={index}
                      {...common}
                      bounds={b(6 + [0, 72, 150][col], gridY + row * 24, [74, 80, 70][col], 30)}
                      text={text}
                      icon={check && value[parameter] === choice ? "drop_pixels_ok" : undefined}
                      aria-label={
                        check
                          ? tUi("ui.with", {
                              value1: tUiSource(NAMES[parameter]),
                              value2: tUiSource(choice),
                            })
                          : text || "Dynamics matrix"
                      }
                      aria-pressed={check ? value[parameter] === choice : undefined}
                      onClick={() => {
                        if (check) {
                          const next =
                            value[parameter] === choice ? AsepriteDynamicSensor.Static : choice;
                          update({ [parameter]: next });
                          if (
                            parameter === "size" &&
                            next !== AsepriteDynamicSensor.Static &&
                            brushSize === 1
                          )
                            onBrushSizeChange(4);
                        }
                      }}
                    />
                  );
                },
              )}
            {active && (
              <Divider
                bounds={b(6, headingY, contentWidth, 22)}
                relativeTo={pb}
                text="Min/Max Values"
              />
            )}
            {PARAMETERS.map((parameter) => {
              const y = rows[parameter];
              if (y === undefined) return null;
              return (
                <React.Fragment key={parameter}>
                  <Label
                    {...common}
                    bounds={b(8, y, 74, parameter === "gradient" ? 30 : 28)}
                    text={NAMES[parameter]}
                    font="mini"
                  />
                  {parameter === "gradient" ? (
                    <>
                      <DitheringSelector
                        {...common}
                        bounds={b(82, y, contentWidth - 76, 58)}
                        value={value.matrixName}
                        onValueChange={(matrixName) => update({ matrixName })}
                      />
                      <Label
                        {...common}
                        bounds={b(8, y + 30, 74, 28)}
                        font="mini"
                        text={
                          value.colorFromTo ===
                          AsepriteDynamicsColorDirection.BackgroundToForeground
                            ? "BG > FG"
                            : "FG > BG"
                        }
                      />
                      <button
                        aria-label={tUi("ui.gradient.direction")}
                        title={tUi("ui.gradient.direction")}
                        onClick={() =>
                          update({
                            colorFromTo:
                              value.colorFromTo ===
                              AsepriteDynamicsColorDirection.BackgroundToForeground
                                ? AsepriteDynamicsColorDirection.ForegroundToBackground
                                : AsepriteDynamicsColorDirection.BackgroundToForeground,
                          })
                        }
                        style={{
                          position: "absolute",
                          left:
                            surfaceLayout(b(6, 0, 0, 0), popup.viewport).left -
                            surfaceLayout(pb, popup.viewport).left,
                          top:
                            surfaceLayout(b(0, y + 30, 0, 0), popup.viewport).top -
                            surfaceLayout(pb, popup.viewport).top,
                          width: (76 * popup.viewport.width) / popup.viewport.sceneWidth,
                          height: (28 * popup.viewport.height) / popup.viewport.sceneHeight,
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          cursor: "var(--ui-cursor-default,default)",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <Slider
                        {...common}
                        bounds={b(82, y, contentWidth - 76, 28)}
                        variant={SliderVariant.Normal}
                        font="mini"
                        min={parameter === "size" ? 1 : -180}
                        max={parameter === "size" ? 64 : 180}
                        value={parameter === "size" ? value.minSize : value.minAngle}
                        aria-label={tUi("ui.minimum", { value1: tUiSource(parameter) })}
                        onValueChange={(n) =>
                          update(parameter === "size" ? { minSize: n } : { minAngle: n })
                        }
                      />
                      <Slider
                        {...common}
                        bounds={b(82, y + 28, contentWidth - 76, 28)}
                        variant={SliderVariant.Normal}
                        font="mini"
                        min={parameter === "size" ? 1 : -180}
                        max={parameter === "size" ? 64 : 180}
                        value={parameter === "size" ? brushSize : brushAngle}
                        aria-label={tUi("ui.maximum", { value1: tUiSource(parameter) })}
                        onValueChange={
                          parameter === "size" ? onBrushSizeChange : onBrushAngleChange
                        }
                      />
                    </>
                  )}
                </React.Fragment>
              );
            })}
            {active && (
              <Divider
                bounds={b(6, sensorHeadingY, contentWidth, 22)}
                relativeTo={pb}
                text="Sensor Threshold"
              />
            )}
            {pressure && (
              <>
                <Label {...common} bounds={b(8, pressureY, 74, 28)} text="Pressure" font="mini" />
                <Slider
                  variant={SliderVariant.Threshold}
                  {...common}
                  bounds={b(82, pressureY, contentWidth - 76, 28)}
                  aria-label="Pressure threshold"
                  value={[value.minPressureThreshold, value.maxPressureThreshold]}
                  sensorValue={sensor.pressure}
                  onValueChange={([minPressureThreshold, maxPressureThreshold]) =>
                    update({ minPressureThreshold, maxPressureThreshold })
                  }
                />
              </>
            )}
            {velocity && (
              <>
                <Label {...common} bounds={b(8, velocityY, 74, 28)} text="Velocity" font="mini" />
                <Slider
                  variant={SliderVariant.Threshold}
                  {...common}
                  bounds={b(82, velocityY, contentWidth - 76, 28)}
                  aria-label="Velocity threshold"
                  value={[value.minVelocityThreshold, value.maxVelocityThreshold]}
                  sensorValue={sensor.velocity}
                  onValueChange={([minVelocityThreshold, maxVelocityThreshold]) =>
                    update({ minVelocityThreshold, maxVelocityThreshold })
                  }
                />
              </>
            )}
            <Divider bounds={b(6, separatorY, contentWidth, 8)} relativeTo={pb} />
            <Checkbox
              {...common}
              bounds={b(6, sharedY, contentWidth, 24)}
              label="Same in all Tools"
              checked={shared}
              onCheckedChange={onSharedChange}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
