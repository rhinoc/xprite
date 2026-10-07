import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { layoutSize, scrollElementIntoView, observeResize } from "$/base/utils/dom-geometry";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { DEFAULT_SURFACE_VIEWPORT, type SurfaceViewport } from "$/components/canvas-surface";
import { Divider, DividerVariant } from "$/components/divider";
import { ListBoxSelectionMode } from "$/components/list-box/types";
import { ScrollArea } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/list-box/multiple.module.css";

const ROW_HEIGHT = 26;
const SECTION_HEIGHT = 54;
const HEADING_HEIGHT = 46;
const TEXT_INSET = 4;
const FRAME_INSET_X = 6;
const FRAME_INSET_TOP = 8;
const FRAME_INSET_BOTTOM = 6;
const ARTWORK_SCALE = 2;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type MultipleListBoxItem =
  | { value: string; label: string; disabled?: boolean; height?: number; separator?: false }
  | { separator: true; label: string; heading?: boolean };
type MultipleListBoxOption = Exclude<MultipleListBoxItem, { separator: true }>;

export interface MultipleListBoxProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  selectionMode: ListBoxSelectionMode.Multiple;
  items: readonly MultipleListBoxItem[];
  values: readonly string[];
  onValuesChange: (values: readonly string[]) => void;
  onActivate?: (values: readonly string[]) => void;
  disabled?: boolean;
  itemHeight?: number;
  sectionHeight?: number;
  headingHeight?: number;
  viewport?: SurfaceViewport;
  "aria-label": string;
  renderItem?: (
    item: MultipleListBoxOption,
    state: { selected: boolean; disabled: boolean },
  ) => ReactNode;
  renderGroup?: (item: Extract<MultipleListBoxItem, { separator: true }>) => ReactNode;
}

