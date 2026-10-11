import type { HTMLAttributes } from "react";

import { cn } from "$/base/utils/cn";
import {
  DEFAULT_PATTERN_ID,
  PatternKind,
  patternColorImage,
  patternDefinition,
} from "$/components/pattern/catalog";
import { PatternId } from "$/components/pattern/variants";

import styles from "$/components/pattern/pattern.module.css";

export { PatternId } from "$/components/pattern/variants";
export {
  PATTERNS,
  DEFAULT_PATTERN_ID,
  PatternGroup,
  PatternKind,
  patternDefinition,
  patternColorImage,
  normalizePatternColor,
  PATTERN_DEFAULT_FOREGROUND,
  PATTERN_DEFAULT_BACKGROUND,
} from "$/components/pattern/catalog";
export type { PatternDefinition } from "$/components/pattern/catalog";

const DEFAULT_PATTERN_SCALE = 2;

export interface PatternProps extends HTMLAttributes<HTMLDivElement> {
  pattern?: PatternId;
  /** A local swatch that does not inherit the host's desktop selection. */
  preview?: boolean;
  scale?: number;
  foreground?: string;
  background?: string;
}

/** Original repeating pixels; two-color shapes can use an independent foreground/background pair. */
export function Pattern({
  pattern = DEFAULT_PATTERN_ID,
  className,
  preview = false,
  scale = DEFAULT_PATTERN_SCALE,
  foreground,
  background,
  style,
  ...props
}: PatternProps) {
  const definition = patternDefinition(pattern);
  const localColors = preview || foreground !== undefined || background !== undefined;
  return (
    <div
      {...props}
      className={cn(styles.root, className)}
      data-ui-desktop-pattern={pattern}
      data-ui-pattern-preview={preview || undefined}
      style={{
        ...(scale !== DEFAULT_PATTERN_SCALE
          ? { backgroundSize: `${definition.width * scale}px ${definition.height * scale}px` }
          : {}),
        ...(localColors && definition.kind === PatternKind.TwoColor
          ? { backgroundImage: patternColorImage(definition, foreground, background) }
          : {}),
        ...style,
      }}
    />
  );
}
