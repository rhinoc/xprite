import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { PaletteWarning, PaletteWarningTarget } from "$/components/palette/palette-warning";
import { useColorProfile } from "$/components/tools/color-profile";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi, tUiSource } from "$/i18n";
import {
  asepriteColorHoverSample,
  asepriteColorHoverDescription,
} from "$/managers/colors/color-hover";
import type { ColorHoverValue } from "$/managers/colors/color-hover-store";
import { useColorSource } from "$/managers/colors/color-sources";
import type { useWorkingColorDrag } from "$/managers/colors/working-color-drag";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import {
  displayEditorColorInSrgb as colorProfileToSrgb,
  parseEditorColor as hexToRgba,
  formatEditorColor as rgbaToHex,
  editorColorToHsva as rgbaToHsva,
  hsvaToEditorColor as hsvaToRgba,
  findEditorPaletteColor as paletteColorIndex,
  TOOL_COLOR_CHANNEL_MAX as UINT8_MAX,
  type EditorColorProfile as AsepriteColorProfile,
} from "$/managers/tools/color-control";
import { CanvasSurface, useUi, type SurfaceBounds } from "@xprite/ui";
import { UiIcon, UiPart } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import { clientPoint, clientToSurface, stylusPointerInputProps } from "@xprite/ui/utils";

// Aseprite ColorTintShadeTone inventory: GUI(2,389,74,85). Border3, bars8 each, main63.
// This surface also includes the foreground/background fields ending at Aseprite y1020.
const asepriteColorControlsBounds = {
  x: 4,
  y: 778,
  width: 148,
  height: 242,
};
const COLOR_FIELD_HEIGHT = 30;
const COLOR_FIELD_GAP = 8;
const COLOR_FIELDS_TOP_INSET = 4;
const COLOR_FIELDS_FOOTER_HEIGHT =
  COLOR_FIELDS_TOP_INSET + COLOR_FIELD_HEIGHT * 2 + COLOR_FIELD_GAP;
