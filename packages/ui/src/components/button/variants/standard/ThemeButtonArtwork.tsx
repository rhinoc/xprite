import { measureThemeText, themeFontHeight } from "$/base/components/theme-controls";
import { ThemeIcon, ThemePart, type AtlasPartName } from "$/base/theme/theme-part";
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
}: ThemeButtonArtworkProps) {
  return (
    <ThemePart
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
      }}
    >
      {drawIcon && <ThemeIcon part={drawIcon} x={iconX} y={iconY} scale={2} color={iconInk} />}
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
    </ThemePart>
  );
}
