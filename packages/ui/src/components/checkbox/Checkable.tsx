import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";

import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart, type AtlasPartName } from "$/base/theme/theme-part";
import { composeEventHandlers } from "$/base/utils/compose-event-handlers";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import {
  surfaceLayout,
  RASTER_SCALE,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { CheckboxVariant } from "$/components/checkbox/types";
import { checkboxVariants } from "$/components/checkbox/variants";
import type { ControlPlacement } from "$/components/control-flow/placement";
import { Text, TextVariant, type PixelFont } from "$/components/text";
import { isCjk } from "$/components/text/text-runs";

import styles from "$/components/checkbox/checkbox.module.css";

const DEFAULT_CHECKBOX_LABEL_OFFSET = 28;
const DEFAULT_CHECKBOX_ICON_OFFSET = 4;
const CJK_CHECKBOX_TEXT_NUDGE_Y = -2;

interface CheckboxContentProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  viewport?: SurfaceViewport;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  mini?: boolean;
  /** Wrap the label within the supplied box instead of clipping long text. */
  wrapLabel?: boolean;
  mnemonicIndex?: number;
  variant?: CheckboxVariant;
  disabled?: boolean;
  textOffsetY?: number;
  style?: CSSProperties;
  className?: string;
  tabIndex?: number;
  onCommitted?: (button: HTMLButtonElement) => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/** Aseprite-themed checkbox and radio control with independent pointer and keyboard behavior. */
export type CheckboxProps = CheckboxContentProps & ControlPlacement;

export function Checkbox({
  bounds: suppliedBounds,
  pixelSize,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  label,
  checked,
  onCheckedChange,
  mini = false,
  wrapLabel = false,
  mnemonicIndex,
  variant = CheckboxVariant.Checkbox,
  disabled = false,
  textOffsetY = 0,
  style,
  className,
  tabIndex = 0,
  onCommitted,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onContextMenu,
  onKeyDown,
  onKeyUp,
  onClick,
  ...props
}: CheckboxProps) {
  const { definition: theme, language, translateSource } = useTheme();
  const skin = theme.controlParts?.checkable;
  const { measureThemeText, themeFontHeight } = useThemeText();
  const CHECKBOX_LABEL_OFFSET =
    theme.dimensions.checkbox_label_offset ?? DEFAULT_CHECKBOX_LABEL_OFFSET;
  const CHECKBOX_ICON_OFFSET =
    theme.dimensions.checkbox_icon_offset ?? DEFAULT_CHECKBOX_ICON_OFFSET;
  const variantStyle = checkboxVariants[variant];
  const displayLabel = translateSource(label);
  const font: PixelFont = mini ? "mini" : "default";
  const bounds: SurfaceBounds = suppliedBounds ?? {
    x: 0,
    y: 0,
    width: pixelSize
      ? pixelSize.width * RASTER_SCALE
      : measureThemeText(displayLabel, font) + CHECKBOX_LABEL_OFFSET + CHECKBOX_ICON_OFFSET,
    height: pixelSize
      ? pixelSize.height * RASTER_SCALE
      : (theme.dimensions.checkbox_height ?? themeFontHeight(font) + 8),
  };
  const cjkTextNudgeY = [...displayLabel].some((char) => isCjk(char.codePointAt(0)!))
    ? CJK_CHECKBOX_TEXT_NUDGE_Y
    : 0;
  const displayAriaLabel = ariaLabel ? translateSource(ariaLabel) : displayLabel;
  const displayMnemonic = language === "en" ? mnemonicIndex : undefined;
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef<{ id: number; initial: boolean } | null>(null);
  const keyValue = useRef<boolean | null>(null);
  const [preview, setPreview] = useState<boolean | null>(null);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const selected = preview ?? checked;
  const cancel = useCallback(() => {
    const active = pointer.current;
    pointer.current = null;
    keyValue.current = null;
    if (active && button.current?.hasPointerCapture(active.id))
      button.current.releasePointerCapture(active.id);
    setPreview(null);
  }, []);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    if (disabled) cancel();
    return () => window.removeEventListener("blur", cancel);
  }, [cancel, disabled]);

  const commit = (value: boolean) => {
    onCheckedChange(variantStyle.role === "radio" ? true : value);
    if (button.current) onCommitted?.(button.current);
  };
  const ink = disabled ? theme.colors.disabled : theme.colors.text;
  const textY =
    centerThemePixel(bounds.y + 4, bounds.height - 8, themeFontHeight(font)) -
    bounds.y +
    textOffsetY +
    (theme.dimensions.checkbox_text_offset_y ?? 0) +
    cjkTextNudgeY;
  const background = skin
    ? disabled
      ? undefined
      : hover && skin.hoverFace
        ? theme.colors[skin.hoverFace]
        : focused && skin.focusFace
          ? theme.colors[skin.focusFace]
          : undefined
    : disabled
      ? theme.colors.face
      : hover
        ? theme.colors[variantStyle.hotFace]
        : focused
          ? theme.colors[variantStyle.focusFace]
          : undefined;
  const layout = surfaceLayout(bounds, viewport);
  const iconPart =
    `${variantStyle.artworkPrefix}_${selected ? "selected" : disabled ? "disabled" : "normal"}` as AtlasPartName;
  const focusPart = variantStyle.focusArtwork as AtlasPartName;
  const characters = [...displayLabel];
  const validMnemonicIndex =
    displayMnemonic !== undefined && displayMnemonic >= 0 && displayMnemonic < characters.length
      ? displayMnemonic
      : null;
  const mnemonic = validMnemonicIndex === null ? null : characters[validMnemonicIndex];

  return (
    <button
      {...props}
      ref={button}
      type="button"
      role={variant}
      aria-label={displayAriaLabel}
      aria-describedby={ariaDescribedBy}
      {...stylusPointerInputProps(!disabled)}
      data-ui-label-source={ariaLabel ?? label}
      aria-checked={selected}
      disabled={disabled}
      tabIndex={tabIndex}
      className={`${styles.checkbox}${className ? ` ${className}` : ""}`}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        ...(suppliedBounds
          ? {
              left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
              top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
            }
          : {}),
        width: layout.width,
        height: layout.height,
        ...style,
      }}
      onFocus={composeEventHandlers(() => setFocused(true), onFocus)}
      onBlur={composeEventHandlers(() => {
        setFocused(false);
        if (keyValue.current !== null) cancel();
      }, onBlur)}
      onPointerEnter={composeEventHandlers(() => setHover(true), onPointerEnter)}
      onPointerLeave={composeEventHandlers(() => setHover(false), onPointerLeave)}
      onPointerDown={composeEventHandlers((event) => {
        if (disabled) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        pointer.current = { id: event.pointerId, initial: checked };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(variantStyle.nextValue(checked));
      }, onPointerDown)}
      onPointerMove={composeEventHandlers((event) => {
        const active = pointer.current;
        if (!active || active.id !== event.pointerId) return;
        const rect = clientRect(event.currentTarget);
        const inside =
          clientPoint(event).x >= rect.left &&
          clientPoint(event).x < rect.right &&
          clientPoint(event).y >= rect.top &&
          clientPoint(event).y < rect.bottom;
        setHover(inside);
        setPreview(inside ? variantStyle.nextValue(active.initial) : active.initial);
      }, onPointerMove)}
      onPointerUp={composeEventHandlers((event) => {
        const active = pointer.current;
        if (!active || active.id !== event.pointerId) return;
        const rect = clientRect(event.currentTarget);
        const inside =
          clientPoint(event).x >= rect.left &&
          clientPoint(event).x < rect.right &&
          clientPoint(event).y >= rect.top &&
          clientPoint(event).y < rect.bottom;
        cancel();
        if (inside) commit(!active.initial);
      }, onPointerUp)}
      onPointerCancel={composeEventHandlers(cancel, onPointerCancel)}
      onLostPointerCapture={composeEventHandlers(cancel, onLostPointerCapture)}
      onContextMenu={composeEventHandlers((event) => event.preventDefault(), onContextMenu)}
      onKeyDown={composeEventHandlers((event) => {
        if (event.key === " ") {
          event.preventDefault();
          keyValue.current =
            keyValue.current === null
              ? variantStyle.nextValue(checked)
              : variantStyle.nextValue(keyValue.current);
          setPreview(keyValue.current);
        } else if (event.key === "Enter") event.preventDefault();
        else if (event.key === "Escape" && (pointer.current || keyValue.current !== null)) {
          event.preventDefault();
          cancel();
        }
      }, onKeyDown)}
      onKeyUp={composeEventHandlers((event) => {
        if (event.key === " " && keyValue.current !== null) {
          event.preventDefault();
          const value = keyValue.current;
          cancel();
          commit(value);
        }
      }, onKeyUp)}
      onClick={composeEventHandlers((event) => {
        if (event.detail === 0 && !disabled) commit(!checked);
      }, onClick)}
    >
      <span
        aria-hidden="true"
        className={styles.artwork}
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
          background,
        }}
      >
        {focused && !disabled && skin?.focus !== "icon" && (
          <ThemePart part={focusPart} scale={2} drawCenter className={styles.focusArtwork} />
        )}
        <ThemeIcon
          part={iconPart}
          focused={skin?.focus === "icon" && focused && !disabled}
          style={
            disabled && selected
              ? { opacity: "var(--ui-control-disabled-opacity, 0.5)" }
              : undefined
          }
          scale={2}
          x={CHECKBOX_ICON_OFFSET}
          y={
            centerThemePixel(bounds.y, bounds.height, theme.parts[iconPart].height * RASTER_SCALE) -
            bounds.y
          }
        />
        <Text
          variant={TextVariant.PositionedPixel}
          text={displayLabel}
          x={CHECKBOX_LABEL_OFFSET}
          y={textY}
          font={font}
          color={ink}
          style={
            wrapLabel
              ? {
                  width: Math.max(0, bounds.width - CHECKBOX_LABEL_OFFSET - CHECKBOX_ICON_OFFSET),
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  top: "50%",
                  transform: "translateY(-50%)",
                }
              : undefined
          }
        />
        {!wrapLabel && mnemonic !== null && validMnemonicIndex !== null && (
          <span
            className={styles.mnemonic}
            style={{
              left:
                CHECKBOX_LABEL_OFFSET +
                measureThemeText(characters.slice(0, validMnemonicIndex).join(""), font),
              top: textY + themeFontHeight(font),
              width: measureThemeText(mnemonic, font),
              background: ink,
            }}
          />
        )}
      </span>
    </button>
  );
}
