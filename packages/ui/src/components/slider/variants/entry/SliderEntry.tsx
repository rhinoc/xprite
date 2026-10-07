import * as React from "react";
import { createPortal } from "react-dom";

import { Input } from "$/base/components/theme-controls";
import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { ThemeScope } from "$/base/theme/theme-scope";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { usesNativeTextEditing } from "$/base/utils/native-text-input";
import { UINT8_MAX } from "$/base/utils/numeric-constants";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import {
  DEFAULT_SURFACE_VIEWPORT,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import type { ControlPlacement, SizedControlPlacement } from "$/components/control-flow/placement";
import { InputTouchActivation } from "$/components/input/touch-activation";
import { measurePopoverAnchor, anchoredPopoverStyle } from "$/components/popover/anchored";
import { Text, TextVariant } from "$/components/text";
import { Tooltip } from "$/components/tooltip";

import styles from "$/components/slider/variants/entry/entry.module.css";

interface SliderEntryContentProps {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  suffix?: string;
  /** AlphaEntry conversion: stored 0..255, displayed/dragged as 0..100%. */
  valueFormat?: "integer" | "percentage";
  disabled?: boolean;
  readOnly?: boolean;
  mini?: boolean;
  tooltip?: string;
  "aria-label": string;
}
export type SliderEntryProps = SliderEntryContentProps & SizedControlPlacement;

type Popup = {
  bounds: SurfaceBounds;
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  availableHeight: number;
};

/** IntEntry's editable number and transparent, focus-preserving popup slider. */
export function SliderEntry(props: SliderEntryProps) {
  const {
    bounds: suppliedBounds,
    relativeTo,
    value,
    min,
    max,
    onValueChange,
    suffix,
    valueFormat = "integer",
    disabled,
    readOnly,
    mini,
    tooltip,
    "aria-label": label,
  } = props;
  const placement: ControlPlacement = suppliedBounds
    ? { bounds: suppliedBounds, relativeTo }
    : { pixelSize: props.pixelSize };
  const { translateKey, translateSource, definition: theme } = useTheme();
  const { measureThemeText } = useThemeText();
  const host = React.useRef<HTMLSpanElement>(null);
  const slider = React.useRef<HTMLDivElement>(null);
  const [popup, setPopup] = React.useState<Popup | null>(null);
  const drag = React.useRef<{
    pointer: number;
    mode: "entry" | "absolute" | "relative";
    x: number;
    value: number;
  } | null>(null);
  const percentage = valueFormat === "percentage";
  const lo = percentage ? 0 : min,
    hi = percentage ? 100 : Math.max(min, max);
  const displayValue = percentage ? Math.round((value * 100) / UINT8_MAX) : value;
  const text = `${displayValue}${percentage ? "%" : ""}`;
  const displayLabel = translateSource(label);
  const tooltipText = tooltip ?? label;
  const current = React.useRef({ value, displayValue, onValueChange });
  current.current = { value, displayValue, onValueChange };
  const input = () => host.current?.querySelector("input");
  const change = React.useCallback(
    (next: number, fromDisplay = true) => {
      const stored = Math.max(
        min,
        Math.min(
          Math.max(min, max),
          Math.round(percentage && fromDisplay ? (next * UINT8_MAX) / 100 : next),
        ),
      );
      if (stored !== current.current.value) current.current.onValueChange(stored);
    },
    [min, max, percentage],
  );
  const selectText = () =>
    requestAnimationFrame(() => {
      const node = input();
      if (node && !node.readOnly && node.ownerDocument.activeElement === node) node.select();
    });
  const close = React.useCallback(() => {
    setPopup(null);
    drag.current = null;
  }, []);
  const open = (focus = true) => {
    if (disabled || readOnly) return;
    const node = input();
    if (!node) return;
    const anchor = measurePopoverAnchor(node, DEFAULT_SURFACE_VIEWPORT);
    let x = anchor.bounds.x,
      y = anchor.bottom;
    if (x + 256 > anchor.availableWidth) x -= 256 - anchor.bounds.width;
    if (y + 32 > anchor.availableHeight) y = anchor.bounds.y - 32;
    setPopup({
      bounds: { x: Math.max(0, x), y: Math.max(0, y), width: 256, height: 32 },
      viewport: anchor.viewport,
      origin: anchor.origin,
      availableHeight: anchor.availableHeight,
    });
    if (focus) {
      node.focus({ preventScroll: true });
      selectText();
    }
  };
  React.useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (disabled || readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      // Browser pixels represent platform wheel ticks; each nonzero axis is one step.
      change(current.current.value + Math.sign(event.deltaX) - Math.sign(event.deltaY), false);
      selectText();
    };
    const nodes = [host.current, slider.current];
    nodes.forEach((node) => node?.addEventListener("wheel", wheel, { passive: false }));
    return () => nodes.forEach((node) => node?.removeEventListener("wheel", wheel));
  }, [change, popup, disabled, readOnly]);
  React.useEffect(() => {
    if (!popup) return;
    const outside = (event: PointerEvent) => {
      if (
        !host.current?.contains(event.target as Node) &&
        !slider.current?.contains(event.target as Node)
      ) {
        input()?.blur();
        close();
      }
    };
    const move = (event: PointerEvent) => {
      const action = drag.current,
        rect = slider.current ? clientRect(slider.current) : undefined;
      if (!action || event.pointerId !== action.pointer || !rect) return;
      if (action.mode === "entry") {
        if (
          clientPoint(event).x < rect.left ||
          clientPoint(event).x > rect.right ||
          clientPoint(event).y < rect.top ||
          clientPoint(event).y > rect.bottom
        )
          return;
        action.mode = "absolute";
      }
      const range = hi - lo + 1;
      const sceneDelta =
        ((clientPoint(event).x - action.x) * popup.viewport.sceneWidth) / popup.viewport.width;
      const next =
        action.mode === "relative"
          ? action.value + Math.trunc(sceneDelta * (range > 256 ? 1 : range / 256))
          : lo + Math.trunc((range * (clientPoint(event).x - rect.left)) / rect.width);
      change(Math.max(lo, Math.min(hi, next)));
      selectText();
      event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointer) drag.current = null;
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", close);
    };
  }, [popup, change, close, lo, hi]);
  React.useEffect(() => {
    if (disabled || readOnly) close();
  }, [disabled, readOnly, close]);
  const layout = popup && surfaceLayout(popup.bounds, popup.viewport);
  const popupArt =
    popup && layout
      ? (() => {
          const b = popup.bounds;
          const split =
            b.x + (hi === lo ? 0 : Math.trunc((b.width * (displayValue - lo)) / (hi - lo)));
          const splitOffset = split - b.x;
          const scaleX = b.width > 0 ? layout.width / b.width : 1;
          const scaleY = b.height > 0 ? layout.height / b.height : 1;
          const artworkStyle: React.CSSProperties = {
            position: "absolute",
            left: 0,
            top: 0,
            width: b.width,
            height: b.height,
            overflow: "hidden",
            pointerEvents: "none",
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "top left",
          };
          const clipPart = (full: boolean, left: number, width: number) => (
            <span
              key={`part-${full}-${left}`}
              style={{
                position: "absolute",
                left,
                top: 0,
                width,
                height: b.height,
                overflow: "hidden",
              }}
            >
              <ThemePart
                part={full ? "slider_full" : "slider_empty"}
                scale={2}
                drawCenter
                style={{
                  position: "absolute",
                  left: -left,
                  top: 0,
                  display: "block",
                  width: b.width,
                  height: b.height,
                }}
              />
            </span>
          );
          const clipText = (full: boolean, left: number, width: number) => (
            <span
              key={`text-${full}`}
              style={{
                position: "absolute",
                left,
                top: 0,
                width,
                height: b.height,
                overflow: "hidden",
              }}
            >
              <Text
                variant={TextVariant.PositionedPixel}
                text={text}
                x={centerThemePixel(b.x, b.width, measureThemeText(text)) - b.x - left}
                y={8}
                color={full ? theme.colors.slider_full_text : theme.colors.slider_empty_text}
              />
            </span>
          );
          return (
            <span aria-hidden="true" style={artworkStyle}>
              {displayValue === lo ? (
                clipPart(false, 0, b.width)
              ) : displayValue === hi ? (
                clipPart(true, 0, b.width)
              ) : (
                <>
                  {clipPart(true, 0, splitOffset + 1)}
                  {clipPart(false, splitOffset + 1, b.width - splitOffset - 1)}
                </>
              )}
              {clipText(true, 0, splitOffset + 1)}
              {clipText(false, splitOffset + 1, b.width - splitOffset - 1)}
            </span>
          );
        })()
      : null;
  return (
    <span
      ref={host}
      className={styles.sliderEntryHost}
      onPointerDownCapture={(event) => {
        if (disabled || readOnly || !host.current?.contains(event.target as Node)) return;
        if (usesNativeTextEditing(event)) {
          drag.current = null;
          return;
        }
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          mode: "entry",
          x: clientPoint(event).x,
          value: displayValue,
        };
        open();
      }}
      onKeyDownCapture={(event) => {
        if (isImeKeyboardEvent(event.nativeEvent)) return;
        if (event.key === "Escape" && popup) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key === "Enter" || event.key === "Tab") close();
      }}
    >
      <Tooltip text={tooltipText} placement="bottom" disabled={disabled || !!popup}>
        {(getTriggerProps) => (
          <Input
            {...getTriggerProps()}
            {...placement}
            mini={mini}
            value={text}
            suffix={suffix}
            aria-label={label}
            aria-haspopup="dialog"
            inputMode="numeric"
            touchActivation={InputTouchActivation.DoubleTap}
            onTouchTap={() => open(false)}
            disabled={disabled}
            readOnly={readOnly}
            onCommit={(draft) => {
              const parsed = Number.parseInt(draft.replace(/%/g, ""), 10);
              change(Number.isFinite(parsed) ? parsed : lo);
            }}
            onKeyDown={(event) => {
              if (
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                event.key.length === 1 &&
                !/\d/.test(event.key)
              )
                event.preventDefault();
            }}
          />
        )}
      </Tooltip>
      {popup &&
        layout &&
        createPortal(
          <ThemeScope>
            <div
              ref={slider}
              data-popup=""
              {...stylusPointerInputProps(!disabled && !readOnly)}
              role="slider"
              aria-label={`${displayLabel} ${translateKey("ui.slider")}`}
              aria-valuemin={lo}
              aria-valuemax={hi}
              aria-valuenow={displayValue}
              aria-valuetext={text}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  pointer: event.pointerId,
                  mode: event.button === 0 ? "absolute" : "relative",
                  x: clientPoint(event).x,
                  value: displayValue,
                };
                if (event.button === 0) {
                  const rect = clientRect(event.currentTarget);
                  change(
                    Math.max(
                      lo,
                      Math.min(
                        hi,
                        lo +
                          Math.trunc(
                            ((hi - lo + 1) * (clientPoint(event).x - rect.left)) / rect.width,
                          ),
                      ),
                    ),
                  );
                }
                selectText();
              }}
              className={styles.sliderPopup}
              style={{
                ...anchoredPopoverStyle(popup, popup.bounds, {
                  zIndex: 10020,
                  constrainToViewport: false,
                }),
              }}
            >
              {popupArt}
            </div>
          </ThemeScope>,
          document.body,
        )}
    </span>
  );
}
