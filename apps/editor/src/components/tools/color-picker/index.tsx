import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorPopover } from "$/components/dialogs/overlay";
import { useColorProfile } from "$/components/tools/color-profile";
import { tUi, tUiSource } from "$/i18n";
import { useScreenColorPicker } from "$/managers/colors/screen-color-picker";
import {
  ColorPickerMode as ColorMode,
  useColorPickerPreferences,
} from "$/managers/colors/use-color-picker-preferences";
import {
  displayEditorColorInSrgb as colorProfileToSrgb,
  editorColorChannelValue as colorChannelValue,
  parseEditorColor as hexToRgba,
  formatEditorColor as rgbaToHex,
  editorColorToHsva as rgbaToHsva,
  editorColorToHsla as rgbaToHsla,
  setEditorColorChannel as setColorChannel,
  setEditorHsvaChannel as setHsvaChannel,
  setEditorHslaChannel as setHslaChannel,
  hslaToEditorColor as hslaToRgba,
  hsvaToEditorColor as hsvaToRgba,
  ToolColorChannel as ColorChannel,
  TOOL_COLOR_CHANNEL_MAX as UINT8_MAX,
  type EditorHsla as Hsla,
  type EditorHsva as Hsva,
  type EditorColor as Rgba,
  type EditorColorProfile as AsepriteColorProfile,
  type EditorHslaChannel,
  type EditorHsvaChannel,
} from "$/managers/tools/color-control";
import {
  Button,
  ButtonVariant,
  Divider,
  Input,
  Slider,
  Tooltip,
  useUi,
  Text,
  TextVariant,
} from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { measureUiText, UiIcon, UiPart } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import { cn } from "@xprite/ui/utils";

import styles from "$/components/tools/color-picker/color-picker.module.css";

function ColorPickerLayer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(styles.layer, className)} />;
}

function ColorSwatchGroup({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn(styles.swatchGroup, className)}>
      {children}
    </div>
  );
}

function ColorPickerError({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn(styles.error, className)} />;
}

export interface ColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onScreenColorChange?: (value: string) => void;
  title?: string;
  /** Aseprite scene coordinates of the color button; popup fits below or above it. */
  anchor?: SurfaceBounds;
}
const LABELS: Record<ColorChannel, string> = {
  [ColorChannel.Red]: "Red",
  [ColorChannel.Green]: "Green",
  [ColorChannel.Blue]: "Blue",
  [ColorChannel.Hue]: "Hue",
  [ColorChannel.Saturation]: "Saturation",
  [ColorChannel.Value]: "Value",
  [ColorChannel.Lightness]: "Lightness",
  [ColorChannel.Gray]: "Gray value",
  [ColorChannel.Alpha]: "Alpha",
};
const CHANNEL_MARKS: Record<ColorChannel, string> = {
  [ColorChannel.Red]: "R",
  [ColorChannel.Green]: "G",
  [ColorChannel.Blue]: "B",
  [ColorChannel.Hue]: "H",
  [ColorChannel.Saturation]: "S",
  [ColorChannel.Value]: "V",
  [ColorChannel.Lightness]: "L",
  [ColorChannel.Gray]: "V",
  [ColorChannel.Alpha]: "A",
};
const SCREEN_PICKER_ERROR_HEIGHT = 30;
const COLOR_HEADER_HEIGHT = 36;
const COLOR_SWATCH_X = 364;
const COLOR_SWATCH_WIDTH = 60;
const SCREEN_PICKER_BUTTON_GAP = 8;
const SCREEN_PICKER_BUTTON_X = COLOR_SWATCH_X + COLOR_SWATCH_WIDTH + SCREEN_PICKER_BUTTON_GAP;
const SCREEN_PICKER_BUTTON_SIZE = 32;
const SCREEN_PICKER_ICON_SCALE = 1.5;
const COLOR_PICKER_PREFERRED_WIDTH = 600;
const COLOR_PICKER_SINGLE_ROW_MIN_WIDTH = 500;
const COLOR_PICKER_HEADER_ROW_GAP = 8;
const COLOR_PICKER_CHANNEL_VALUE_WIDTH = 96;
const COLOR_PICKER_NARROW_HEADER_OFFSET_X = 236;
const channelMaximum = (channel: ColorChannel) =>
  channel === ColorChannel.Hue
    ? 360
    : channel === ColorChannel.Saturation ||
        channel === ColorChannel.Value ||
        channel === ColorChannel.Lightness
      ? 100
      : UINT8_MAX;
