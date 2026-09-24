import { textRuns } from "$/components/text/text-runs";
import { TextVariant, type InlineTextProps, type TextProps } from "$/components/text/types";
import { PositionedPixelText } from "$/components/text/variants/positioned-pixel";

import styles from "$/components/text/text.module.css";

const INLINE_FONT_SIZE = 7;

function InlineText({
  children,
  className = "",
  wrap = false,
  scale = 1,
  color = "dark",
  ink,
}: InlineTextProps) {
  const runs = textRuns(children);
  const height = Math.round(INLINE_FONT_SIZE * scale);

  return (
    <span
      className={`${styles.inline} ${wrap ? styles.wrap : ""} ${className}`.trim()}
      data-slot="inline-text"
      data-color={color}
      style={{
        height: wrap ? undefined : height,
        lineHeight: `${height}px`,
        color: ink ?? (color === "light" ? "#fff" : "#000"),
      }}
    >
      {runs.map((run, index) => {
        return (
          <span
            key={`${index}:${run.text}`}
            className={`${styles.inlineRun} ${run.cjk ? styles.cjkRun : styles.latinRun}`}
            style={{
              fontSize: `${height}px`,
              lineHeight: `${height}px`,
            }}
          >
            {run.text}
          </span>
        );
      })}
    </span>
  );
}

export function Text(props: TextProps) {
  if (props.variant === TextVariant.Inline) return <InlineText {...props} />;
  return <PositionedPixelText {...props} />;
}
