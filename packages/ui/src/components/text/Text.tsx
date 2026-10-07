import { useTheme } from "$/base/theme/theme-context";
import { textRuns } from "$/components/text/text-runs";
import {
  TextRole,
  TextTone,
  TextVariant,
  type InlineTextProps,
  type ReadingTextProps,
  type TextProps,
} from "$/components/text/types";
import { ControlText } from "$/components/text/variants/control";
import { PositionedPixelText } from "$/components/text/variants/positioned-pixel";

import styles from "$/components/text/text.module.css";

const INLINE_FONT_SIZE = 7;

function InlineText({
  children,
  className = "",
  wrap = false,
  scale = 1,
  lineHeight,
  color,
  ink,
}: InlineTextProps) {
  const runs = textRuns(children);
  const { definition } = useTheme();
  const height = Math.round(
    ((definition.typography?.default?.fontSize ?? INLINE_FONT_SIZE * 2) / 2) * scale,
  );
  const leading = Math.max(height, Math.round(lineHeight ?? height));

  return (
    <span
      className={`${styles.inline} ${wrap ? styles.wrap : ""} ${className}`.trim()}
      data-slot="inline-text"
      data-color={color}
      style={{
        height: wrap ? undefined : height,
        lineHeight: `${leading}px`,
        color:
          ink ?? (color === "light" ? "#fff" : color === "dark" ? "#000" : "var(--ui-color-ink)"),
      }}
    >
      {runs.map((run, index) => {
        return (
          <span
            key={`${index}:${run.text}`}
            className={`${styles.inlineRun} ${run.cjk ? styles.cjkRun : styles.latinRun}`}
            style={{
              fontSize: `${height}px`,
              lineHeight: `${leading}px`,
            }}
          >
            {run.text}
          </span>
        );
      })}
    </span>
  );
}

function ReadingText({
  children,
  className = "",
  textRole = TextRole.Body,
  tone = TextTone.Default,
  as: Element = "span",
  wrap = false,
  ink,
  style,
  variant: _variant,
  ...props
}: ReadingTextProps) {
  return (
    <Element
      {...props}
      className={`${styles.reading} ${wrap ? styles.readingWrap : ""} ${className}`.trim()}
      data-slot="reading-text"
      data-text-role={textRole}
      data-tone={tone}
      style={{ color: ink, ...style }}
    >
      {children}
    </Element>
  );
}

export function Text(props: TextProps) {
  if (props.variant === TextVariant.Control) return <ControlText {...props} />;
  if (props.variant === TextVariant.Reading) return <ReadingText {...props} />;
  if (props.variant === TextVariant.Inline) return <InlineText {...props} />;
  return <PositionedPixelText {...props} />;
}
