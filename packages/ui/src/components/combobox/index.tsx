import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";

import { Input } from "$/base/components/theme-controls";
import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart, ThemeIcon } from "$/base/theme/theme-part";
import { ThemeRepeat } from "$/base/theme/theme-repeat";
import { ThemeScope } from "$/base/theme/theme-scope";
import { hitElement, clientPoint, clientRect } from "$/base/utils/dom-geometry";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  RASTER_SCALE,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import type { ControlPlacement } from "$/components/control-flow/placement";
import { useFieldControl } from "$/components/field/Field";
import type { InputTouchActivation } from "$/components/input/touch-activation";
import { measurePopoverAnchor, anchoredPopoverStyle } from "$/components/popover/anchored";
import { Scrollbar } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/combobox/combobox.module.css";
interface ComboboxContentProps {
  /** Width in theme pixels; keep the skin's natural height. */
  pixelWidth?: number;
  value: string;
  options: readonly { value: string; label: string; disabled?: boolean; separator?: boolean }[];
  onValueChange: (value: string) => void;
  /** Live edits for dependent drafts; onValueChange remains the commit callback. */
  onDraftValueChange?: (value: string) => void;
  disabled?: boolean;
  /** Editable scene entry; typed values and list choices use the same commit callback. */
  editable?: boolean;
  /** Expand the option list to fit its labels, within the available viewport. */
  fitPopupToContent?: boolean;
  suffix?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  touchActivation?: InputTouchActivation;
  title?: string;
  buttonLabel?: string;
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label": string;
}
export type ComboboxProps = ComboboxContentProps & ControlPlacement;

