import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Panel } from "$/components/panel";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/toast/toast.module.css";

export interface ToastProps {
  /** Already localized message; null hides the notice. The caller owns its duration. */
  text: string | null;
  className?: string;
}

/** A non-interactive notice that slides down inside its positioned container. */
export function Toast({ text, className }: ToastProps) {
  const { definition: theme } = useTheme();

  return (
    <div className={cn(styles.host, className)} role="status" aria-live="polite" aria-atomic="true">
      {text && (
        <Panel
          key={text}
          className={styles.notice}
          style={{
            background: theme.colors.tooltip_face,
            color: theme.colors.tooltip_text,
            borderColor: theme.colors.window_titlebar_text,
          }}
        >
          <Text
            variant={TextVariant.Inline}
            scale={RASTER_SCALE}
            wrap
            ink={theme.colors.tooltip_text}
          >
            {text}
          </Text>
        </Panel>
      )}
    </div>
  );
}