function paintChannel(
  context: CanvasRenderingContext2D,
  bounds: SurfaceBounds,
  color: Rgba,
  channel: ColorChannel,
  mode: ColorMode,
  hsv: Hsva,
  hsl: Hsla,
  colorProfile?: AsepriteColorProfile,
): void {
  const maximum = channelMaximum(channel);
  const logicalWidth = Math.max(1, Math.floor(bounds.width / 2));
  const logicalHeight = Math.max(1, Math.floor(bounds.height / 2));
  for (let logicalX = 0; logicalX < logicalWidth; logicalX++) {
    const x = logicalX * 2;
    const amount = (maximum * logicalX) / Math.max(1, logicalWidth - 1);
    const next =
      channel === ColorChannel.Alpha
        ? setColorChannel(color, channel, Math.floor(amount))
        : mode === ColorMode.Hsv
          ? hsvaToRgba(setHsvaChannel(hsv, channel as EditorHsvaChannel, amount))
          : mode === ColorMode.Hsl
            ? hslaToRgba(setHslaChannel(hsl, channel as EditorHslaChannel, amount))
            : mode === ColorMode.Gray
              ? setColorChannel(color, ColorChannel.Gray, Math.floor(amount))
              : setColorChannel(color, channel, Math.floor(amount));
    if (channel === ColorChannel.Alpha) {
      const middle = Math.floor(logicalHeight / 2) * 2;
      const odd = Math.floor(logicalX / logicalHeight) % 2;
      ctxFill(context, bounds.x + x, bounds.y, 2, middle, odd ? "#c0c0c0" : "#808080");
      ctxFill(
        context,
        bounds.x + x,
        bounds.y + middle,
        2,
        bounds.height - middle,
        odd ? "#808080" : "#c0c0c0",
      );
    }
    const displayed = colorProfileToSrgb(next, colorProfile);
    context.fillStyle = `rgba(${displayed[0]},${displayed[1]},${displayed[2]},${channel === ColorChannel.Alpha ? next[3] / UINT8_MAX : 1})`;
    context.fillRect(bounds.x + x, bounds.y, 2, bounds.height);
  }
}
function ctxFill(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}
/** ColorPopup/ColorSliders composition. Conversion and channel math live in editor-core. */
export function ColorPicker({
  open,
  onOpenChange,
  value,
  onValueChange,
  onScreenColorChange,
  title = "Color",
  anchor,
}: ColorPickerProps) {
  const colorProfile = useColorProfile();
  const scene = useSceneBounds();
  const { style: uiStyle } = useUi();
  const { mode: preferredMode, setMode: rememberMode } = useColorPickerPreferences();
  const [mode, setMode] = useState<ColorMode>(preferredMode);
  const [hsvDraft, setHsvDraft] = useState<Hsva>([0, 0, 0, UINT8_MAX]);
  const [hslDraft, setHslDraft] = useState<Hsla>([0, 0, 0, UINT8_MAX]);
  const emitted = useRef<string | null>(null);
  const rememberedHue = hsvDraft[0];
  const [oldColor, setOldColor] = useState(value);
  const [invalidHex, setInvalidHex] = useState(false);
  const screenPicker = useScreenColorPicker(
    open,
    title,
    (next) => {
      const picked = hexToRgba(next);
      if (mode === ColorMode.Mask) setMode(preferredMode);
      setInvalidHex(false);
      setHsvDraft(rgbaToHsva(picked));
      setHslDraft(rgbaToHsla(picked));
      emitted.current = next;
      (onScreenColorChange ?? onValueChange)(next);
    },
    colorProfile,
  );
  const wasOpen = useRef(false);
  let color: Rgba;
  try {
    color = hexToRgba(value);
  } catch {
    color = [0, 0, 0, UINT8_MAX];
  }
  const latest = useRef(color);
  latest.current = color;
  useEffect(() => {
    if (open && !wasOpen.current) {
      setOldColor(value);
      setMode(preferredMode);
      setInvalidHex(false);
      setHsvDraft(rgbaToHsva(latest.current));
      setHslDraft(rgbaToHsla(latest.current));
    }
    wasOpen.current = open;
  }, [open, value, preferredMode]);
  useEffect(() => {
    if (value !== emitted.current) {
      setHsvDraft(rgbaToHsva(latest.current));
      setHslDraft(rgbaToHsla(latest.current));
    }
  }, [value]);
  const channels: ColorChannel[] =
    mode === ColorMode.Rgb
      ? [ColorChannel.Red, ColorChannel.Green, ColorChannel.Blue, ColorChannel.Alpha]
      : mode === ColorMode.Hsv
        ? [ColorChannel.Hue, ColorChannel.Saturation, ColorChannel.Value, ColorChannel.Alpha]
        : mode === ColorMode.Hsl
          ? [ColorChannel.Hue, ColorChannel.Saturation, ColorChannel.Lightness, ColorChannel.Alpha]
          : mode === ColorMode.Gray
            ? [ColorChannel.Gray, ColorChannel.Alpha]
            : [];
  const width = Math.min(COLOR_PICKER_PREFERRED_WIDTH, scene.width),
    narrowHeader = width < COLOR_PICKER_SINGLE_ROW_MIN_WIDTH,
    headerOffsetY = narrowHeader ? COLOR_HEADER_HEIGHT + COLOR_PICKER_HEADER_ROW_GAP : 0,
    headerOffsetX = narrowHeader ? COLOR_PICKER_NARROW_HEADER_OFFSET_X : 0,
    height =
      (mode === ColorMode.Mask ? 88 : 58 + channels.length * 30) +
      headerOffsetY +
      (screenPicker.error ? SCREEN_PICKER_ERROR_HEIGHT : 0),
    bounds = {
      x: anchor
        ? Math.max(0, Math.min(scene.width - width, anchor.x))
        : Math.round((scene.width - width) / 2),
      y: anchor
        ? Math.max(
            0,
            anchor.y + anchor.height + height <= scene.height
              ? anchor.y + anchor.height
              : anchor.y - height,
          )
        : Math.round((scene.height - height) / 2),
      width,
      height,
    };
  if (!open) return null;
  // ColorSliders uses a three-column grid with one-letter channel labels.
  const labelColumn =
    Math.max(0, ...channels.map((channel) => measureUiText(CHANNEL_MARKS[channel]))) + 4;
  const publishColor = (next: Rgba, preserve?: ColorMode.Hsv | ColorMode.Hsl) => {
    if (preserve !== ColorMode.Hsv) setHsvDraft(rgbaToHsva(next));
    if (preserve !== ColorMode.Hsl) setHslDraft(rgbaToHsla(next));
    setInvalidHex(false);
    const hex = rgbaToHex(next);
    emitted.current = hex;
    onValueChange(hex);
  };
  const changeChannel = (channel: ColorChannel, next: number) => {
    if (mode === ColorMode.Mask) return;
    if (mode === ColorMode.Hsv) {
      const hsv = setHsvaChannel(hsvDraft, channel as EditorHsvaChannel, next);
      publishColor(hsvaToRgba(hsv), ColorMode.Hsv);
      return;
    }
    if (mode === ColorMode.Hsl) {
      const hsl = setHslaChannel(hslDraft, channel as EditorHslaChannel, next);
      publishColor(hslaToRgba(hsl), ColorMode.Hsl);
      return;
    }
    publishColor(
      mode === ColorMode.Gray && channel !== ColorChannel.Alpha
        ? setColorChannel(latest.current, ColorChannel.Gray, next)
        : setColorChannel(latest.current, channel, next),
    );
  };
  const commitHex = (text: string) => {
    try {
      const next = hexToRgba(text);
      if (mode === ColorMode.Mask) setMode(preferredMode);
      publishColor(next);
    } catch {
      setInvalidHex(true);
    }
  };
  const selectMode = (nextMode: ColorMode) => {
    setMode(nextMode);
    rememberMode(nextMode);
    const next =
      nextMode === ColorMode.Mask
        ? ([0, 0, 0, 0] as Rgba)
        : nextMode === ColorMode.Gray
          ? (() => {
              const gray = Math.max(color[0], color[1], color[2]);
              return [gray, gray, gray, color[3]] as Rgba;
            })()
          : color;
    publishColor(next);
  };
  const restoreOldColor = () => {
    if (mode === ColorMode.Mask) setMode(preferredMode);
    try {
      publishColor(hexToRgba(oldColor));
    } catch {
      // The original controlled value was valid when the popup opened.
    }
  };
  return (
    <ColorPickerLayer
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <EditorPopover
        open
        onOpenChange={onOpenChange}
        label={title}
        bounds={bounds}
        closeOnEnter
        closeOnOutsideClick={!screenPicker.busy}
        scrollX={false}
      >
        {({ clientBounds: c }) => (
          <>
            {(
              [ColorMode.Rgb, ColorMode.Hsv, ColorMode.Hsl, ColorMode.Gray, ColorMode.Mask] as const
            ).map((item, i) => (
              <Button
                key={item}
                bounds={{
                  x: c.x + [0, 38, 76, 112, 158][i],
                  y: c.y,
                  width: [40, 40, 38, 48, 52][i],
                  height: 36,
                }}
                part="buttonset_item_normal"
                hotPart="buttonset_item_hot"
                selectedPart="buttonset_item_hot"
                pushedPart="buttonset_item_pushed"
                relativeTo={c}
                text={item}
                font="mini"
                color={uiStyle.colors.text}
                selected={item === mode}
                aria-label={tUi("ui.color.mode.2", { value1: tUiSource(item) })}
                aria-pressed={item === mode}
                onClick={() => selectMode(item)}
              />
            ))}
            {!narrowHeader && <HeaderSeparator x={c.x + 224} y={c.y} relativeTo={c} />}
            <Text
              variant={TextVariant.Control}
              bounds={{
                x: c.x + 238 - headerOffsetX,
                y: c.y + 12 + headerOffsetY,
                width: 20,
                height: 14,
              }}
              relativeTo={c}
              text="#"
            />
            <Input
              bounds={{
                x: c.x + 260 - headerOffsetX,
                y: c.y + headerOffsetY,
                width: 96,
                height: 36,
              }}
              relativeTo={c}
              value={value.replace(/^#/, "").toLowerCase()}
              aria-label="Hexadecimal color"
              aria-invalid={invalidHex || undefined}
              maxLength={9}
              onCommit={commitHex}
              onInput={(event) => {
                const text = event.currentTarget.value;
                if (/^#?(?:[\da-f]{6}|[\da-f]{8})$/i.test(text)) commitHex(text);
              }}
            />
            <ColorSwatches
              bounds={{
                x: c.x + COLOR_SWATCH_X - headerOffsetX,
                y: c.y + headerOffsetY,
                width: COLOR_SWATCH_WIDTH,
                height: COLOR_HEADER_HEIGHT,
              }}
              relativeTo={c}
              colors={[oldColor, value]}
              onSelect={(index) => (index === 0 ? restoreOldColor() : undefined)}
            />
            <Tooltip
              text={tUi(
                screenPicker.available ? "ui.screen.color.pick" : "ui.screen.color.unavailable",
              )}
            >
              <Button
                variant={ButtonVariant.Icon}
                part="toolbutton_normal"
                hotPart="toolbutton_hot"
                pushedPart="toolbutton_pushed"
                bounds={{
                  x: c.x + SCREEN_PICKER_BUTTON_X - headerOffsetX,
                  y: c.y + headerOffsetY + (COLOR_HEADER_HEIGHT - SCREEN_PICKER_BUTTON_SIZE) / 2,
                  width: SCREEN_PICKER_BUTTON_SIZE,
                  height: SCREEN_PICKER_BUTTON_SIZE,
                }}
                relativeTo={c}
                aria-label={tUi("ui.screen.color.pick")}
                aria-busy={screenPicker.busy}
                disabled={!screenPicker.available || screenPicker.busy}
                onClick={
                  screenPicker.available && !screenPicker.busy
                    ? () => {
                        void screenPicker.pick();
                      }
                    : undefined
                }
              >
                <UiIcon
                  part="tool_eyedropper"
                  scale={SCREEN_PICKER_ICON_SCALE}
                  style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}
                />
              </Button>
            </Tooltip>
            {screenPicker.error && (
              <Text
                variant={TextVariant.Control}
                bounds={{
                  x: c.x + 8,
                  y:
                    c.y +
                    headerOffsetY +
                    (mode === ColorMode.Mask ? 64 : 44 + channels.length * 30),
                  width: c.width - 16,
                  height: 22,
                }}
                relativeTo={c}
                text={screenPicker.error}
                role="alert"
              />
            )}
            {mode === ColorMode.Mask && (
              <Text
                variant={TextVariant.Control}
                bounds={{
                  x: c.x + 8,
                  y: c.y + 50 + headerOffsetY,
                  width: c.width - 16,
                  height: 22,
                }}
                relativeTo={c}
                text="Transparent Color Selected"
              />
            )}
            {channels.map((channel, i) => {
              const y = c.y + headerOffsetY + 44 + i * 30,
                max = channelMaximum(channel),
                current = Math.round(
                  mode === ColorMode.Hsv && channel !== ColorChannel.Alpha
                    ? channel === ColorChannel.Hue
                      ? hsvDraft[0]
                      : (channel === ColorChannel.Saturation ? hsvDraft[1] : hsvDraft[2]) * 100
                    : mode === ColorMode.Hsl && channel !== ColorChannel.Alpha
                      ? channel === ColorChannel.Hue
                        ? hslDraft[0]
                        : (channel === ColorChannel.Saturation ? hslDraft[1] : hslDraft[2]) * 100
                      : colorChannelValue(color, channel, rememberedHue),
                );
              return (
                <span key={channel}>
                  <Text
                    variant={TextVariant.Control}
                    bounds={{ x: c.x + 2, y: y + 8, width: 14, height: 14 }}
                    relativeTo={c}
                    text={CHANNEL_MARKS[channel]}
                  />
                  <Slider
                    bounds={{
                      x: c.x + labelColumn,
                      y,
                      width: c.width - COLOR_PICKER_CHANNEL_VALUE_WIDTH - labelColumn,
                      height: 30,
                    }}
                    relativeTo={c}
                    value={current}
                    min={0}
                    max={max}
                    onValueChange={(next) => changeChannel(channel, next)}
                    aria-label={LABELS[channel]}
                    paintBackground={(context, rect) =>
                      paintChannel(
                        context,
                        rect,
                        color,
                        channel,
                        mode,
                        hsvDraft,
                        hslDraft,
                        colorProfile,
                      )
                    }
                  />
                  <Input
                    bounds={{
                      x: c.x + c.width - COLOR_PICKER_CHANNEL_VALUE_WIDTH,
                      y,
                      width: COLOR_PICKER_CHANNEL_VALUE_WIDTH,
                      height: 30,
                    }}
                    relativeTo={c}
                    mini
                    value={String(current)}
                    aria-label={tUi("ui.value.2", { value1: tUiSource(LABELS[channel]) })}
                    inputMode="numeric"
                    onCommit={(text) => {
                      if (text.trim() && Number.isFinite(Number(text)))
                        changeChannel(channel, Number(text));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                        changeChannel(channel, current + (event.key === "ArrowUp" ? 1 : -1));
                      }
                    }}
                  />
                </span>
              );
            })}
            {invalidHex && (
              <ColorPickerError role="alert">
                {tUi("ui.enter.6.or.8.hexadecimal.digits")}
              </ColorPickerError>
            )}
          </>
        )}
      </EditorPopover>
    </ColorPickerLayer>
  );
}

/** ColorShades::ClickEntries view: two 12-GUI-unit cells, 3-unit inset. */
function ColorSwatches({
  bounds,
  relativeTo,
  colors,
  onSelect,
}: {
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
  colors: readonly string[];
  onSelect: (index: number) => void;
}) {
  const colorProfile = useColorProfile(),
    [hot, setHot] = useState(-1);
  const layout = surfaceLayout(bounds),
    origin = surfaceLayout({
      ...bounds,
      x: relativeTo.x,
      y: relativeTo.y,
    });
  const scaleX = bounds.width > 0 ? layout.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? layout.height / bounds.height : 1;
  return (
    <ColorSwatchGroup
      style={{
        left: layout.left - origin.left,
        top: layout.top - origin.top,
        width: layout.width,
        height: layout.height,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: bounds.width,
          height: bounds.height,
          overflow: "hidden",
          pointerEvents: "none",
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: "top left",
        }}
      >
        <UiPart
          part="sunken_normal"
          scale={2}
          drawCenter
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "block",
            width: bounds.width,
            height: bounds.height,
          }}
        />
        {colors.map((value, index) => {
          const color = colorProfileToSrgb(hexToRgba(value), colorProfile);
          return (
            <span
              key={index}
              style={{
                position: "absolute",
                left: 6 + index * 24,
                top: 6,
                width: 24,
                height: 24,
                overflow: "hidden",
              }}
            >
              {color[3] < UINT8_MAX &&
                Array.from({ length: 4 }, (_, checkerIndex) => {
                  const odd = (checkerIndex % 2) + Math.floor(checkerIndex / 2);
                  return (
                    <span
                      key={checkerIndex}
                      style={{
                        position: "absolute",
                        left: (checkerIndex % 2) * 12,
                        top: Math.floor(checkerIndex / 2) * 12,
                        width: 12,
                        height: 12,
                        background: odd % 2 ? "#808080" : "#c0c0c0",
                      }}
                    />
                  );
                })}
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `rgba(${color[0]},${color[1]},${color[2]},${color[3] / UINT8_MAX})`,
                }}
              />
            </span>
          );
        })}
        {hot >= 0 && (
          <UiPart
            part="colorbar_selection_hot"
            scale={2}
            drawCenter
            style={{
              position: "absolute",
              left: hot * 24,
              top: 0,
              display: "block",
              width: 36,
              height: 36,
            }}
          />
        )}
      </span>
      {colors.map((_, index) => (
        <button
          key={index}
          type="button"
          aria-label={index === 0 ? tUi("ui.restore.original.color") : tUi("ui.current.color")}
          onPointerEnter={() => setHot(index)}
          onPointerLeave={() => setHot(-1)}
          onFocus={() => setHot(index)}
          onBlur={() => setHot(-1)}
          onClick={() => onSelect(index)}
          style={{ left: `${((6 + index * 24) / 60) * 100}%`, width: "40%" }}
        />
      ))}
    </ColorSwatchGroup>
  );
}

function HeaderSeparator({
  x,
  y,
  relativeTo,
}: {
  x: number;
  y: number;
  relativeTo: { x: number; y: number };
}) {
  return <Divider bounds={{ x, y, width: 4, height: 34 }} relativeTo={relativeTo} vertical />;
}
