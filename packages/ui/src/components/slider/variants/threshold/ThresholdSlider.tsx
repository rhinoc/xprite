import * as React from "react";

import { centerThemePixel } from "$/base/components/theme-controls";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { DEFAULT_SURFACE_VIEWPORT, RASTER_SCALE, surfaceLayout } from "$/components/canvas-surface";
import { sizedControlBounds } from "$/components/control-flow/placement";
import { position } from "$/components/slider/position";
import type { ThresholdSliderProps } from "$/components/slider/types";

import styles from "$/components/slider/slider.module.css";
import variantStyles from "$/components/slider/variants/threshold/threshold.module.css";

const THUMB_TRACK_INSET_X = 10;
const THUMB_HALF_WIDTH = 4;
const TRACK_INSET_X = 6;
const TRACK_INSET_TOP = 8;
const TRACK_INSET_BOTTOM = 2;
const MIN_TRACK_BODY_HEIGHT = 8;
const MIN_INTERACTIVE_WIDTH = 1;
const SENSOR_HEIGHT_DIVISOR = 8;

/** DynamicsPopup::ThresholdSlider: click captures nearest endpoint; moving pushes crossed endpoints. */
export function ThresholdSlider(props: ThresholdSliderProps) {
  const {
    bounds: suppliedBounds,
    relativeTo,
    viewport = DEFAULT_SURFACE_VIEWPORT,
    value,
    onValueChange,
    sensorValue = 0,
    "aria-label": label = "Threshold",
  } = props;
  const bounds = sizedControlBounds(props);
  const [focused, setFocused] = React.useState(false);
  const { definition: theme, translateSource } = useTheme();
  const drag = React.useRef<{ pointer: number; endpoint: 0 | 1 } | null>(null),
    current = React.useRef(value);
  current.current = value;
  // mini_slider_empty uses a 3*guiscale inset after its 4px top edge and 6px bottom edge.
  const innerX = THUMB_TRACK_INSET_X,
    innerWidth = Math.max(MIN_INTERACTIVE_WIDTH, bounds.width - THUMB_TRACK_INSET_X * 2),
    minX = innerX + Math.trunc(innerWidth * value[0]),
    maxX = innerX + Math.trunc(innerWidth * value[1]);
  const hasTrack = bounds.height - TRACK_INSET_TOP > MIN_TRACK_BODY_HEIGHT;
  const trackX = hasTrack ? TRACK_INSET_X : 0,
    trackY = TRACK_INSET_TOP,
    trackWidth = hasTrack ? bounds.width - TRACK_INSET_X * 2 : bounds.width,
    trackHeight = hasTrack
      ? bounds.height - TRACK_INSET_TOP - TRACK_INSET_BOTTOM
      : bounds.height - TRACK_INSET_TOP;
  const sensorHeight = Math.trunc(trackHeight / SENSOR_HEIGHT_DIVISOR) * RASTER_SCALE,
    sensorWidth = Math.trunc(trackWidth * Math.max(0, Math.min(1, sensorValue))),
    sensorTop =
      centerThemePixel(bounds.y + trackY, trackHeight, sensorHeight, RASTER_SCALE) - bounds.y;
  const thumb = focused ? "mini_slider_thumb_focused" : "mini_slider_thumb";
  const scaleX = viewport.width / viewport.sceneWidth,
    scaleY = viewport.height / viewport.sceneHeight,
    layout = surfaceLayout(bounds, viewport),
    artworkOffsetX = bounds.x * scaleX - layout.left,
    artworkOffsetY = bounds.y * scaleY - layout.top;
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      {...stylusPointerInputProps()}
      role="group"
      aria-label={translateSource(label)}
      data-label-source={label}
      tabIndex={0}
      className={cn(styles.slider, variantStyles.thresholdSlider)}
      style={position(bounds, relativeTo, viewport, !!suppliedBounds)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = clientRect(event.currentTarget);
        const u =
          Math.trunc(((clientPoint(event).x - rect.left) * bounds.width) / rect.width) - innerX;
        const minX = innerX + Math.trunc(innerWidth * value[0]),
          maxX = innerX + Math.trunc(innerWidth * value[1]);
        drag.current = {
          pointer: event.pointerId,
          endpoint: Math.abs(u - minX) < Math.abs(u - maxX) ? 0 : 1,
        };
      }}
      onPointerMove={(event) => {
        const action = drag.current;
        if (!action || action.pointer !== event.pointerId) return;
        const rect = clientRect(event.currentTarget);
        const u = Math.max(
          0,
          Math.min(
            1,
            (Math.trunc(((clientPoint(event).x - rect.left) * bounds.width) / rect.width) -
              innerX) /
              innerWidth,
          ),
        );
        const next: [number, number] =
          action.endpoint === 0
            ? [u, Math.max(u, current.current[1])]
            : [Math.min(u, current.current[0]), u];
        current.current = next;
        onValueChange(next);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <span
        aria-hidden="true"
        className={variantStyles.artwork}
        style={{
          left: artworkOffsetX,
          top: artworkOffsetY,
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scaleX}, ${scaleY})`,
        }}
      >
        <span
          className={variantStyles.face}
          style={{ width: bounds.width, height: bounds.height, backgroundColor: theme.colors.face }}
        >
          {hasTrack && (
            <ThemePart
              part="mini_slider_empty"
              scale={RASTER_SCALE}
              drawCenter
              style={{
                position: "absolute",
                left: trackX,
                top: trackY,
                width: trackWidth,
                height: trackHeight,
              }}
            />
          )}
          {value[0] > 0 && (
            <ThemePart
              part="mini_slider_full"
              scale={RASTER_SCALE}
              drawCenter
              style={{
                position: "absolute",
                left: trackX,
                top: trackY,
                width: minX - trackX,
                height: trackHeight,
              }}
            />
          )}
          {value[1] < 1 && (
            <ThemePart
              part="mini_slider_full"
              scale={RASTER_SCALE}
              drawCenter
              style={{
                position: "absolute",
                left: maxX,
                top: trackY,
                width: trackX + trackWidth - maxX,
                height: trackHeight,
              }}
            />
          )}
          <span
            className={variantStyles.sensor}
            style={{
              left: trackX,
              top: sensorTop,
              width: sensorWidth,
              height: sensorHeight,
              backgroundColor: theme.colors.slider_empty_text,
            }}
          />
          <ThemeIcon part={thumb} scale={RASTER_SCALE} x={minX - THUMB_HALF_WIDTH} y={0} />
          <ThemeIcon part={thumb} scale={RASTER_SCALE} x={maxX - THUMB_HALF_WIDTH} y={0} />
        </span>
      </span>
    </div>
  );
}