/** A framed, scrolling workspace list with section headings and controlled multiple selection. */
export function MultipleListBox({
  selectionMode: _selectionMode,
  items,
  values,
  onValuesChange,
  onActivate,
  renderItem,
  renderGroup,
  disabled = false,
  itemHeight = ROW_HEIGHT,
  sectionHeight = SECTION_HEIGHT,
  headingHeight = HEADING_HEIGHT,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  className,
  style,
  onKeyDown,
  ...props
}: MultipleListBoxProps) {
  const { definition: theme, translateSource } = useTheme();
  const { measureThemeText, themeFontHeight } = useThemeText();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const options = items.filter((item): item is MultipleListBoxOption => !item.separator);
  const enabled = options.filter((item) => !item.disabled);
  const selected = values.filter((value) => options.some((item) => item.value === value));
  const active =
    enabled.find((item) => item.value === focused) ??
    enabled.find((item) => selected.includes(item.value));
  useClientLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => setAvailableWidth(Math.floor(layoutSize(node).width / sx));
    measure();
    const observer = observeResize([node], measure);

    return () => observer();
  }, [sx]);
  const contentWidth = Math.max(
    availableWidth,
    ...items.map((item) => measureThemeText(translateSource(item.label)) + TEXT_INSET * 2),
  );
  const optionId = (value: string) => `${id}-${encodeURIComponent(value)}`;
  const select = (value: string, extend = false, toggle = false) => {
    if (disabled) return;
    setFocused(value);
    const anchorIndex = enabled.findIndex((item) => item.value === anchor.current);
    const index = enabled.findIndex((item) => item.value === value);
    if (index < 0) return;
    if (extend && anchorIndex >= 0) {
      onValuesChange(
        enabled
          .slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1)
          .map((item) => item.value),
      );
    } else {
      anchor.current = value;
      onValuesChange(
        toggle
          ? selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value]
          : [value],
      );
    }
  };
  const rootStyle = {
    "--list-frame-x": `${FRAME_INSET_X * sx}px`,
    "--list-frame-top": `${FRAME_INSET_TOP * sy}px`,
    "--list-frame-bottom": `${FRAME_INSET_BOTTOM * sy}px`,
    "--list-face": theme.colors.background,
    "--list-frame-face": theme.colors.window_face,
    ...style,
  } as CSSProperties;

  return (
    <div {...props} className={cn(styles.root, className)} style={rootStyle}>
      <ScrollArea
        className={styles.scroll}
        viewport={viewport}
        viewportRef={root}
        contentStyle={{ minWidth: contentWidth * sx, minHeight: "100%" }}
        viewportProps={{
          role: "listbox",
          "aria-label": props["aria-label"],
          "aria-multiselectable": true,
          "aria-disabled": disabled,
          "aria-activedescendant": active ? optionId(active.value) : undefined,
          tabIndex: disabled ? -1 : 0,
          onFocus: () => setHasFocus(true),
          onBlur: () => setHasFocus(false),
          onKeyDown: (event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented || disabled || isImeKeyboardEvent(event.nativeEvent)) return;
            const toggle = event.ctrlKey || event.metaKey;
            if (toggle && event.key.toLowerCase() === "a") {
              event.preventDefault();
              onValuesChange(enabled.map((item) => item.value));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (selected.length) onActivate?.(selected);
              return;
            }
            if (event.key === " " && active) {
              event.preventDefault();
              select(active.value, event.shiftKey, toggle);
              return;
            }
            if (!enabled.length) return;
            const index = enabled.findIndex((item) => item.value === active?.value);
            const page = Math.max(
              1,
              Math.floor((layoutSize(root.current)?.height ?? 0) / (itemHeight * sy)),
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? enabled.length - 1
                  : event.key === "ArrowDown"
                    ? index + 1
                    : event.key === "ArrowUp"
                      ? index - 1
                      : event.key === "PageDown"
                        ? index + page
                        : event.key === "PageUp"
                          ? index - page
                          : null;
            if (next === null) return;
            event.preventDefault();
            const target = enabled[Math.max(0, Math.min(enabled.length - 1, next))];
            if (toggle && !event.shiftKey) setFocused(target.value);
            else select(target.value, event.shiftKey);
            scrollElementIntoView(
              root.current?.ownerDocument.getElementById(optionId(target.value)),
              {
                block: "nearest",
                inline: "nearest",
              },
            );
          },
        }}
      >
        {items.map((item, index) => {
          if (item.separator) {
            const height = item.heading ? headingHeight : sectionHeight;
            return (
              <div
                key={`section-${index}`}
                role="presentation"
                className={styles.section}
                style={{ height: height * sy }}
              >
                {renderGroup ? (
                  renderGroup(item)
                ) : (
                  <Divider
                    variant={item.heading ? DividerVariant.InViewHeading : DividerVariant.InView}
                    bounds={{ x: 0, y: 0, width: Math.max(1, contentWidth), height }}
                    viewport={viewport}
                    text={item.label}
                    className={styles.divider}
                  />
                )}
              </div>
            );
          }
          const chosen = selected.includes(item.value);
          const label = translateSource(item.label);
          const height = item.height ?? itemHeight;
          return (
            <button
              key={item.value}
              id={optionId(item.value)}
              type="button"
              role="option"
              aria-label={label}
              aria-selected={chosen}
              disabled={disabled || item.disabled}
              tabIndex={-1}
              className={styles.option}
              style={{
                height: height * sy,
                background: chosen
                  ? theme.colors.listitem_selected_face
                  : theme.colors.listitem_normal_face,
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                select(item.value, event.shiftKey, event.ctrlKey || event.metaKey);
                root.current?.focus({ preventScroll: true });
              }}
              onDoubleClick={() => onActivate?.(chosen ? selected : [item.value])}
            >
              {renderItem ? (
                renderItem(item, { selected: chosen, disabled: disabled || !!item.disabled })
              ) : (
                <span className={styles.artwork} style={{ transform: `scale(${sx}, ${sy})` }}>
                  <Text
                    variant={TextVariant.PositionedPixel}
                    text={label}
                    x={TEXT_INSET}
                    y={centerThemePixel(0, height, themeFontHeight())}
                    color={
                      chosen
                        ? theme.colors.listitem_selected_text
                        : item.disabled
                          ? theme.colors.disabled
                          : theme.colors.listitem_normal_text
                    }
                  />
                </span>
              )}
            </button>
          );
        })}
      </ScrollArea>
      <ThemePart
        part={hasFocus ? "editor_selected" : "editor_normal"}
        scale={ARTWORK_SCALE}
        drawCenter={false}
        className={styles.frame}
      />
    </div>
  );
}
