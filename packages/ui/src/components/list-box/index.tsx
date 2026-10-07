import {
  useId,
  useRef,
  useLayoutEffect,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { scrollElementIntoView, observeResize } from "$/base/utils/dom-geometry";
import {
  surfaceLayout,
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { sizedControlBounds } from "$/components/control-flow/placement";
import type { SizedControlPlacement } from "$/components/control-flow/placement";
import { Divider } from "$/components/divider";
import { ListBoxFrame } from "$/components/list-box/frame";
import { MultipleListBox, type MultipleListBoxProps } from "$/components/list-box/multiple";
import { ListBoxSelectionMode, ListBoxFrameStyle } from "$/components/list-box/types";
import { ScrollArea, type ScrollbarVariant } from "$/components/scrollbar";
import { Text, TextVariant, type PixelFont } from "$/components/text";

import styles from "$/components/list-box/list-box.module.css";

export { ListBoxSelectionMode, ListBoxFrameStyle } from "$/components/list-box/types";
export type { MultipleListBoxItem, MultipleListBoxProps } from "$/components/list-box/multiple";

const LIST_CONTENT_INSET_X = 6;
const LIST_CONTENT_INSET_Y = 8;
const LIST_CONTENT_TRAILING = 6;
const LIST_ITEM_HEIGHT = 18;
const LIST_SEPARATOR_HEIGHT = 8;
const LIST_TEXT_INSET_X = 2;
const LIST_TEXT_HEIGHT = 14;
const SINGLE_FRAME_BORDER_WIDTH = 1;

export type ListBoxItem =
  | { value: string; label: string; disabled?: boolean; separator?: false }
  | { separator: true; label?: string };

interface SingleListBoxContentProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  selectionMode?: ListBoxSelectionMode.Single;
  viewport?: SurfaceViewport;
  items: readonly ListBoxItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  itemHeight?: number;
  /** Override the skin's compact font for navigation and other reading lists. */
  font?: PixelFont;
  /** Navigation lists may omit the input frame while retaining list behavior. */
  framed?: boolean;
  frameStyle?: ListBoxFrameStyle;
  scrollbarVariant?: ScrollbarVariant;
  separatorHeight?: number;
  renderItem?: (
    item: Exclude<ListBoxItem, { separator: true }>,
    state: { selected: boolean; disabled: boolean },
  ) => ReactNode;
  renderGroup?: (item: Extract<ListBoxItem, { separator: true }>) => ReactNode;
}

export type SingleListBoxProps = SingleListBoxContentProps & SizedControlPlacement;

type PositionedItem = {
  item: ListBoxItem;
  y: number;
  height: number;
  id?: string;
};

/** Theme-aware, single-selection pixel-art list box with pixel-aligned row artwork. */
function SingleListBox(allProps: SingleListBoxProps) {
  const {
    selectionMode: _selectionMode,
    bounds: suppliedBounds,
    pixelSize: _pixelSize,
    relativeTo = { x: 0, y: 0 },
    viewport = DEFAULT_SURFACE_VIEWPORT,
    items,
    value,
    onValueChange,
    itemHeight: suppliedItemHeight,
    font: suppliedFont,
    framed = true,
    frameStyle = ListBoxFrameStyle.Theme,
    scrollbarVariant,
    separatorHeight = LIST_SEPARATOR_HEIGHT,
    renderItem,
    renderGroup,
    className,
    onKeyDown,
    ...props
  } = allProps;
  const bounds = sizedControlBounds(allProps);
  const { definition: theme, translateSource } = useTheme();
  const skin = theme.controlParts?.listBox;
  const { themeFontHeight, centerThemePixel: centerText } = useThemeText();
  const itemHeight = suppliedItemHeight ?? skin?.rowHeight ?? LIST_ITEM_HEIGHT;
  const singleFrame = framed && frameStyle === ListBoxFrameStyle.Single;
  const insetX = singleFrame
    ? SINGLE_FRAME_BORDER_WIDTH
    : framed
      ? (skin?.contentInset ?? LIST_CONTENT_INSET_X)
      : 0;
  const insetY = singleFrame
    ? SINGLE_FRAME_BORDER_WIDTH
    : framed
      ? (skin?.contentInset ?? LIST_CONTENT_INSET_Y)
      : 0;
  const trailing = singleFrame
    ? SINGLE_FRAME_BORDER_WIDTH
    : framed
      ? (skin?.contentInset ?? LIST_CONTENT_TRAILING)
      : 0;
  const textInset = skin?.textInset ?? LIST_TEXT_INSET_X;
  const font = suppliedFont ?? skin?.font;
  const textHeight = skin || suppliedFont ? themeFontHeight(font) : LIST_TEXT_HEIGHT;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const scrollViewport = useRef<HTMLDivElement>(null);
  const layout = surfaceLayout(bounds, viewport);
  const origin = surfaceLayout({ ...relativeTo, width: 0, height: 0 }, viewport);
  const scaleX = layout.width / bounds.width;
  const scaleY = layout.height / bounds.height;
  let y = insetY;
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
  useLayoutEffect(() => {
    const reveal = () => {
      const option = root.current?.ownerDocument.getElementById(
        `${id}-${encodeURIComponent(value)}`,
      );
      scrollElementIntoView(option, { block: "nearest", inline: "nearest" });
    };
    reveal();
    const node = scrollViewport.current;
    if (node) return observeResize([node], reveal);
  }, [id, value, items]);

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
        {framed && <ListBoxFrame frameStyle={frameStyle} />}
        <span
          style={{
            position: "absolute",
            left: insetX,
            top: insetY,
            width: bounds.width - insetX - trailing,
            height: Math.max(0, bounds.height - insetY - trailing),
            background: theme.colors.background,
          }}
        />
      </span>
      <ScrollArea
        scrollX={false}
        scrollbarVariant={scrollbarVariant}
        viewportRef={scrollViewport}
        viewport={viewport}
        aria-label={translateSource(props["aria-label"])}
        style={{
          position: "absolute",
          left: insetX * scaleX,
          top: insetY * scaleY,
          right: trailing * scaleX,
          bottom: trailing * scaleY,
          background: theme.colors.background,
        }}
      >
        <div className={styles.rows} style={{ height: Math.max(0, y - insetY) * scaleY }}>
          {positioned.map(({ item, y: rowY, height }, index) => {
            if (item.separator && renderGroup)
              return (
                <div
                  key={`separator-${index}`}
                  role="presentation"
                  style={{
                    position: "absolute",
                    top: (rowY - insetY) * scaleY,
                    height: height * scaleY,
                    width: "100%",
                  }}
                >
                  {renderGroup(item)}
                </div>
              );
            if (item.separator)
              return (
                <Divider
                  key={`separator-${index}`}
                  bounds={{
                    x: 0,
                    y: rowY - insetY,
                    width: bounds.width - insetX - trailing,
                    height,
                  }}
                  viewport={viewport}
                  text={item.label}
                />
              );
            const active = item.value === value;
            const disabled = !!item.disabled;
            const globalY = bounds.y + rowY;
            return (
              <button
                key={item.value}
                id={`${id}-${encodeURIComponent(item.value)}`}
                type="button"
                role="option"
                aria-label={translateSource(item.label)}
                aria-selected={active}
                aria-disabled={disabled}
                disabled={disabled}
                tabIndex={-1}
                className={styles.option}
                style={{
                  left: 0,
                  top: (rowY - insetY) * scaleY,
                  width: "100%",
                  height: height * scaleY,
                  background: active
                    ? theme.colors.listitem_selected_face
                    : disabled
                      ? theme.colors.face
                      : theme.colors.listitem_normal_face,
                }}
                onClick={() => {
                  onValueChange(item.value);
                  root.current?.focus({ preventScroll: true });
                }}
              >
                {renderItem ? (
                  renderItem(item, { selected: active, disabled })
                ) : (
                  <span
                    className={styles.rowArtwork}
                    style={{ transform: `scale(${scaleX}, ${scaleY})` }}
                  >
                    <Text
                      variant={TextVariant.PositionedPixel}
                      text={translateSource(item.label)}
                      font={font}
                      x={textInset}
                      y={
                        (skin
                          ? centerText(globalY, height, textHeight)
                          : centerThemePixel(globalY, height, textHeight)) - globalY
                      }
                      color={
                        disabled
                          ? theme.colors.disabled
                          : active
                            ? theme.colors.listitem_selected_text
                            : theme.colors.listitem_normal_text
                      }
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export type ListBoxProps = SingleListBoxProps | MultipleListBoxProps;

export function ListBox(props: ListBoxProps) {
  return props.selectionMode === ListBoxSelectionMode.Multiple ? (
    <MultipleListBox {...props} />
  ) : (
    <SingleListBox {...props} />
  );
}
