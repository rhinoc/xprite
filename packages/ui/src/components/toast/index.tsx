import type { CSSProperties } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Panel } from "$/components/panel";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/toast/toast.module.css";

export enum ToastTone {
  Neutral = "neutral",
  Info = "info",
  Success = "success",
  Warning = "warning",
  Error = "error",
}

export interface ToastProps {
  /** Already localized message; null hides the notice. The caller owns its duration. */
  text: string | null;
  tone?: ToastTone;
  className?: string;
}

/** A non-interactive notice that slides down inside its positioned container. */
export function Toast({ text, tone = ToastTone.Neutral, className }: ToastProps) {
  const { definition: theme } = useTheme();

  return (
    <div className={cn(styles.host, className)} role="status" aria-live="polite" aria-atomic="true">
      {text && (
        <Panel
          key={text}
          className={styles.notice}
          data-ui-toast-tone={tone}
          style={
            {
              "--ui-toast-neutral-face": theme.colors.tooltip_face,
              "--ui-toast-neutral-ink": theme.colors.tooltip_text,
              background: "var(--ui-toast-face, var(--ui-toast-neutral-face))",
              color: "var(--ui-toast-ink, var(--ui-toast-neutral-ink))",
              borderColor: theme.colors.window_titlebar_text,
            } as CSSProperties
          }
        >
          <Text
            variant={TextVariant.Inline}
            scale={RASTER_SCALE}
            wrap
            ink="var(--ui-toast-ink, var(--ui-toast-neutral-ink))"
          >
            {text}
          </Text>
        </Panel>
      )}
    </div>
  );
}
