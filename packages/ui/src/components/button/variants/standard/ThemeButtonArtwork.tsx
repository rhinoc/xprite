import { pixelFrameImage, pixelFocusImage } from "$/base/theme/pixel-frame";
import { useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import {
  ThemeIcon,
  ThemePart,
  type AtlasPartName,
  type UiPartProps,
} from "$/base/theme/theme-part";
import { Text, TextVariant, type PixelFont } from "$/components/text";

import styles from "$/components/button/button.module.css";

interface ThemeButtonArtworkProps {
  bounds: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  part: AtlasPartName;
  fill?: string;
  drawIcon?: AtlasPartName;
  iconX: number;
  iconY: number;
  iconInk?: string;
  text?: string;
  textX: number;
  textY: number;
  font: PixelFont;
  ink: string;
  shadowColor: string;
  disabled: boolean;
  disabledTextShadow: boolean;
  mnemonicIndex?: number;
  state: {
    pressed: boolean;
    selected: boolean;
    hovered: boolean;
    focused: boolean;
    defaultAction: boolean;
  };
}

function OutlineButtonFrame({ children, className, style }: UiPartProps) {
  return (
    <span aria-hidden="true" className={className} style={style}>
      <span className={styles.outlineContent}>{children}</span>
    </span>
  );
}

export function ThemeButtonArtwork({
  bounds,
  width,
  height,
  part,
  fill,
  drawIcon,
  iconX,
  iconY,
  iconInk,
  text,
  textX,
  textY,
  font,
  ink,
  shadowColor,
  disabled,
  disabledTextShadow,
  mnemonicIndex,
  state,
}: ThemeButtonArtworkProps) {
  const { measureThemeText, themeFontHeight } = useThemeText();
  const { definition } = useTheme();
  const outline = part.startsWith("button_") ? definition.controlParts?.button?.outline : undefined;
  const borderInk = definition.colors.text;
  const Frame = outline ? OutlineButtonFrame : ThemePart;
  const face =
    state.pressed || state.selected
      ? definition.colors.selected
      : state.hovered
        ? definition.colors.face
        : definition.colors.background;
  return (
    <Frame
      part={part}
      scale={2}
      drawCenter
      aria-hidden="true"
      className={styles.themeArtwork}
      style={{
        width: bounds.width,
        height: bounds.height,
        transform: `scale(${width / bounds.width}, ${height / bounds.height})`,
        background: fill ?? undefined,
        ...(outline
          ? {
              boxSizing: "border-box",
              border: `1px solid ${definition.colors.text}`,
              borderRadius: outline.radius,
              background: face,
              ...(outline.pixelCorners
                ? {
                    background: "transparent",
                    borderColor: "transparent",
                    borderRadius: 0,
                    borderImageSource: pixelFrameImage(borderInk, face),
                    borderImageSlice: "3 fill",
                    borderImageWidth: "3px",
                    borderImageRepeat: "stretch",
                    imageRendering: "pixelated",
                  }
                : {}),
              outline:
                part === "button_focused" && !outline.pixelCorners
                  ? `2px solid ${definition.colors.text}`
                  : undefined,
              outlineOffset: 2,
            }
          : {}),
      }}
    >
      {outline?.pixelCorners &&
        (state.focused || state.defaultAction || part === "button_focused") && (
          <span
            className={styles.defaultRing}
            style={{
              borderImageSource: pixelFocusImage(
                disabled ? definition.colors.disabled : definition.colors.text,
              ),
            }}
          />
        )}
      {drawIcon && (
        <ThemeIcon
          part={drawIcon}
          x={iconX}
          y={iconY}
          scale={2}
          color={iconInk}
          hovered={state.hovered}
          pressed={state.pressed}
        />
      )}
      {text && disabled && disabledTextShadow && (
        <Text
          variant={TextVariant.PositionedPixel}
          text={text}
          x={textX + 2}
          y={textY + 2}
          font={font}
          color={shadowColor}
        />
      )}
      {text && (
        <Text
          variant={TextVariant.PositionedPixel}
          text={text}
          x={textX}
          y={textY}
          font={font}
          color={ink}
        />
      )}
      {text &&
        mnemonicIndex !== undefined &&
        mnemonicIndex >= 0 &&
        mnemonicIndex < [...text].length && (
          <span
            aria-hidden="true"
            className={styles.mnemonic}
            style={{
              left: textX + measureThemeText([...text].slice(0, mnemonicIndex).join(""), font),
              top: textY + themeFontHeight(font),
              width: measureThemeText([...text][mnemonicIndex], font),
              background: ink,
            }}
          />
        )}
    </Frame>
  );
}