type PopupLayout = {
  bounds: SurfaceBounds;
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  availableHeight: number;
  innerHeight: number;
};
const DEFAULT_ROW = 18;
const DEFAULT_COMBOBOX_SIZE = { width: 72, height: 12 };
const POPUP_LABEL_RESERVE = 24;
/** Source ComboBox: non-editable entry + arrow button, and a Window/View/ListBox popup. */
export function Combobox({
  bounds: suppliedBounds,
  pixelSize,
  pixelWidth,
  relativeTo = { x: 0, y: 0 },
  value,
  options,
  onValueChange,
  onDraftValueChange,
  disabled = false,
  editable = false,
  fitPopupToContent = false,
  suffix,
  inputMode,
  touchActivation,
  title,
  buttonLabel,
  id: controlId,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": label,
}: ComboboxProps) {
  const fieldAttributes = useFieldControl({
    id: controlId,
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
  });
  const { definition: theme, translateSource, translateKey } = useTheme();
  const { measureThemeText, themeFontHeight, centerThemePixel: centerText } = useThemeText();
  const popupMenu = theme.controlParts?.combobox?.popupMenu;
  const rowHeight = popupMenu ? (theme.dimensions.menu_row_height ?? DEFAULT_ROW) : DEFAULT_ROW;
  const insetX = popupMenu ? 1 : 6;
  const insetY = popupMenu ? 1 : 8;
  const bottomInset = popupMenu ? 1 : 6;
  const barSize = popupMenu ? (theme.controlParts?.scrollbar?.arrowExtent ?? 16) : 12;
  const labelInset = popupMenu ? (theme.dimensions.menu_text_inset ?? 17) - insetX : 2;
  const bounds = suppliedBounds ?? {
    x: 0,
    y: 0,
    width: pixelSize
      ? pixelSize.width * RASTER_SCALE
      : pixelWidth !== undefined
        ? pixelWidth * RASTER_SCALE
        : (theme.dimensions.combobox_width ?? DEFAULT_COMBOBOX_SIZE.width * RASTER_SCALE),
    height: pixelSize
      ? pixelSize.height * RASTER_SCALE
      : (theme.dimensions.combobox_height ?? DEFAULT_COMBOBOX_SIZE.height * RASTER_SCALE),
  };
  const layout = surfaceLayout(bounds),
    id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    anchor = useRef<HTMLSpanElement>(null),
    list = useRef<HTMLDivElement>(null);
  const editableInputWasFocused = useRef(false);
  const triggerClickHandled = useRef(false);
  const gesture = useRef<{
    pointer: number;
    entered: boolean;
    arrow: boolean;
  } | null>(null);
  const [popup, setPopup] = useState<PopupLayout | null>(null),
    [scroll, setScroll] = useState(0);
  const [focused, setFocused] = useState(false),
    [hovered, setHovered] = useState(false),
    [arrowHot, setArrowHot] = useState(false),
    [pressed, setPressed] = useState(false);
  const rowHeights = options.map((o) => (o.separator ? (popupMenu ? 8 : 16) : rowHeight));
  const rowOffsets = options.map((_, i) => rowHeights.slice(0, i).reduce((a, b) => a + b, 0));
  const contentHeight = rowHeights.reduce((a, b) => a + b, 0);
  const selected = options.findIndex((option) => option.value === value),
    text = selected >= 0 ? translateSource(options[selected].label) : value,
    displayLabel = translateSource(label),
    displayTitle = title ? translateSource(title) : undefined,
    displayButtonLabel = buttonLabel ? translateSource(buttonLabel) : undefined;
  const latest = useRef({ options, onValueChange, selected });
  latest.current = { options, onValueChange, selected };
  const close = useCallback(
    (restore = true) => {
      gesture.current = null;
      setPressed(false);
      setPopup(null);
      const input = anchor.current?.querySelector<HTMLInputElement>("input");
      const restoreTarget = editable
        ? editableInputWasFocused.current
          ? input
          : null
        : trigger.current;
      editableInputWasFocused.current = false;
      if (restore) restoreTarget?.focus({ preventScroll: true });
    },
    [editable],
  );
  const choose = useCallback((index: number) => {
    const current = latest.current;
    if (
      index >= 0 &&
      !current.options[index]?.disabled &&
      !current.options[index]?.separator &&
      current.options[index]?.value !== current.options[current.selected]?.value
    )
      current.onValueChange(current.options[index].value);
  }, []);
  const open = () => {
    if (disabled || !anchor.current || !options.length) return;
    editableInputWasFocused.current =
      editable &&
      anchor.current.querySelector<HTMLInputElement>("input") === document.activeElement;
    const anchorBounds = measurePopoverAnchor(anchor.current, DEFAULT_SURFACE_VIEWPORT, bounds);
    const { viewport, origin, availableWidth, availableHeight } = anchorBounds;
    const popupWidth = Math.min(
      availableWidth,
      fitPopupToContent
        ? Math.max(
            bounds.width,
            ...options.map(
              (option) => measureThemeText(translateSource(option.label)) + POPUP_LABEL_RESERVE,
            ),
          )
        : bounds.width,
    );
    const x = Math.max(0, Math.min(availableWidth - popupWidth, anchorBounds.bounds.x));
    const top = anchorBounds.top,
      bottom = anchorBounds.bottom;
    const innerHeight = Math.min(
      contentHeight,
      Math.max(rowHeight, Math.max(top, availableHeight - bottom) - insetY - bottomInset - 2),
    );
    const height = innerHeight + insetY + bottomInset,
      y = bottom + height <= availableHeight ? bottom : Math.max(0, top - height);
    setScroll(
      Math.max(
        0,
        Math.min(
          contentHeight - innerHeight,
          (rowOffsets[selected] ?? 0) - Math.floor(innerHeight / 2) + rowHeight / 2,
        ),
      ),
    );
    setPopup({
      bounds: { x, y, width: popupWidth, height },
      viewport,
      origin,
      availableHeight,
      innerHeight,
    });
  };
  useEffect(() => {
    if (disabled) close(false);
  }, [disabled, close]);
  useEffect(() => {
    if (!popup) return;
    if (!editable) list.current?.focus({ preventScroll: true });
    const optionAt = (event: PointerEvent) => {
      const node = hitElement(
        { x: clientPoint(event).x, y: clientPoint(event).y },
        document,
      )?.closest<HTMLElement>("[data-ui-combo-option]");
      return node?.dataset.uiComboOwner === id ? Number(node.dataset.uiComboOption) : -1;
    };
    const outside = (event: PointerEvent) => {
      if (
        !list.current?.contains(event.target as Node) &&
        !anchor.current?.contains(event.target as Node)
      )
        close(false);
    };
    const move = (event: PointerEvent) => {
      if (gesture.current?.pointer !== event.pointerId) return;
      const index = optionAt(event);
      if (index >= 0) {
        gesture.current.entered = true;
        choose(index);
      }
    };
    const up = (event: PointerEvent) => {
      if (gesture.current?.pointer !== event.pointerId) return;
      const entered = gesture.current.entered;
      gesture.current = null;
      setPressed(false);
      if (entered) close();
    };
    const cancel = () => {
      gesture.current = null;
      setPressed(false);
    };
    const dismiss = () => close(false);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setScroll((old) =>
        Math.max(
          0,
          Math.min(
            contentHeight - popup.innerHeight,
            old +
              (event.deltaMode
                ? Math.sign(event.deltaY) * rowHeight
                : (event.deltaY * popup.viewport.sceneHeight) / popup.viewport.height),
          ),
        ),
      );
    };
    const node = list.current;
    node?.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      node?.removeEventListener("wheel", wheel);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [popup, options, contentHeight, id, choose, close, editable]);
  const ensureVisible = (index: number) => {
    if (!popup) return;
    setScroll((old) =>
      Math.max(
        0,
        Math.min(
          contentHeight - popup.innerHeight,
          rowOffsets[index] < old
            ? rowOffsets[index]
            : rowOffsets[index] + rowHeights[index] > old + popup.innerHeight
              ? rowOffsets[index] + rowHeights[index] - popup.innerHeight
              : old,
        ),
      ),
    );
  };
  const scrollbar = !!popup && contentHeight > popup.innerHeight;
  const parts = theme.controlParts?.combobox;
  const normalFacePart = parts?.faceNormal ?? "sunken2_normal";
  const focusedFacePart = parts?.faceFocused ?? "sunken2_focused";
  const facePart =
    !disabled && hovered && parts?.faceHot
      ? parts.faceHot
      : focused && !disabled
        ? focusedFacePart
        : normalFacePart;
  const arrowSelected = !disabled && (pressed || !!(popup && parts?.arrowOpen));
  const arrowPart =
    !disabled && pressed
      ? (parts?.arrowPressed ?? "buttonset_item_pushed")
      : !disabled && popup && parts?.arrowOpen
        ? parts.arrowOpen
        : !disabled && arrowHot
          ? (parts?.arrowHot ?? "buttonset_item_hot")
          : (parts?.arrowNormal ?? "buttonset_item_normal");
  const arrowIcon = disabled
    ? "combobox_arrow_down_disabled"
    : arrowSelected
      ? "combobox_arrow_down_selected"
      : "combobox_arrow_down";
  return (
    <>
      <span
        ref={anchor}
        className={styles.anchor}
        data-disabled={disabled || undefined}
        style={{
          position: suppliedBounds ? "absolute" : "relative",
          left: suppliedBounds
            ? layout.left -
              Math.floor(
                (relativeTo.x * DEFAULT_SURFACE_VIEWPORT.width) /
                  DEFAULT_SURFACE_VIEWPORT.sceneWidth,
              )
            : undefined,
          top: suppliedBounds
            ? layout.top -
              Math.floor(
                (relativeTo.y * DEFAULT_SURFACE_VIEWPORT.height) /
                  DEFAULT_SURFACE_VIEWPORT.sceneHeight,
              )
            : undefined,
          width: layout.width,
          height: layout.height,
        }}
      >
        <button
          {...(!editable ? fieldAttributes : {})}
          className={styles.trigger}
          ref={trigger}
          type="button"
          tabIndex={editable ? -1 : undefined}
          role={editable ? undefined : "combobox"}
          aria-label={displayButtonLabel ?? displayLabel}
          aria-invalid={fieldAttributes["aria-invalid"]}
          data-ui-label-source={buttonLabel ?? label}
          aria-valuetext={editable ? undefined : text}
          aria-expanded={!!popup}
          aria-haspopup="listbox"
          aria-controls={popup ? id : undefined}
          disabled={disabled}
          style={{
            position: "absolute",
            left: editable
              ? surfaceLayout({
                  ...bounds,
                  x: bounds.x + bounds.width - 30,
                  width: 30,
                }).left - layout.left
              : 0,
            top: 0,
            width: editable
              ? surfaceLayout({
                  ...bounds,
                  x: bounds.x + bounds.width - 30,
                  width: 30,
                }).width
              : layout.width,
            height: layout.height,
            padding: 0,
            border: 0,
            outline: "none",
            background: "transparent",
            zIndex: 4,
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerEnter={() => setHovered(true)}
          onPointerMove={(event) => {
            const rect = clientRect(event.currentTarget);
            setArrowHot(
              !!parts?.faceHot ||
                editable ||
                clientPoint(event).x >= rect.right - (30 * rect.width) / bounds.width,
            );
          }}
          onPointerLeave={() => {
            setHovered(false);
            setArrowHot(false);
            if (!gesture.current) setPressed(false);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            triggerClickHandled.current = event.pointerType === "mouse";
            // Touch and pen activate on click so browser-cancelled pans never open the list.
            if (!triggerClickHandled.current) {
              setPressed(true);
              return;
            }
            event.preventDefault();
            const rect = clientRect(event.currentTarget),
              arrow =
                editable || clientPoint(event).x >= rect.right - (30 * rect.width) / bounds.width;
            gesture.current = {
              pointer: event.pointerId,
              entered: false,
              arrow,
            };
            if (arrow) {
              setPressed(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            } else if (popup) close();
            else open();
          }}
          onPointerUp={(event) => {
            setPressed(false);
            if (gesture.current?.pointer !== event.pointerId || !gesture.current.arrow) return;
            gesture.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            const rect = clientRect(event.currentTarget);
            if (
              clientPoint(event).x >= rect.left &&
              clientPoint(event).x < rect.right &&
              clientPoint(event).y >= rect.top &&
              clientPoint(event).y < rect.bottom
            )
              if (popup) close();
              else open();
          }}
          onPointerCancel={() => {
            gesture.current = null;
            triggerClickHandled.current = false;
            setPressed(false);
          }}
          onClick={(event) => {
            event.stopPropagation();
            const handled = triggerClickHandled.current;
            triggerClickHandled.current = false;
            setPressed(false);
            if (event.detail === 0 || !handled) {
              if (popup) close();
              else open();
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (["ArrowDown", "ArrowUp"].includes(event.key)) {
              event.preventDefault();
              open();
            } else if (event.key === "Escape" && popup) {
              event.preventDefault();
              close();
            }
          }}
        ></button>
        <span aria-hidden="true" className={styles.artwork}>
          {!editable && (
            <ThemePart
              part={facePart}
              scale={2}
              drawCenter
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: bounds.width - 30,
                height: bounds.height,
              }}
            />
          )}
          <ThemePart
            part={arrowPart}
            scale={2}
            drawCenter
            style={{
              position: "absolute",
              left: bounds.width - 30,
              top: 0,
              width: 30,
              height: bounds.height,
            }}
          />
          <ThemeIcon
            part={arrowIcon}
            scale={2}
            x={
              theme.dimensions.combobox_arrow_centered
                ? bounds.width - (theme.dimensions.combobox_arrow_inset ?? 17)
                : bounds.width - 24
            }
            y={
              theme.dimensions.combobox_arrow_centered
                ? (bounds.height - theme.parts[arrowIcon].height * 2) / 2
                : centerThemePixel(bounds.y + 6, bounds.height - 16, 16) - bounds.y
            }
          />
          {!editable && (
            <span
              style={{
                position: "absolute",
                left: theme.dimensions.combobox_text_inset ?? 8,
                top: 0,
                width: bounds.width - 30 - (theme.dimensions.combobox_text_inset ?? 8),
                height: bounds.height,
                overflow: "hidden",
              }}
            >
              <Text
                variant={TextVariant.PositionedPixel}
                text={text}
                x={0}
                y={
                  centerThemePixel(bounds.y, bounds.height, 14) -
                  bounds.y +
                  (theme.dimensions.combobox_text_offset_y ?? 0)
                }
                color={disabled ? theme.colors.disabled : theme.colors.text}
              />
            </span>
          )}
        </span>
        {editable && (
          <Input
            {...fieldAttributes}
            bounds={{ ...bounds, width: bounds.width - 30 }}
            relativeTo={bounds}
            part={normalFacePart}
            focusedPart={focusedFacePart}
            value={value}
            onValueChange={onDraftValueChange}
            onCommit={onValueChange}
            disabled={disabled}
            inputMode={inputMode}
            touchActivation={touchActivation}
            suffix={suffix}
            title={displayTitle}
            aria-label={displayLabel}
            aria-invalid={fieldAttributes["aria-invalid"]}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={!!popup}
            aria-controls={popup ? id : undefined}
            aria-activedescendant={popup && selected >= 0 ? `${id}-${selected}` : undefined}
            onKeyDown={(event) => {
              if (popup && (event.key === "Escape" || event.key === "Enter")) {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
              }
              if (["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                if (!popup) {
                  open();
                  return;
                }
                const enabled = options
                  .map((option, index) => (option.disabled || option.separator ? -1 : index))
                  .filter((index) => index >= 0);
                if (enabled.length) {
                  const delta =
                      (event.key.endsWith("Down") ? 1 : -1) *
                      (event.key.startsWith("Page")
                        ? Math.max(1, Math.floor(popup.innerHeight / rowHeight))
                        : 1),
                    next =
                      enabled[
                        Math.max(0, Math.min(enabled.length - 1, enabled.indexOf(selected) + delta))
                      ];
                  choose(next);
                  ensureVisible(next);
                }
              }
            }}
          />
        )}
      </span>
      {popup &&
        createPortal(
          <ThemeScope>
            <div
              ref={list}
              className={styles.popup}
              id={id}
              role="listbox"
              aria-label={displayLabel}
              aria-activedescendant={selected >= 0 ? `${id}-${selected}` : undefined}
              tabIndex={0}
              style={{
                ...anchoredPopoverStyle(popup, popup.bounds, { zIndex: 9000 }),
                outline: "none",
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (["Escape", "Enter", " "].includes(event.key)) {
                  event.preventDefault();
                  close();
                  return;
                }
                if (event.key === "Tab") {
                  close(false);
                  return;
                }
                const enabled = options
                  .map((option, index) => (option.disabled || option.separator ? -1 : index))
                  .filter((index) => index >= 0);
                if (!enabled.length) return;
                let next: number | undefined;
                const at = enabled.indexOf(selected);
                if (event.key === "Home") next = enabled[0];
                else if (event.key === "End") next = enabled[enabled.length - 1];
                else if (["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(event.key)) {
                  const delta =
                    (event.key.endsWith("Down") ? 1 : -1) *
                    (event.key.startsWith("Page")
                      ? Math.max(1, Math.floor(popup.innerHeight / rowHeight))
                      : 1);
                  next = enabled[Math.max(0, Math.min(enabled.length - 1, at + delta))];
                } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
                  next = [...enabled.slice(at + 1), ...enabled.slice(0, at + 1)].find((index) =>
                    options[index].label.toLowerCase().startsWith(event.key.toLowerCase()),
                  );
                if (next !== undefined) {
                  event.preventDefault();
                  choose(next);
                  ensureVisible(next);
                }
              }}
            >
              <span
                aria-hidden="true"
                className={styles.viewport}
                style={{
                  width: surfaceLayout(popup.bounds, popup.viewport).width,
                  height: surfaceLayout(popup.bounds, popup.viewport).height,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: popup.bounds.width,
                    height: popup.bounds.height,
                    transform: `scale(${surfaceLayout(popup.bounds, popup.viewport).width / popup.bounds.width}, ${surfaceLayout(popup.bounds, popup.viewport).height / popup.bounds.height})`,
                    transformOrigin: "top left",
                    background: theme.colors.window_face,
                  }}
                >
                  <ThemePart
                    part={popupMenu ? "menu" : editable ? "sunken_normal" : "sunken_focused"}
                    scale={2}
                    drawCenter
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: popup.bounds.width,
                      height: popup.bounds.height,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: insetX,
                      top: insetY,
                      width: popup.bounds.width - insetX * 2 - (scrollbar ? barSize : 0),
                      height: popup.innerHeight,
                      overflow: "hidden",
                    }}
                  >
                    {options.map((option, index) => {
                      const y = rowOffsets[index] - scroll,
                        active = index === selected;
                      if (option.separator)
                        return (
                          <span
                            key={index}
                            style={{
                              position: "absolute",
                              left: 0,
                              top: y,
                              width: "100%",
                              height: rowHeights[index],
                              background: theme.colors.listitem_normal_face,
                            }}
                          >
                            <ThemeRepeat
                              part="separator_horz"
                              length={popup.bounds.width - insetX * 2 - (scrollbar ? barSize : 0)}
                              y={
                                popupMenu
                                  ? centerText(y, rowHeights[index], 1) - y
                                  : centerThemePixel(y, rowHeights[index], 10) - y
                              }
                            />
                          </span>
                        );
                      return (
                        <span
                          key={index}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: y,
                            width: "100%",
                            height: rowHeight,
                            background: active
                              ? theme.colors.listitem_selected_face
                              : option.disabled && !popupMenu
                                ? theme.colors.face
                                : theme.colors.listitem_normal_face,
                          }}
                        >
                          {active && popupMenu && theme.controlParts?.menu?.checkedVector && (
                            <svg
                              width={12}
                              height={12}
                              viewBox="0 0 12 12"
                              shapeRendering="crispEdges"
                              style={{ position: "absolute", left: 0, top: (rowHeight - 12) / 2 }}
                            >
                              <path
                                d={theme.controlParts.menu.checkedVector.path}
                                fill={theme.colors.listitem_selected_text}
                              />
                            </svg>
                          )}
                          <Text
                            variant={TextVariant.PositionedPixel}
                            text={translateSource(option.label)}
                            x={
                              labelInset +
                              (popupMenu && (active || option.disabled)
                                ? (theme.dimensions.menu_text_state_offset_x ?? 0)
                                : 0)
                            }
                            y={
                              popupMenu
                                ? centerText(y, rowHeight, themeFontHeight()) - y
                                : centerThemePixel(y, rowHeight, 14) - y
                            }
                            color={
                              option.disabled
                                ? popupMenu
                                  ? theme.colors.menuitem_disabled_text
                                  : theme.colors.disabled
                                : active
                                  ? theme.colors.listitem_selected_text
                                  : theme.colors.listitem_normal_text
                            }
                          />
                        </span>
                      );
                    })}
                  </span>
                </span>
              </span>
              <div
                className={styles.optionHitArea}
                style={{
                  left: (insetX * popup.viewport.width) / popup.viewport.sceneWidth,
                  top: (insetY * popup.viewport.height) / popup.viewport.sceneHeight,
                  width:
                    ((popup.bounds.width - insetX * 2 - (scrollbar ? barSize : 0)) *
                      popup.viewport.width) /
                    popup.viewport.sceneWidth,
                  height: (popup.innerHeight * popup.viewport.height) / popup.viewport.sceneHeight,
                  overflow: "hidden",
                }}
              >
                {options.map((option, index) => (
                  <button
                    key={option.value}
                    id={`${id}-${index}`}
                    type="button"
                    role={option.separator ? "separator" : "option"}
                    aria-label={translateSource(option.label)}
                    aria-selected={index === selected}
                    disabled={option.disabled || option.separator}
                    tabIndex={-1}
                    data-ui-combo-owner={id}
                    data-ui-combo-option={index}
                    className={styles.optionHit}
                    style={{
                      left: 0,
                      top:
                        ((rowOffsets[index] - scroll) * popup.viewport.height) /
                        popup.viewport.sceneHeight,
                      height:
                        (rowHeights[index] * popup.viewport.height) / popup.viewport.sceneHeight,
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      if (event.pointerType !== "mouse") {
                        event.stopPropagation();
                        return;
                      }
                      event.preventDefault();
                      gesture.current = {
                        pointer: event.pointerId,
                        entered: true,
                        arrow: false,
                      };
                      list.current?.setPointerCapture(event.pointerId);
                      choose(index);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      choose(index);
                      close();
                    }}
                  />
                ))}
              </div>
              {scrollbar && (
                <Scrollbar
                  bounds={{
                    x: popup.bounds.x + popup.bounds.width - insetX - barSize,
                    y: popup.bounds.y + insetY,
                    width: barSize,
                    height: popup.innerHeight,
                  }}
                  relativeTo={popup.bounds}
                  viewport={popup.viewport}
                  variant={popupMenu ? "regular" : "mini"}
                  contentSize={contentHeight}
                  visibleSize={popup.innerHeight}
                  value={scroll}
                  onValueChange={setScroll}
                  aria-label={translateKey("ui.options.scroll").replace("{name}", displayLabel)}
                />
              )}
            </div>
          </ThemeScope>,
          document.body,
        )}
    </>
  );
}
