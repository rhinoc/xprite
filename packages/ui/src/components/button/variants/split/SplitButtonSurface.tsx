import { forwardRef } from "react";

import { cn } from "$/base/utils/cn";
import { ButtonControl } from "$/components/button/ButtonControl";
import { ButtonAppearance, type ButtonProps, type ButtonSlots } from "$/components/button/types";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Menu } from "$/components/menu";
import { UiIcon } from "$/components/theme/appearance";

import contentStyles from "$/components/button/content/content.module.css";
import quietStyles from "$/components/button/content/quiet.module.css";
import styles from "$/components/button/variants/split/split.module.css";

const SURFACE_EXPAND_WIDTH = 32;

type SplitButtonSurfaceProps = Omit<ButtonProps, "variant" | "slots"> & { slots: ButtonSlots };

/** Standard button surface and slots, with a separately focusable dropdown action. */
export const SplitButtonSurface = forwardRef<HTMLButtonElement, SplitButtonSurfaceProps>(
  function SplitButtonSurface(
    {
      bounds,
      pixelSize,
      relativeTo = { x: 0, y: 0 },
      viewport = DEFAULT_SURFACE_VIEWPORT,
      menu,
      disabled,
      slots,
      className,
      style,
      appearance = ButtonAppearance.Default,
      ...props
    },
    ref,
  ) {
    const quiet = appearance === ButtonAppearance.Quiet;
    const size =
      bounds ??
      (pixelSize
        ? {
            x: 0,
            y: 0,
            width: pixelSize.width * RASTER_SCALE,
            height: pixelSize.height * RASTER_SCALE,
          }
        : undefined);
    const layout = size ? surfaceLayout(size, viewport) : undefined;
    const expandWidth = Math.min(
      layout?.width ?? Infinity,
      surfaceLayout(
        { x: 0, y: 0, width: Math.max(0, menu?.expandWidth ?? SURFACE_EXPAND_WIDTH), height: 0 },
        viewport,
      ).width,
    );
    const menuDisabled = disabled || !menu?.items.length;

    return (
      <span
        className={cn(
          quiet ? quietStyles.quiet : contentStyles.surfaceFrame,
          styles.root,
          styles.surface,
          className,
        )}
        data-slot="button"
        data-variant="split"
        data-appearance={appearance}
        data-content-slots="true"
        data-disabled={disabled || undefined}
        style={{
          ...(layout && {
            width: layout.width,
            height: layout.height,
            minHeight: 0,
          }),
          ...(bounds &&
            layout && {
              position: "absolute",
              left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
              top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
            }),
          ...style,
        }}
      >
        <ButtonControl
          {...props}
          appearance={appearance}
          ref={ref}
          disabled={disabled}
          slots={slots}
          className={cn(styles.segment, styles.primary)}
        />
        <Menu
          label={menu?.label ?? props["aria-label"] ?? props.text ?? props.label ?? ""}
          items={menu?.items ?? []}
          renderTrigger={(trigger) => (
            <ButtonControl
              {...trigger}
              appearance={appearance}
              title={menu?.description}
              disabled={menuDisabled}
              selected={!!trigger["aria-expanded"]}
              className={cn(styles.segment, styles.expand)}
              style={{ flexBasis: expandWidth, width: expandWidth }}
              slots={{
                content: <UiIcon part="combobox_arrow_down" scale={2} color="currentColor" />,
              }}
            />
          )}
        />
      </span>
    );
  },
);
