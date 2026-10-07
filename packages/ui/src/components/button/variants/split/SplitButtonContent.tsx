import { forwardRef } from "react";

import { themeControlSize } from "$/base/components/theme-controls";
import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { ButtonControl } from "$/components/button/ButtonControl";
import { ButtonAppearance, type ButtonProps } from "$/components/button/types";
import { SplitButtonSurface } from "$/components/button/variants/split/SplitButtonSurface";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Menu } from "$/components/menu";

import styles from "$/components/button/variants/split/split.module.css";

const EXPAND_BUTTON_WIDTH = 24;

type SplitButtonContentProps = Omit<ButtonProps, "variant">;

/** Joined button faces retain separate primary-action and menu semantics. */
export const SplitButtonContent = forwardRef<HTMLButtonElement, SplitButtonContentProps>(
  function SplitButtonContent(
    {
      bounds: suppliedBounds,
      pixelSize,
      relativeTo = { x: 0, y: 0 },
      viewport = DEFAULT_SURFACE_VIEWPORT,
      menu,
      disabled,
      style,
      className,
      ...props
    },
    ref,
  ) {
    const { definition: theme, translateSource } = useTheme();
    if (props.slots !== undefined || props.appearance === ButtonAppearance.Quiet)
      return (
        <SplitButtonSurface
          {...props}
          ref={ref}
          slots={props.slots ?? {}}
          bounds={suppliedBounds}
          pixelSize={pixelSize}
          relativeTo={relativeTo}
          viewport={viewport}
          menu={menu}
          disabled={disabled}
          style={style}
          className={className}
        />
      );
    const expandWidth = Math.max(0, menu?.expandWidth ?? EXPAND_BUTTON_WIDTH);
    const measuredSize = themeControlSize(
      theme,
      "drop_down_button_left_normal",
      props.text === undefined ? undefined : translateSource(props.text),
      props.font ?? "mini",
      props.icon,
    );
    const bounds = suppliedBounds ?? {
      x: 0,
      y: 0,
      width: pixelSize ? pixelSize.width * RASTER_SCALE : measuredSize.width + expandWidth,
      height: pixelSize ? pixelSize.height * RASTER_SCALE : measuredSize.height,
    };
    const rightWidth = Math.min(bounds.width, expandWidth);
    const mainWidth = Math.max(0, bounds.width - rightWidth);
    const layout = surfaceLayout(bounds, viewport);
    const menuDisabled = disabled || !menu?.items.length;

    return (
      <span
        className={cn(styles.root, className)}
        data-slot="button"
        data-variant="split"
        style={{
          position: suppliedBounds ? "absolute" : "relative",
          left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
          top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
          width: layout.width,
          height: layout.height,
          ...style,
        }}
      >
        <ButtonControl
          {...props}
          ref={ref}
          bounds={{ x: 0, y: 0, width: mainWidth, height: bounds.height }}
          viewport={viewport}
          disabled={disabled}
          part="drop_down_button_left_normal"
          hotPart="drop_down_button_left_hot"
          pushedPart="drop_down_button_left_selected"
          focusedPart="drop_down_button_left_focused"
          selectedPart="drop_down_button_left_selected"
        />
        <Menu
          label={menu?.label ?? props["aria-label"] ?? props.text ?? props.label ?? ""}
          items={menu?.items ?? []}
          renderTrigger={(trigger) => (
            <ButtonControl
              {...trigger}
              title={menu?.description}
              bounds={{ x: mainWidth, y: 0, width: rightWidth, height: bounds.height }}
              viewport={viewport}
              disabled={menuDisabled}
              part="drop_down_button_right_normal"
              hotPart="drop_down_button_right_hot"
              pushedPart="drop_down_button_right_selected"
              focusedPart="drop_down_button_right_focused"
              selectedPart={
                theme.controlParts?.splitButton?.arrowOpen ?? "drop_down_button_right_selected"
              }
              selected={!!trigger["aria-expanded"] && !!theme.controlParts?.splitButton?.arrowOpen}
              icon={menuDisabled ? "combobox_arrow_down_disabled" : "combobox_arrow_down"}
              selectedIcon="combobox_arrow_down_selected"
            />
          )}
        />
      </span>
    );
  },
);
