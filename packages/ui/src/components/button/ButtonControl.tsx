import * as React from "react";

import {
  centerThemePixel,
  measureThemeText,
  themeControlSize,
  themeFontHeight,
} from "$/base/components/theme-controls";
import { buttonInkRole } from "$/base/controls/control-policy";
import { useTheme } from "$/base/theme/theme-context";
import type { AtlasPartName } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { ButtonVariant, type ButtonProps } from "$/components/button/types";
import { buttonVariants } from "$/components/button/variants";
import { ColorArtwork } from "$/components/button/variants/color/ColorArtwork";
import { FlatIconArtwork } from "$/components/button/variants/flat-icon/FlatIconArtwork";
import { ThemeButtonArtwork } from "$/components/button/variants/standard/ThemeButtonArtwork";
import { ToolButtonContent } from "$/components/button/variants/tool/ToolButtonContent";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

import styles from "$/components/button/button.module.css";

const FLAT_ICON_PADDING = 8;

type ButtonControlProps = Omit<ButtonProps, "variant" | "menu"> & {
  variant?: Exclude<ButtonVariant, ButtonVariant.Split>;
};

function assignButtonRef(
  ref: React.Ref<HTMLButtonElement> | undefined,
  node: HTMLButtonElement | null,
) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
}

export const ButtonControl = React.forwardRef<HTMLButtonElement, ButtonControlProps>(
  function ButtonControl(
    {
      children,
      variant = ButtonVariant.Standard,
      readOnly = false,
      selected = false,
      bounds: suppliedBounds,
      pixelSize,
      relativeTo = { x: 0, y: 0 },
      viewport = DEFAULT_SURFACE_VIEWPORT,
      part: suppliedPart,
      hotPart,
      pushedPart,
      focusedPart,
      selectedPart,
      focusAppearance = "keyboard",
      icon,
      selectedIcon,
      tintDisabledIcon = false,
      tintIcon = false,
      disabledTextShadow = false,
      text,
      label,
      leading,
      labelScale = 1.35,
      font = "mini",
      insetContent = true,
      paintArtwork = true,
      buttonRef,
      fill,
      color,
      swatchColor,
      swatchValue = "",
      value: buttonValue,
      mask = false,
      textOffset,
      mnemonicIndex,
      iconOffset,
      disabled = false,
      pressed: suppliedPressed,
      style,
      className,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyUp,
      ...props
    },
    forwardedRef,
  ) {
    const variantStyle = buttonVariants[variant];
    const isFlatIcon = variantStyle.flatIcon === true;
    const part = suppliedPart ?? variantStyle.defaultPart;
    const { definition: theme, translateSource, language } = useTheme();
    const displayText = text === undefined ? undefined : translateSource(text);
    const displayLabel = label === undefined ? undefined : translateSource(label);
    const displayMnemonic = language === "en" ? mnemonicIndex : undefined;
    const measuredSize =
      isFlatIcon && icon
        ? {
            width: theme.parts[icon].width * RASTER_SCALE + FLAT_ICON_PADDING,
            height: theme.parts[icon].height * RASTER_SCALE + FLAT_ICON_PADDING,
          }
        : themeControlSize(theme, part, displayText, font, icon);
    const bounds = suppliedBounds ?? {
      x: 0,
      y: 0,
      ...measuredSize,
      ...(pixelSize
        ? {
            width: pixelSize.width * RASTER_SCALE,
            height: pixelSize.height * RASTER_SCALE,
          }
        : {}),
    };
    const [hover, setHover] = React.useState(false);
    const [focused, setFocused] = React.useState(false);
    const [pointerPressed, setPressed] = React.useState(false);
    const pressed = suppliedPressed ?? pointerPressed;
    const isButtonSet = part.startsWith("buttonset_item");
    const isTool = variantStyle.tool === true;
    const isColor = variantStyle.color === true;
    const isReadOnlyColor = isColor && readOnly;
    const usesThemeArtwork = variantStyle.themeArtwork === true;
    const activePart = (() => {
      if (disabled || isColor) return part;
      if (pressed) return pushedPart ?? (isTool ? "toolbutton_pushed" : part);
      if (selected)
        return (
          selectedPart ??
          hotPart ??
          (isTool ? "toolbutton_hot" : isButtonSet ? "buttonset_item_hot" : part)
        );
      if (hover)
        return hotPart ?? (isTool ? "toolbutton_hot" : isButtonSet ? "buttonset_item_hot" : part);
      if (focused && isButtonSet) return focusedPart ?? "buttonset_item_focused";
      return part;
    })() as AtlasPartName;
    const slices = theme.parts[activePart]?.slices;
    const contentBounds =
      insetContent && !isFlatIcon && slices
        ? {
            x: bounds.x + slices[0] * 2,
            y: bounds.y + slices[3] * 2,
            width: bounds.width - (slices[0] + slices[2]) * 2,
            height: bounds.height - (slices[3] + slices[5]) * 2,
          }
        : bounds;
    const drawIcon = (pressed || selected) && selectedIcon ? selectedIcon : icon;
    const ink = disabled
      ? theme.colors.disabled
      : isFlatIcon
        ? (color ??
          (pressed || selected
            ? theme.colors.menuitem_highlight_text
            : hover
              ? theme.colors.menuitem_hot_text
              : theme.colors.menuitem_normal_text))
        : isTool
          ? (color ?? theme.colors.text)
          : (color ??
            theme.colors[
              buttonInkRole({
                buttonSet: isButtonSet,
                selected,
                hovered: hover,
                pressed,
                disabled: false,
              })
            ]);
    const textX = displayText
      ? centerThemePixel(
          contentBounds.x,
          contentBounds.width,
          measureThemeText(displayText, font),
        ) -
        bounds.x +
        (textOffset?.x ?? 0)
      : 0;
    const textY = displayText
      ? centerThemePixel(contentBounds.y, contentBounds.height, themeFontHeight(font)) -
        bounds.y +
        (textOffset?.y ?? 0)
      : 0;
    const iconGeometry = drawIcon ? theme.parts[drawIcon] : null;
    const iconX = iconGeometry
      ? centerThemePixel(contentBounds.x, contentBounds.width, iconGeometry.width * 2) -
        bounds.x +
        (iconOffset?.x ?? 0)
      : 0;
    const iconY = iconGeometry
      ? centerThemePixel(contentBounds.y, contentBounds.height, iconGeometry.height * 2) -
        bounds.y +
        (iconOffset?.y ?? 0)
      : 0;
    const layout = surfaceLayout(bounds, viewport);
    const position = {
      left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
      top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
      width: layout.width,
      height: layout.height,
    };
    const selectedInk = disabled ? theme.colors.disabled : ink;
    const classes = cn(
      styles.root,
      usesThemeArtwork && styles.theme,
      variantStyle.className,
      className,
    );
    const displayPart = activePart;
    const buttonPosition = suppliedBounds ? "absolute" : "relative";

    return (
      <button
        {...props}
        value={buttonValue}
        ref={(node) => {
          assignButtonRef(buttonRef, node);
          assignButtonRef(forwardedRef, node);
        }}
        className={classes}
        type={props.type ?? "button"}
        disabled={disabled || isReadOnlyColor}
        data-slot="button"
        data-variant={variant}
        data-selected={selected || undefined}
        aria-label={
          props["aria-label"]
            ? translateSource(props["aria-label"]!)
            : (displayLabel ?? displayText)
        }
        title={props.title ? translateSource(props.title) : undefined}
        data-label-source={props["aria-label"] ?? label ?? text ?? undefined}
        aria-pressed={props["aria-pressed"] ?? (selected ? true : undefined)}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHover(true);
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          setHover(false);
          setPressed(false);
          onPointerLeave?.(event);
        }}
        onPointerDown={(event) => {
          if (event.button === 0 && !disabled) setPressed(true);
          onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          setPressed(false);
          onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          setPressed(false);
          onPointerCancel?.(event);
        }}
        onLostPointerCapture={(event) => {
          setPressed(false);
          onLostPointerCapture?.(event);
        }}
        onFocus={(event) => {
          setFocused(focusAppearance === "always" || event.currentTarget.matches(":focus-visible"));
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          setPressed(false);
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") setPressed(true);
          onKeyDown?.(event);
        }}
        onKeyUp={(event) => {
          setPressed(false);
          onKeyUp?.(event);
        }}
        style={{
          position: buttonPosition,
          ...(suppliedBounds
            ? position
            : usesThemeArtwork || isColor
              ? { width: layout.width, height: layout.height }
              : {}),
          flex: "0 0 auto",
          ...style,
        }}
      >
        {isFlatIcon && paintArtwork && (
          <FlatIconArtwork
            bounds={bounds}
            width={layout.width}
            height={layout.height}
            icon={drawIcon}
            iconX={iconX}
            iconY={iconY}
            ink={ink}
            face={
              fill ??
              (!disabled && (pressed || selected)
                ? theme.colors.menuitem_highlight_face
                : !disabled && hover
                  ? theme.colors.menuitem_hot_face
                  : theme.colors.menuitem_normal_face)
            }
          />
        )}
        {usesThemeArtwork && !isFlatIcon && paintArtwork && (
          <ThemeButtonArtwork
            bounds={bounds}
            width={layout.width}
            height={layout.height}
            part={displayPart}
            fill={fill}
            drawIcon={drawIcon}
            iconX={iconX}
            iconY={iconY}
            iconInk={tintIcon || (disabled && tintDisabledIcon) ? ink : undefined}
            text={displayText}
            textX={textX}
            textY={textY}
            font={font}
            ink={ink}
            shadowColor={theme.colors.background}
            disabled={disabled}
            disabledTextShadow={disabledTextShadow}
            mnemonicIndex={displayMnemonic}
          />
        )}
        {isColor && (
          <ColorArtwork
            bounds={bounds}
            viewport={viewport}
            color={swatchColor ?? color ?? swatchValue}
            value={swatchValue}
            text={text}
            mask={mask}
            disabled={disabled}
            hot={!isReadOnlyColor && (hover || focused)}
            pressed={!isReadOnlyColor && pressed}
          />
        )}
        {isTool && (
          <ToolButtonContent
            part={displayPart}
            icon={drawIcon ?? icon}
            leading={leading}
            label={displayLabel}
            labelScale={labelScale}
            selectedInk={selectedInk}
            iconInk={tintIcon || (disabled && tintDisabledIcon) ? ink : undefined}
            skinClassName={variantStyle.contentSkinClassName}
            iconClassName={variantStyle.contentIconClassName}
            labelClassName={variantStyle.contentLabelClassName}
          />
        )}
        {children}
      </button>
    );
  },
);

ButtonControl.displayName = "ButtonControl";
