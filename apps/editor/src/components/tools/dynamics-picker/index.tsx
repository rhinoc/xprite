import * as React from "react";

import { DitheringSelector } from "$/components/tools/dithering-selector";
import { tUi, tUiSource } from "$/i18n";
import {
  setSlowTracking,
  SLOW_TRACKING_MAX,
  type DynamicsSettings,
} from "$/managers/preferences/dynamics-state";
import {
  DynamicsSensorControl as BrushDynamicInput,
  DynamicsColorFlow as BrushColorOrder,
} from "$/managers/tools/tool-options";
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
import { UiPart } from "@xprite/ui/assets";
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
  showOptionsGrid?: boolean;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
}
const PARAMETERS = ["size", "angle", "color"] as const;
const NAMES = { size: "Size", angle: "Angle", color: "Gradient" };
const SLOW_TRACKING_LABEL = "Slow tracking";
const SLOW_TRACKING_DESCRIPTION =
  "Smooths shaky pointer movement. Higher values follow the cursor more slowly.";

/** Brush dynamics panel. Preferences stay controlled by the editor. */
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
  const id = React.useId();
  const active = PARAMETERS.some((key) => value[key] !== BrushDynamicInput.Off);
  const width = value.color !== BrushDynamicInput.Off ? 364 : 260;
  const contentWidth = width - 12;
  let cursor = 46;
  const gridY = cursor;
  if (showOptionsGrid) cursor += 110;
  const headingY = cursor;
  if (active) cursor += 22;
  const rows: Partial<Record<(typeof PARAMETERS)[number], number>> = {};
  for (const key of PARAMETERS)
    if (value[key] !== BrushDynamicInput.Off) {
      rows[key] = cursor;
      cursor += key === "color" ? 58 : 56;
    }
  const separatorY = cursor + (active ? 8 : 0),
    sharedY = separatorY + 16,
    height = sharedY + 32;
  const pb = popup ? { x: popup.x, y: popup.y, width, height } : null;
  const update = (next: Partial<DynamicsSettings>) => onValueChange({ ...value, ...next });
  const open = () => {
    openPopover({ width, height });
    if (value.size !== BrushDynamicInput.Off && brushSize === 1) onBrushSizeChange(4);
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
              <Tooltip text={SLOW_TRACKING_DESCRIPTION} placement={TooltipPlacement.Bottom}>
                <Checkbox
                  {...common}
                  bounds={b(6, 6, 148, 32)}
                  label={SLOW_TRACKING_LABEL}
                  checked={value.slowTracking}
                  onCheckedChange={(enabled) => onValueChange(setSlowTracking(value, enabled))}
                />
              </Tooltip>
              <Slider
                {...common}
                bounds={b(156, 6, width - 162, 32)}
                font={FontRole.Compact}
                min={0}
                max={SLOW_TRACKING_MAX}
                value={value.slowTracking ? value.slowTrackingAmount : 0}
                aria-label={SLOW_TRACKING_LABEL}
                onValueChange={(amount) =>
                  update({ slowTrackingAmount: amount, slowTracking: amount > 0 })
                }
              />
              {showOptionsGrid &&
                ["", "Pressure", "Speed", "Size", "", "", "Angle", "", "", "Gradient", "", ""].map(
                  (text, index) => {
                    const col = index % 3,
                      row = Math.floor(index / 3),
                      parameter = PARAMETERS[row - 1];
                    const choice = col === 1 ? BrushDynamicInput.Pressure : BrushDynamicInput.Speed;
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
                                value2: tUiSource(col === 1 ? "Pressure" : "Speed"),
                              })
                            : text || "Dynamics matrix"
                        }
                        aria-pressed={check ? value[parameter] === choice : undefined}
                        onClick={() => {
                          if (check) {
                            const next =
                              value[parameter] === choice ? BrushDynamicInput.Off : choice;
                            update({ [parameter]: next });
                            if (
                              parameter === "size" &&
                              next !== BrushDynamicInput.Off &&
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
                    <Text
                      variant={TextVariant.Control}
                      {...common}
                      bounds={b(8, y, 74, parameter === "color" ? 30 : 28)}
                      text={NAMES[parameter]}
                      font={FontRole.Compact}
                    />
                    {parameter === "color" ? (
                      <>
                        <DitheringSelector
                          {...common}
                          bounds={b(82, y, contentWidth - 76, 58)}
                          value={value.ditherMatrix}
                          onValueChange={(ditherMatrix) => update({ ditherMatrix })}
                        />
                        <Text
                          variant={TextVariant.Control}
                          {...common}
                          bounds={b(8, y + 30, 74, 28)}
                          font={FontRole.Compact}
                          text={
                            value.colorOrder === BrushColorOrder.BackgroundToForeground
                              ? "BG > FG"
                              : "FG > BG"
                          }
                        />
                        <button
                          aria-label={tUi("ui.gradient.direction")}
                          title={tUi("ui.gradient.direction")}
                          onClick={() =>
                            update({
                              colorOrder:
                                value.colorOrder === BrushColorOrder.BackgroundToForeground
                                  ? BrushColorOrder.ForegroundToBackground
                                  : BrushColorOrder.BackgroundToForeground,
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
                          font={FontRole.Compact}
                          min={parameter === "size" ? 1 : -180}
                          max={parameter === "size" ? 64 : 180}
                          value={parameter === "size" ? value.minSize : value.minAngle}
                          aria-label={tUi("ui.minimum", { value1: tUiSource(NAMES[parameter]) })}
                          onValueChange={(n) =>
                            update(parameter === "size" ? { minSize: n } : { minAngle: n })
                          }
                        />
                        <Slider
                          {...common}
                          bounds={b(82, y + 28, contentWidth - 76, 28)}
                          font={FontRole.Compact}
                          min={parameter === "size" ? 1 : -180}
                          max={parameter === "size" ? 64 : 180}
                          value={parameter === "size" ? brushSize : brushAngle}
                          aria-label={tUi("ui.maximum", { value1: tUiSource(NAMES[parameter]) })}
                          onValueChange={
                            parameter === "size" ? onBrushSizeChange : onBrushAngleChange
                          }
                        />
                      </>
                    )}
                  </React.Fragment>
                );
              })}
              <Divider bounds={b(6, separatorY, contentWidth, 8)} relativeTo={pb} />
              <Checkbox
                {...common}
                bounds={b(6, sharedY, contentWidth, 24)}
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
