import * as React from "react";

import { centerThemePixel, measureThemeText } from "$/base/components/theme-controls";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart, type AtlasPartName } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import {
  CanvasSurface,
  DEFAULT_SURFACE_VIEWPORT,
  surfaceLayout,
} from "$/components/canvas-surface";
import { sizedControlBounds } from "$/components/control-flow/placement";
import { position } from "$/components/slider/position";
import type { ScalarSliderProps } from "$/components/slider/types";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/slider/slider.module.css";

/** ui::Slider input semantics and SkinTheme::paintSlider split-color skins. */
export function ScalarSlider(props: ScalarSliderProps) {
  const {
    bounds: suppliedBounds,
    relativeTo,
    viewport = DEFAULT_SURFACE_VIEWPORT,
    value,
    min,
    max,
    onValueChange,
    font: labelFont,
    disabled = false,
    paintBackground,
    alphaPercentage = false,
    label,
    "aria-label": ariaLabel,
  } = props;
  const bounds = sizedControlBounds(props);
  const host = React.useRef<HTMLDivElement>(null);
  const { translateSource, definition: theme } = useTheme();
  const [focused, setFocused] = React.useState(false),
    [relative, setRelative] = React.useState(false);
  const drag = React.useRef<{
    pointer: number;
    x: number;
    value: number;
    left: boolean;
  } | null>(null);
  const typing = React.useRef({ text: "", time: 0 });
  const hi = Math.max(min, max),
    current = React.useRef(value);
  current.current = value;
  const change = React.useCallback(
    (next: number) => {
      next = Math.max(min, Math.min(hi, Math.trunc(next)));
      if (next !== current.current) {
        current.current = next;
        onValueChange(next);
      }
    },
    [min, hi, onValueChange],
  );
  React.useEffect(() => {
    const node = host.current;
    const wheel = (event: WheelEvent) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      change(current.current + Math.sign(event.deltaX) - Math.sign(event.deltaY));
    };
    node?.addEventListener("wheel", wheel, { passive: false });
    return () => node?.removeEventListener("wheel", wheel);
  }, [change, disabled]);
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId) return;
    const rect = clientRect(event.currentTarget),
      range = hi - min + 1;
    if (paintBackground) {
      // Slider::onProcessMessage uses childrenBounds in integer GUI coordinates.
      const width = Math.max(0, (bounds.width - 20) / 2);
      const x =
        Math.trunc(((clientPoint(event).x - rect.left) * bounds.width) / rect.width / 2) - 5;
      const delta = Math.trunc(((clientPoint(event).x - action.x) * bounds.width) / rect.width / 2);
      change(
        action.left
          ? min + Math.trunc((range * x) / (width || 1))
          : action.value + Math.trunc(delta * (width === 0 || range > width ? 1 : range / width)),
      );
      return;
    }
    const x = Math.trunc(((clientPoint(event).x - rect.left) * bounds.width) / rect.width);
    const delta = Math.trunc(((clientPoint(event).x - action.x) * bounds.width) / rect.width);
    change(
      action.left
        ? min + Math.trunc((range * x) / (bounds.width || 1))
        : action.value +
            Math.trunc(
              delta * (bounds.width === 0 || range > bounds.width ? 1 : range / bounds.width),
            ),
    );
  };
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    setRelative(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const layout = surfaceLayout(bounds, viewport);
  const artworkScaleX = bounds.width > 0 ? layout.width / bounds.width : 1;
  const artworkScaleY = bounds.height > 0 ? layout.height / bounds.height : 1;
  const artworkStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: layout.width,
    height: layout.height,
    overflow: "hidden",
    pointerEvents: "none",
  };
  const themeArtworkStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: bounds.width,
    height: bounds.height,
    overflow: "hidden",
    pointerEvents: "none",
    transform: `scale(${artworkScaleX}, ${artworkScaleY})`,
    transformOrigin: "top left",
  };
  const artworkPartStyle: React.CSSProperties = {
    position: "absolute",
    display: "block",
    width: bounds.width,
    height: bounds.height,
  };
  const themeValue = alphaPercentage ? Math.round((100 * value) / hi) : value;
  const themeMin = alphaPercentage ? 0 : min,
    themeMax = alphaPercentage ? 100 : hi;
  const border = alphaPercentage ? (theme.parts.slider_empty.slices?.[0] ?? 5) * 2 : 0;
  const split =
    bounds.x +
    border +
    (themeMax === themeMin
      ? 0
      : Math.trunc(
          (((bounds.width - 2 * border) / 2) * (themeValue - themeMin)) / (themeMax - themeMin),
        ) * 2);
  const splitOffset = split - bounds.x;
  const clipTrack = (full: boolean, left: number, width: number) => (
    <span
      key={`${full}-${left}`}
      style={{
        position: "absolute",
        left,
        top: 0,
        width,
        height: bounds.height,
        overflow: "hidden",
      }}
    >
      <ThemePart
        part={`slider_${full ? "full" : "empty"}${focused ? "_focused" : ""}` as AtlasPartName}
        scale={2}
        drawCenter
        style={{ ...artworkPartStyle, left: -left, top: 0 }}
      />
    </span>
  );
  const text = label ?? String(value),
    font = labelFont ?? "default",
    textHeight = font === "mini" ? 10 : 14;
  const textX = centerThemePixel(bounds.x, bounds.width, measureThemeText(text, font)) - bounds.x;
  const textY =
    centerThemePixel(bounds.y + 8, bounds.height - 18, textHeight) - bounds.y + (focused ? 2 : 0);
  const clipText = (full: boolean, left: number, width: number) => (
    <span
      key={`text-${full}`}
      style={{
        position: "absolute",
        left,
        top: 0,
        width,
        height: bounds.height,
        overflow: "hidden",
      }}
    >
      <Text
        variant={TextVariant.PositionedPixel}
        text={text}
        x={textX - left}
        y={textY}
        font={font}
        color={
          disabled
            ? theme.colors.disabled
            : full
              ? theme.colors.slider_full_text
              : theme.colors.slider_empty_text
        }
      />
    </span>
  );
  const customTrackBounds = {
    x: bounds.x + 8,
    y: bounds.y + 10,
    width: Math.max(0, bounds.width - 16),
    height: Math.max(0, bounds.height - 16),
  };
  const customTrackLayout = surfaceLayout(customTrackBounds, viewport);
  const thumbX =
    6 + (hi === min ? 0 : Math.trunc((((bounds.width - 20) / 2) * (value - min)) / (hi - min)) * 2);
  const art = paintBackground ? (
    <>
      <span aria-hidden="true" style={artworkStyle}>
        <span style={themeArtworkStyle}>
          <span style={{ position: "absolute", inset: 0, background: theme.colors.face }} />
          <ThemePart
            part="mini_slider_empty"
            scale={2}
            drawCenter
            style={{
              position: "absolute",
              left: 6,
              top: 8,
              display: "block",
              width: bounds.width - 12,
              height: bounds.height - 10,
            }}
          />
        </span>
        <CanvasSurface
          bounds={customTrackBounds}
          viewport={viewport}
          paint={(context) => paintBackground(context, customTrackBounds)}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: customTrackLayout.left - layout.left,
            top: customTrackLayout.top - layout.top,
            display: "block",
            pointerEvents: "none",
          }}
        />
        <span aria-hidden="true" style={{ ...themeArtworkStyle, zIndex: 1 }}>
          <ThemeIcon
            part={focused ? "mini_slider_thumb_focused" : "mini_slider_thumb"}
            scale={2}
            x={thumbX}
            y={0}
          />
        </span>
      </span>
    </>
  ) : (
    <>
      <span aria-hidden="true" style={themeArtworkStyle}>
        {value === min ? (
          clipTrack(false, 0, bounds.width)
        ) : value === hi ? (
          clipTrack(true, 0, bounds.width)
        ) : (
          <>
            {clipTrack(true, 0, splitOffset + 2)}
            {clipTrack(false, splitOffset + 2, bounds.width - splitOffset - 2)}
          </>
        )}
        {clipText(true, 0, splitOffset + 2)}
        {clipText(false, splitOffset + 2, bounds.width - splitOffset - 2)}
      </span>
    </>
  );
  return (
    <div
      ref={host}
      {...stylusPointerInputProps(!disabled)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={translateSource(ariaLabel ?? label ?? "Value")}
      data-label-source={ariaLabel ?? label ?? "Value"}
      aria-valuemin={min}
      aria-valuemax={hi}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      className={cn(styles.slider, relative && styles.sliderRelative)}
      style={position(bounds, relativeTo, viewport, !!suppliedBounds)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          x: clientPoint(event).x,
          value,
          left: event.button === 0,
        };
        setRelative(event.button !== 0);
        move(event);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={() => {
        drag.current = null;
        setRelative(false);
      }}
      onKeyDown={(event) => {
        if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = performance.now();
        if (now - typing.current.time > 1500) typing.current = { text: "", time: now };
        let next = value;
        switch (event.key) {
          case "ArrowLeft":
            next--;
            break;
          case "ArrowRight":
            next++;
            break;
          case "PageDown":
            next -= Math.trunc((hi - min + 1) / 4);
            break;
          case "PageUp":
            next += Math.trunc((hi - min + 1) / 4);
            break;
          case "Home":
            next = min;
            break;
          case "End":
            next = hi;
            break;
          case "Backspace": {
            const str = String(value);
            next =
              str.length === 1 || (value < 0 && str.length === 2) || value === min
                ? value > 0 && min < 0
                  ? 0
                  : min
                : Number.parseInt(str.slice(0, -1), 10);
            break;
          }
          default:
            if (!/^[0-9-]$/.test(event.key)) return;
        }
        if (next === value) {
          const draft = typing.current.text + (event.key.length === 1 ? event.key : "");
          if (draft === "-") {
            typing.current.text = draft;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (!/^-?\d+$/.test(draft)) return;
          typing.current.text = draft;
          next = Number.parseInt(draft, 10);
        }
        event.preventDefault();
        event.stopPropagation();
        const clamped = Math.max(min, Math.min(hi, next));
        if (clamped !== value) typing.current.text = String(clamped);
        change(clamped);
      }}
    >
      {art}
    </div>
  );
}
