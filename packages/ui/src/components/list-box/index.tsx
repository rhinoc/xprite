import { useId, useRef, type HTMLAttributes, type KeyboardEvent } from "react";

import { centerThemePixel } from "$/base/components/theme-controls";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { sizedControlBounds } from "$/components/control-flow/placement";
import type { SizedControlPlacement } from "$/components/control-flow/placement";
import { Divider } from "$/components/divider";
import { ListBoxVariant } from "$/components/list-box/types";
import { WorkspaceListBox, type WorkspaceListBoxProps } from "$/components/list-box/workspace";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/list-box/list-box.module.css";

export { ListBoxVariant } from "$/components/list-box/types";
export type { WorkspaceListBoxItem, WorkspaceListBoxProps } from "$/components/list-box/workspace";

const LIST_CONTENT_INSET_X = 6;
const LIST_CONTENT_INSET_Y = 8;
const LIST_CONTENT_TRAILING = 6;
const LIST_ITEM_HEIGHT = 18;
const LIST_SEPARATOR_HEIGHT = 8;
const LIST_TEXT_INSET_X = 2;
const LIST_TEXT_HEIGHT = 14;

export type ListBoxItem =
  | { value: string; label: string; disabled?: boolean; separator?: false }
  | { separator: true };

interface StandardListBoxContentProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant?: ListBoxVariant.Standard;
  viewport?: SurfaceViewport;
  items: readonly ListBoxItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  itemHeight?: number;
  separatorHeight?: number;
}

export type StandardListBoxProps = StandardListBoxContentProps & SizedControlPlacement;

type PositionedItem = {
  item: ListBoxItem;
  y: number;
  height: number;
  id?: string;
};

/** Theme-aware, single-selection pixel-art list box with pixel-aligned row artwork. */
function StandardListBox(allProps: StandardListBoxProps) {
  const {
    variant: _variant,
    bounds: suppliedBounds,
    pixelSize: _pixelSize,
    relativeTo = { x: 0, y: 0 },
    viewport = DEFAULT_SURFACE_VIEWPORT,
    items,
    value,
    onValueChange,
    itemHeight = LIST_ITEM_HEIGHT,
    separatorHeight = LIST_SEPARATOR_HEIGHT,
    className,
    onKeyDown,
    ...props
  } = allProps;
  const bounds = sizedControlBounds(allProps);
  const { definition: theme, translateSource } = useTheme();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const layout = surfaceLayout(bounds, viewport);
  const origin = surfaceLayout({ ...relativeTo, width: 0, height: 0 }, viewport);
  const scaleX = layout.width / bounds.width;
  const scaleY = layout.height / bounds.height;
  let y = LIST_CONTENT_INSET_Y;
  const positioned: PositionedItem[] = items.map((item) => {
    const height = item.separator ? separatorHeight : itemHeight;
    const positionedItem = {
      item,
      y,
      height,
      id: item.separator ? undefined : `${id}-${encodeURIComponent(item.value)}`,
    };
    y += height;
    return positionedItem;
  });
  const options = positioned.filter(
    (
      entry,
    ): entry is PositionedItem & {
      item: Exclude<ListBoxItem, { separator: true }>;
      id: string;
    } => !entry.item.separator,
  );
  const selected = options.find((entry) => entry.item.value === value);

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((entry) => !entry.item.disabled);
    if (!enabled.length) return;
    const currentIndex = enabled.findIndex((entry) => entry.item.value === value);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + enabled.length) % enabled.length;
    else if (event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabled.length - 1;
    else return;
    event.preventDefault();
    if (nextIndex !== currentIndex) onValueChange(enabled[nextIndex].item.value);
  };

  return (
    <div
      {...props}
      ref={root}
      role="listbox"
      aria-label={translateSource(props["aria-label"])}
      aria-activedescendant={selected?.id}
      tabIndex={props.tabIndex ?? 0}
      className={cn(styles.root, className)}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        ...(suppliedBounds
          ? { left: layout.left - origin.left, top: layout.top - origin.top }
          : {}),
        width: layout.width,
        height: layout.height,
        ...props.style,
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        moveSelection(event);
      }}
    >
      <span
        aria-hidden="true"
        className={styles.artwork}
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scaleX}, ${scaleY})`,
        }}
      >
        <ThemePart
          part="sunken_normal"
          scale={2}
          drawCenter
          style={{
            position: "absolute",
            inset: 0,
            width: bounds.width,
            height: bounds.height,
            background: theme.colors.window_face,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: LIST_CONTENT_INSET_X,
            top: LIST_CONTENT_INSET_Y,
            width: bounds.width - LIST_CONTENT_INSET_X - LIST_CONTENT_TRAILING,
            height: Math.max(0, bounds.height - LIST_CONTENT_INSET_Y - LIST_CONTENT_TRAILING),
            background: theme.colors.background,
          }}
        />
        {positioned.map(({ item, y: rowY, height }) => {
          if (item.separator) return null;
          const active = item.value === value;
          const disabled = !!item.disabled;
          const globalY = bounds.y + rowY;
          return (
            <span
              key={item.value}
              style={{
                position: "absolute",
                left: LIST_CONTENT_INSET_X,
                top: rowY,
                width: bounds.width - LIST_CONTENT_INSET_X - LIST_CONTENT_TRAILING,
                height,
                background: active
                  ? theme.colors.listitem_selected_face
                  : disabled
                    ? theme.colors.face
                    : theme.colors.listitem_normal_face,
              }}
            >
              <Text
                variant={TextVariant.PositionedPixel}
                text={translateSource(item.label)}
                x={LIST_TEXT_INSET_X}
                y={centerThemePixel(globalY, height, LIST_TEXT_HEIGHT) - globalY}
                color={
                  disabled
                    ? theme.colors.disabled
                    : active
                      ? theme.colors.listitem_selected_text
                      : theme.colors.listitem_normal_text
                }
              />
            </span>
          );
        })}
      </span>
      {positioned.map(({ item, y: rowY, height }, index) => {
        if (item.separator)
          return (
            <Divider
              key={`separator-${index}`}
              bounds={{
                x: bounds.x + LIST_CONTENT_INSET_X,
                y: bounds.y + rowY,
                width: bounds.width - LIST_CONTENT_INSET_X - LIST_CONTENT_TRAILING,
                height,
              }}
              relativeTo={bounds}
              viewport={viewport}
            />
          );
        const disabled = !!item.disabled;
        return (
          <button
            key={item.value}
            id={`${id}-${encodeURIComponent(item.value)}`}
            type="button"
            role="option"
            aria-label={translateSource(item.label)}
            aria-selected={item.value === value}
            aria-disabled={disabled}
            disabled={disabled}
            tabIndex={-1}
            className={styles.option}
            style={{
              left: LIST_CONTENT_INSET_X * scaleX,
              top: rowY * scaleY,
              width: (bounds.width - LIST_CONTENT_INSET_X - LIST_CONTENT_TRAILING) * scaleX,
              height: height * scaleY,
            }}
            onClick={() => {
              onValueChange(item.value);
              root.current?.focus({ preventScroll: true });
            }}
          />
        );
      })}
    </div>
  );
}

export type ListBoxProps = StandardListBoxProps | WorkspaceListBoxProps;

export function ListBox(props: ListBoxProps) {
  return props.variant === ListBoxVariant.Workspace ? (
    <WorkspaceListBox {...props} />
  ) : (
    <StandardListBox {...props} />
  );
}