const COLOR_SELECTOR_BAR_HEIGHT = 16;
const COLOR_SELECTOR_VERTICAL_INSET = 6;
enum SelectorPointerButton {
  Foreground = 0,
  Background = 2,
}
const colorFieldBounds = (bounds: SurfaceBounds, selectorHeight: number) => [
  {
    x: bounds.x,
    y: bounds.y + selectorHeight + COLOR_FIELDS_TOP_INSET,
    width: bounds.width,
    height: COLOR_FIELD_HEIGHT,
  },
  {
    x: bounds.x,
    y: bounds.y + selectorHeight + COLOR_FIELDS_TOP_INSET + COLOR_FIELD_HEIGHT + COLOR_FIELD_GAP,
    width: bounds.width,
    height: COLOR_FIELD_HEIGHT,
  },
];
type Rgb = [number, number, number];
function rgba(value: string) {
  try {
    return hexToRgba(value);
  } catch {
    return [UINT8_MAX, UINT8_MAX, UINT8_MAX, UINT8_MAX] as const;
  }
}
function rgb(value: string): Rgb {
  const [r, g, b] = rgba(value);
  return [r, g, b];
}
function colorAlpha(value: string) {
  return rgba(value)[3] / UINT8_MAX;
}
function colorHex(h: number, s: number, v: number, a: number) {
  const next = hsvaToRgba([h * 360, s, v, a * UINT8_MAX]);
  const hex = rgbaToHex(next).toLowerCase();
  return a < 1 && next[3] === UINT8_MAX ? `${hex}ff` : hex;
}
function hsv(color: Rgb): [number, number, number] {
  const [h, s, v] = rgbaToHsva(color);
  return [h / 360, s, v];
}
function hsvRgb(h: number, s: number, v: number): Rgb {
  const [r, g, b] = hsvaToRgba([h * 360, s, v, UINT8_MAX]);
  return [r, g, b];
}
/** Convert only raster samples; HSV/channel interaction remains working-space. */
function displayRgb(color: Rgb, profile?: AsepriteColorProfile): string {
  const displayed = colorProfileToSrgb(
    [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), UINT8_MAX],
    profile,
  );
  color = [displayed[0], displayed[1], displayed[2]];
  return `rgb(${color.map((value) => Math.round(Math.max(0, Math.min(UINT8_MAX, value)))).join(",")})`;
}
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
  /** Omit when this standalone primitive has no palette context. */
  palette?: readonly (readonly number[])[];
  onAddColor?: (target: "foreground" | "background") => void;
  canAddColor?: boolean;
  bounds?: SurfaceBounds;
  className?: string;
  style?: CSSProperties;
}
/** Pixel UI color selector and color buttons with normal DOM interaction. */
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
  bounds = asepriteColorControlsBounds,
  className,
  style,
}: ColorFieldsProps) {
  const { style: uiStyle } = useUi();
  const colorProfile = useColorProfile();
  const warnings = [foreground, background].map(
    (color) => palette !== undefined && paletteColorIndex(palette, rgba(color)) < 0,
  );
  const selectorHeight = Math.max(0, bounds.height - COLOR_FIELDS_FOOTER_HEIGHT);
  const showHueBar = selectorHeight > COLOR_SELECTOR_BAR_HEIGHT * 2;
  const showAlphaBar = selectorHeight > COLOR_SELECTOR_BAR_HEIGHT * 3;
  const mainHeight = Math.max(
    0,
    2 *
      Math.floor(
        (selectorHeight -
          COLOR_SELECTOR_VERTICAL_INSET * 2 -
          (showHueBar ? COLOR_SELECTOR_BAR_HEIGHT : 0) -
          (showAlphaBar ? COLOR_SELECTOR_BAR_HEIGHT : 0)) /
          2,
      ),
  );
  const mainRows = mainHeight / 2;
  const hueY = bounds.y + COLOR_SELECTOR_VERTICAL_INSET + mainHeight;
  const alphaY = hueY + (showHueBar ? COLOR_SELECTOR_BAR_HEIGHT : 0);
  const fields = colorFieldBounds(bounds, selectorHeight);
  const colorBounds = fields.map((field, index) => ({
    ...field,
    width: field.width - (warnings[index] ? 26 : 0),
  }));
  const [hueOverrides, setHueOverrides] = useState<Partial<Record<WorkingColorTarget, number>>>({});
  const [localTarget, setLocalTarget] = useState(WorkingColorTarget.Foreground);
  const selectorTarget = target ?? localTarget;
  const setSelectorTarget = (value: WorkingColorTarget) => {
    setLocalTarget(value);
    onTargetChange?.(value);
  };
  const previousColors = useRef({ foreground, background });
  useEffect(() => {
    if (target !== undefined) {
      previousColors.current = { foreground, background };
      return;
    }
    if (foreground !== previousColors.current.foreground)
      setSelectorTarget(WorkingColorTarget.Foreground);
    else if (background !== previousColors.current.background)
      setSelectorTarget(WorkingColorTarget.Background);
    previousColors.current = { foreground, background };
  }, [foreground, background, target]);
  const pointerSelection = useRef<{
    pointerId: number;
    target: WorkingColorTarget;
  } | null>(null);
  const selectorColor = selectorTarget === WorkingColorTarget.Foreground ? foreground : background;
  const [baseHue, saturation, value] = hsv(rgb(selectorColor));
  const hue = saturation > 0 ? baseHue : (hueOverrides[selectorTarget] ?? baseHue);
  const opacity = colorAlpha(selectorColor);
  // The displayed target also owns keyboard channel changes. Mouse left/right
  // buttons keep their foreground/background behavior.
  const [selectorBaseHue, selectorSaturation, selectorValue] = hsv(rgb(selectorColor));
  const selectorHue =
    selectorSaturation > 0 ? selectorBaseHue : (hueOverrides[selectorTarget] ?? selectorBaseHue);
  const selectorOpacity = colorAlpha(selectorColor);
  const updateHueOverride = (target: WorkingColorTarget, next: number) =>
    setHueOverrides((previous) => ({ ...previous, [target]: next }));
  const update = (h: number, s: number, v: number, a = selectorOpacity) => {
    onColorChange?.(colorHex(h, s, v, a), selectorTarget);
  };
  const sampleAt = (
    area: "main" | "hue" | "alpha",
    event: { currentTarget: HTMLElement; clientX: number; clientY: number },
    target?: WorkingColorTarget,
  ) => {
    // A channel drag preserves the actual target's other channels immediately,
    // even before the displayed selector has switched to that target.
    const sampledColor =
      area === "main" || target === undefined
        ? selectorColor
        : target === WorkingColorTarget.Foreground
          ? foreground
          : background;
    const [sampledHue, sampledSaturation, sampledValue] = hsv(rgb(sampledColor));
    const width = controlCells,
      height = area === "main" ? mainRows : 8,
      point = clientToSurface(event.currentTarget, clientPoint(event), { width, height }),
      u = Math.max(0, Math.min(width - 1, Math.floor(point.x))),
      v = Math.max(0, Math.min(height - 1, Math.floor(point.y))),
      color = asepriteColorHoverSample(
        area,
        rgba(sampledColor),
        area === "main" ? hue : sampledHue,
        sampledSaturation,
        sampledValue,
        u,
        v,
        width,
        height,
      );
    return {
      color,
      u,
      v,
      width,
      height,
      sampledHue: area === "main" ? hue : sampledHue,
      sampledSaturation,
      sampledValue,
    };
  };
  const choose = (
    area: "main" | "hue" | "alpha",
    event: React.PointerEvent<HTMLElement>,
    target: WorkingColorTarget,
  ) => {
    const sample = sampleAt(area, event, target);
    if (area === "hue") updateHueOverride(target, sample.u / Math.max(1, sample.width - 1));
    setSelectorTarget(target);
    onColorChange?.(rgbaToHex(sample.color), target);
  };
  const hoverSample = (
    area: "main" | "hue" | "alpha",
    event: React.PointerEvent<HTMLElement>,
    target?: WorkingColorTarget,
  ) => {
    const { color, u, v, width, height, sampledHue, sampledSaturation, sampledValue } = sampleAt(
      area,
      event,
      target,
    );
    onHoverSampleColor?.({
      hex: rgbaToHex(color),
      description: asepriteColorHoverDescription(
        area,
        color,
        sampledHue,
        sampledSaturation,
        sampledValue,
        u,
        v,
        width,
        height,
      ),
    });
  };
  const pointerHandlers = (area: "main" | "hue" | "alpha") => ({
    ...stylusPointerInputProps(),
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => hoverSample(area, event),
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) onHoverSampleColor?.(null);
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      // Prevent the native range behavior from also changing the foreground color.
      event.preventDefault();
      if (
        !event.isPrimary ||
        pointerSelection.current ||
        (event.button !== SelectorPointerButton.Foreground &&
          event.button !== SelectorPointerButton.Background)
      )
        return;
      const target =
        event.button === SelectorPointerButton.Background
          ? WorkingColorTarget.Background
          : event.pointerType === "touch" || event.pointerType === "pen"
            ? selectorTarget
            : WorkingColorTarget.Foreground;
      pointerSelection.current = { pointerId: event.pointerId, target };
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      hoverSample(area, event, target);
      choose(area, event, target);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const selection = pointerSelection.current;
      hoverSample(area, event, selection?.target);
      if (
        selection?.pointerId === event.pointerId &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      )
        choose(area, event, selection.target);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (pointerSelection.current?.pointerId === event.pointerId) pointerSelection.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (!event.currentTarget.matches(":hover")) onHoverSampleColor?.(null);
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      if (pointerSelection.current?.pointerId === event.pointerId) pointerSelection.current = null;
      onHoverSampleColor?.(null);
    },
    onLostPointerCapture: (event: React.PointerEvent<HTMLElement>) => {
      if (pointerSelection.current?.pointerId === event.pointerId) pointerSelection.current = null;
      if (!event.currentTarget.matches(":hover")) onHoverSampleColor?.(null);
    },
  });
  const layout = surfaceLayout(bounds);
  const controlX = bounds.x + 6;
  const controlWidth = Math.max(2, bounds.width - 12);
  const controlCells = Math.max(1, Math.floor(controlWidth / 2));
  const mainSource = useRef<HTMLButtonElement | null>(null);
  const hueSource = useRef<HTMLInputElement | null>(null);
  const alphaSource = useRef<HTMLInputElement | null>(null);
  const readSelector = (
    area: "main" | "hue" | "alpha",
    element: HTMLElement | null,
    point: { x: number; y: number },
  ) =>
    element
      ? {
          color: sampleAt(area, { currentTarget: element, clientX: point.x, clientY: point.y })
            .color,
          profile: colorProfile,
        }
      : null;
  useColorSource(mainSource, (point) => readSelector("main", mainSource.current, point));
  useColorSource(hueSource, (point) => readSelector("hue", hueSource.current, point));
  useColorSource(alphaSource, (point) => readSelector("alpha", alphaSource.current, point));
  const paintSamples = useCallback(
    (context: CanvasRenderingContext2D) => {
      for (let y = 0; y < mainRows; y++)
        for (let x = 0; x < controlCells; x++) {
          context.fillStyle = displayRgb(
            hsvRgb(hue, (x + 0.5) / controlCells, 1 - (y + 0.5) / mainRows),
            colorProfile,
          );
          context.fillRect(
            controlX + x * 2,
            bounds.y + COLOR_SELECTOR_VERTICAL_INSET + y * 2,
            2,
            2,
          );
        }
      if (showHueBar || showAlphaBar) {
        for (let x = 0; x < controlCells; x++) {
          if (showHueBar) {
            context.fillStyle = displayRgb(hsvRgb((x + 0.5) / controlCells, 1, 1), colorProfile);
            context.fillRect(controlX + x * 2, hueY, 2, COLOR_SELECTOR_BAR_HEIGHT);
          }
          if (showAlphaBar) {
            for (let y = 0; y < COLOR_SELECTOR_BAR_HEIGHT / 2; y++) {
              const checker = (Math.floor(x / 8) + Math.floor(y / 4)) % 2 ? 192 : 128;
              const alpha = (x + 0.5) / controlCells;
              context.fillStyle = displayRgb(
                colorProfileToSrgb(rgba(selectorColor), colorProfile)
                  .slice(0, 3)
                  .map((channel) => checker * (1 - alpha) + channel * alpha) as Rgb,
              );
              context.fillRect(controlX + x * 2, alphaY + y * 2, 2, 2);
            }
          }
        }
      }
    },
    [
      alphaY,
      bounds.y,
      colorProfile,
      controlCells,
      controlX,
      selectorColor,
      hue,
      hueY,
      mainRows,
      showAlphaBar,
      showHueBar,
    ],
  );
  const buttonStyle = (bounds: SurfaceBounds): CSSProperties => {
    const field = surfaceLayout(bounds);
    return {
      position: "absolute",
      left: field.left - layout.left,
      top: field.top - layout.top,
      width: field.width,
      height: field.height,
      border: 0,
      background: "transparent",
      padding: 0,
      cursor: "var(--ui-cursor-default, default)",
    };
  };
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: layout.width,
        height: layout.height,
        backgroundColor: uiStyle.colors.workspace,
        ...style,
      }}
    >
      <CanvasSurface
        bounds={bounds}
        paint={paintSamples}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          display: "block",
          pointerEvents: "none",
        }}
      />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <UiPart
          part="editor_normal"
          scale={2}
          drawCenter={false}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1,
            display: "block",
            width: bounds.width,
            height: selectorHeight,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: controlX - bounds.x,
            top: COLOR_SELECTOR_VERTICAL_INSET,
            width: controlWidth,
            height: Math.max(0, selectorHeight - COLOR_SELECTOR_VERTICAL_INSET * 2),
            overflow: "hidden",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          {mainHeight > 0 && (
            <UiIcon
              part="color_wheel_indicator"
              x={Math.floor(saturation * controlCells) * 2 - 4}
              y={Math.floor((1 - value) * mainRows) * 2 - 4}
              color={value < 0.5 ? "#fff" : "#000"}
              scale={2}
            />
          )}
          {showHueBar && (
            <UiIcon
              part="color_wheel_indicator"
              x={Math.floor(hue * controlCells) * 2 - 4}
              y={mainHeight + 4}
              color="#000"
              scale={2}
            />
          )}
          {showAlphaBar && (
            <UiIcon
              part="color_wheel_indicator"
              x={Math.floor(opacity * controlCells) * 2 - 4}
              y={mainHeight + (showHueBar ? COLOR_SELECTOR_BAR_HEIGHT : 0) + 4}
              color="#000"
              scale={2}
            />
          )}
        </div>
      </div>
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
          focusAppearance="always"
          aria-pressed={
            target !== undefined
              ? selectorTarget ===
                (index ? WorkingColorTarget.Background : WorkingColorTarget.Foreground)
              : undefined
          }
          aria-label={tUiSource(index ? "Background color: {color}" : "Foreground color: {color}", {
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
      {onColorChange ? (
        <>
          {mainHeight > 0 && (
            <button
              ref={mainSource}
              type="button"
              role="slider"
              aria-label={tUiSource(
                selectorTarget === WorkingColorTarget.Background
                  ? "Background saturation and brightness"
                  : "Foreground saturation and brightness",
              )}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(selectorSaturation * 100)}
              aria-valuetext={tUi("ui.saturation.saturation.brightness.brightness", {
                saturation: Math.round(selectorSaturation * 100),
                brightness: Math.round(selectorValue * 100),
              })}
              style={{
                ...buttonStyle({
                  x: controlX,
                  y: bounds.y + COLOR_SELECTOR_VERTICAL_INSET,
                  width: controlWidth,
                  height: mainHeight,
                }),
                cursor: "var(--ui-cursor-eyedropper, crosshair)",
                touchAction: "none",
              }}
              {...pointerHandlers("main")}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 0.1 : 0.01;
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  update(
                    selectorHue,
                    Math.max(
                      0,
                      Math.min(
                        1,
                        selectorSaturation + (event.key === "ArrowRight" ? delta : -delta),
                      ),
                    ),
                    selectorValue,
                  );
                }
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  update(
                    selectorHue,
                    selectorSaturation,
                    Math.max(
                      0,
                      Math.min(1, selectorValue + (event.key === "ArrowUp" ? delta : -delta)),
                    ),
                  );
                }
              }}
            />
          )}
          {showHueBar && (
            <input
              ref={hueSource}
              type="range"
              aria-label={tUiSource(
                selectorTarget === WorkingColorTarget.Background
                  ? "Background hue"
                  : "Foreground hue",
              )}
              min={0}
              max={360}
              step={1}
              value={Math.round(selectorHue * 360)}
              style={{
                ...buttonStyle({
                  x: controlX,
                  y: hueY,
                  width: controlWidth,
                  height: COLOR_SELECTOR_BAR_HEIGHT,
                }),
                cursor: "var(--ui-cursor-eyedropper, crosshair)",
                opacity: 0,
                margin: 0,
                touchAction: "none",
              }}
              {...pointerHandlers("hue")}
              onChange={(event) => {
                const next = Number(event.target.value) / 360;
                updateHueOverride(selectorTarget, next);
                update(next, selectorSaturation, selectorValue);
              }}
            />
          )}
          {showAlphaBar && (
            <input
              ref={alphaSource}
              type="range"
              aria-label={tUiSource(
                selectorTarget === WorkingColorTarget.Background
                  ? "Background opacity"
                  : "Foreground opacity",
              )}
              min={0}
              max={100}
              step={1}
              value={Math.round(selectorOpacity * 100)}
              style={{
                ...buttonStyle({
                  x: controlX,
                  y: alphaY,
                  width: controlWidth,
                  height: COLOR_SELECTOR_BAR_HEIGHT,
                }),
                cursor: "var(--ui-cursor-eyedropper, crosshair)",
                opacity: 0,
                margin: 0,
                touchAction: "none",
              }}
              {...pointerHandlers("alpha")}
              onChange={(event) =>
                update(
                  selectorHue,
                  selectorSaturation,
                  selectorValue,
                  Number(event.target.value) / 100,
                )
              }
            />
          )}
        </>
      ) : null}
    </div>
  );
}
