import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { measureThemeText, themeFontHeight } from "$/base/components/theme-controls";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart } from "$/base/theme/theme-part";
import { ThemeRepeat } from "$/base/theme/theme-repeat";
import {
  computedStyle,
  viewportSize,
  hitElement,
  clientPoint,
  clientRect,
} from "$/base/utils/dom-geometry";
import { formatShortcutForPlatform } from "$/base/utils/format-shortcut";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import {
  DEFAULT_SURFACE_VIEWPORT,
  sceneViewport,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { PointerCompatibilityMouseSuppression } from "$/components/menu/pointer-gestures";
import {
  placeSubmenu,
  menuMnemonicIndex,
  menuMnemonicMatch,
  SUBMENU_OPEN_DELAY_MS,
} from "$/components/menu/policy";
import { ScrollArea } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/menu/menu.module.css";

const MENU_METRICS = {
  rowHeight: 22,
  themeArtScale: 2,
  frameInset: 6,
  separatorHeight: 8,
  itemInset: 6,
  textInset: 24,
  textScale: 2,
  submenuArrowInset: 12,
  submenuArrowSize: 2,
  submenuArrowRise: 10,
  submenuArrowStep: 4,
  disabledEmboss: 2,
  checkedMarkOffset: 2,
  separatorTileWidth: 18,
  shortcutInset: 16,
} as const;

export enum MenuActivation {
  Click = "click",
  ContextMenu = "contextmenu",
}

export enum MenuCheckType {
  Radio = "radio",
  Checkbox = "checkbox",
}

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Divider before this item. */
  separator?: boolean;
  checked?: boolean;
  checkType?: MenuCheckType;
  shortcut?: string;
  /** Source mnemonic character; labels remain plain accessible text. */
  mnemonic?: string;
  mnemonicIndex?: number;
  children?: readonly MenuItem[];
}
export interface MenuProps<Trigger extends HTMLElement = HTMLButtonElement> {
  label: string;
  items: readonly MenuItem[];
  activation?: MenuActivation;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Adjacent top-level menus, after a child has handled Left/Right. */
  onNavigate?: (direction: -1 | 1) => void;
  renderTrigger: (
    props: Omit<ButtonHTMLAttributes<Trigger>, "part"> & {
      buttonRef: Ref<Trigger>;
    },
  ) => ReactNode;
}
type Layout = {
  bounds: SurfaceBounds;
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  workarea: { width: number; height: number };
  touchRows: boolean;
  textScale: number;
};
function measureMenu(
  items: readonly MenuItem[],
  rowHeight = MENU_METRICS.rowHeight,
  textScale: number = MENU_METRICS.textScale,
) {
  let y = MENU_METRICS.frameInset;
  const rows = items.map((item) => {
    if (item.separator) y += MENU_METRICS.separatorHeight;
    const top = y;
    y += rowHeight;
    return top;
  });
  const width =
    Math.max(
      0,
      ...items.map(
        (item) =>
          measureThemeText(item.label, "default", textScale) +
          (item.shortcut && !item.children?.length
            ? measureThemeText(formatShortcutForPlatform(item.shortcut), "default", textScale)
            : 0),
      ),
    ) +
    MENU_METRICS.textInset +
    32;
  return { rows, width, height: y + MENU_METRICS.frameInset };
}
type Panel = {
  items: readonly MenuItem[];
  layout: Layout;
  label: string;
  rows: number[];
  rowHeight: number;
  language: string;
  touchRows: boolean;
  textScale: number;
};
function translateItems(
  items: readonly MenuItem[],
  translateSource: (source: string) => string,
): readonly MenuItem[] {
  return items.map((item) => ({
    ...item,
    label: translateSource(item.label),
    ...(item.children ? { children: translateItems(item.children, translateSource) } : {}),
  }));
}
function MenuArtwork({ panel, active }: { panel: Panel; active: number }) {
  const { definition: theme } = useTheme();
  const { bounds, viewport } = panel.layout;
  const layout = surfaceLayout(bounds, viewport);
  const sx = layout.width / bounds.width,
    sy = layout.height / bounds.height;
  const fontHeight = themeFontHeight("default", panel.textScale);
  const text = (
    value: string,
    left: number,
    top: number,
    color: string,
    disabled = false,
    mnemonic = -1,
  ) => {
    const pass = (dx: number, dy: number, ink: string) => (
      <span key={`${dx}-${dy}`}>
        <Text
          variant={TextVariant.PositionedPixel}
          text={value}
          x={left + dx}
          y={top + Math.floor((panel.rowHeight - fontHeight) / 2) + dy}
          color={ink}
        />
        {mnemonic >= 0 && mnemonic < [...value].length && (
          <span
            className={styles.mnemonicUnderline}
            style={{
              left:
                left +
                dx +
                measureThemeText(
                  [...value].slice(0, mnemonic).join(""),
                  "default",
                  panel.textScale,
                ),
              top: top + Math.floor((panel.rowHeight - fontHeight) / 2) + dy + fontHeight,
              width: measureThemeText([...value][mnemonic], "default", panel.textScale),
              background: ink,
            }}
          />
        )}
      </span>
    );
    return (
      <>
        {disabled &&
          pass(MENU_METRICS.disabledEmboss, MENU_METRICS.disabledEmboss, theme.colors.background)}
        {pass(0, 0, color)}
      </>
    );
  };
  const arrow = (top: number, color: string, dx = 0, dy = 0) =>
    Array.from({ length: 3 }, (_, column) => (
      <span
        key={`${dx}-${dy}-${column}`}
        className={styles.submenuArrow}
        style={{
          left:
            bounds.width -
            MENU_METRICS.submenuArrowInset -
            MENU_METRICS.submenuArrowSize * column +
            dx,
          top:
            top +
            Math.floor((panel.rowHeight - MENU_METRICS.rowHeight) / 2) +
            MENU_METRICS.submenuArrowRise -
            MENU_METRICS.submenuArrowSize * column +
            dy,
          width: MENU_METRICS.submenuArrowSize,
          height: column * MENU_METRICS.submenuArrowStep + MENU_METRICS.submenuArrowSize,
          background: color,
        }}
      />
    ));
  return (
    <span
      aria-hidden="true"
      className={styles.menuArtwork}
      style={
        {
          width: layout.width,
          height: layout.height,
          "--ui-menu-item-face": theme.colors.menuitem_normal_face,
          "--ui-menu-item-highlight-face": theme.colors.menuitem_highlight_face,
        } as CSSProperties
      }
    >
      <span
        className={styles.menuArtworkScale}
        style={{ width: bounds.width, height: bounds.height, transform: `scale(${sx}, ${sy})` }}
      >
        <ThemePart
          part="menu"
          scale={MENU_METRICS.themeArtScale}
          drawCenter
          className={styles.menuFrame}
          style={{ width: bounds.width, height: bounds.height }}
        />
        {panel.items.map((item, index) => {
          const top = panel.rows[index],
            selected = active === index && !item.disabled;
          const ink = item.disabled
            ? (theme.colors.menuitem_disabled_text ?? theme.colors.disabled)
            : selected
              ? theme.colors.menuitem_highlight_text
              : theme.colors.menuitem_normal_text;
          const mnemonic = panel.language === "en" ? menuMnemonicIndex(item) : -1;
          return (
            <span key={index}>
              {item.separator && (
                <span
                  className={styles.menuSeparator}
                  style={{
                    left: MENU_METRICS.itemInset,
                    top: top - MENU_METRICS.separatorHeight,
                    width: bounds.width - MENU_METRICS.itemInset * 2,
                    height: MENU_METRICS.separatorHeight,
                  }}
                >
                  <ThemeRepeat
                    part="separator_horz"
                    length={bounds.width - MENU_METRICS.itemInset * 2}
                    pitch={MENU_METRICS.separatorTileWidth}
                  />
                </span>
              )}
              <span
                className={selected ? styles.menuItemFaceSelected : styles.menuItemFace}
                style={
                  {
                    left: MENU_METRICS.itemInset,
                    top,
                    width: bounds.width - MENU_METRICS.itemInset * 2,
                    height: panel.rowHeight,
                    "--ui-menu-item-face": theme.colors.menuitem_normal_face,
                    "--ui-menu-item-highlight-face": theme.colors.menuitem_highlight_face,
                  } as CSSProperties &
                    Record<"--ui-menu-item-face" | "--ui-menu-item-highlight-face", string>
                }
              />
              {item.checked && (
                <ThemeIcon
                  part={item.disabled ? "check_disabled" : "check_selected"}
                  scale={2}
                  x={MENU_METRICS.itemInset}
                  y={
                    top +
                    Math.floor((panel.rowHeight - MENU_METRICS.rowHeight) / 2) +
                    MENU_METRICS.checkedMarkOffset
                  }
                />
              )}
              {text(item.label, MENU_METRICS.textInset, top, ink, !!item.disabled, mnemonic)}
              {item.children?.length ? (
                <>
                  {item.disabled &&
                    arrow(
                      top,
                      theme.colors.background,
                      MENU_METRICS.disabledEmboss,
                      MENU_METRICS.disabledEmboss,
                    )}
                  {arrow(top, ink)}
                </>
              ) : item.shortcut ? (
                text(
                  formatShortcutForPlatform(item.shortcut),
                  bounds.width -
                    MENU_METRICS.shortcutInset -
                    measureThemeText(
                      formatShortcutForPlatform(item.shortcut),
                      "default",
                      panel.textScale,
                    ),
                  top,
                  ink,
                  !!item.disabled,
                )
              ) : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
/** One scene popup tree: DOM artwork and semantic buttons share the same geometry. */
export function Menu<Trigger extends HTMLElement = HTMLButtonElement>({
  label,
  items,
  renderTrigger,
  activation = MenuActivation.Click,
  expanded,
  onExpandedChange,
  onNavigate,
}: MenuProps<Trigger>) {
  const { language, translateSource } = useTheme();
  const [touchRows, setTouchRows] = useState(false);
  const rowHeight = MENU_METRICS.rowHeight;
  const localizedItems = useMemo(
    () => translateItems(items, translateSource),
    [items, language, translateSource],
  );
  const displayLabel = translateSource(label);
  const id = useId(),
    trigger = useRef<Trigger | null>(null),
    tree = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>()),
    panelNodes = useRef(new Map<number, HTMLDivElement>());
  const [layout, setLayout] = useState<Layout | null>(null),
    [path, setPath] = useState<number[]>([]),
    [active, setActive] = useState<number[]>([-1]),
    [focusLevel, setFocusLevel] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pointer = useRef<number | null>(null);
  const touchContact = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const compatibilityMouse = useRef(new PointerCompatibilityMouseSuppression());
  useEffect(() => compatibilityMouse.current.connect(window), []);
  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const close = useCallback(
    (restore = true) => {
      cancelTimer();
      pointer.current = null;
      touchContact.current = null;
      setLayout(null);
      setPath([]);
      setActive([-1]);
      setFocusLevel(0);
      onExpandedChange?.(false);
      if (restore) (returnFocus.current ?? trigger.current)?.focus({ preventScroll: true });
    },
    [cancelTimer, onExpandedChange],
  );
  useEffect(() => cancelTimer, [cancelTimer]);
  const open = (keyboard = false, point?: { x: number; y: number }) => {
    const node = trigger.current;
    if (!node) return;
    const focused = node.ownerDocument.activeElement;
    returnFocus.current =
      activation === MenuActivation.ContextMenu &&
      focused instanceof HTMLElement &&
      node.contains(focused)
        ? focused
        : null;
    const uiDensityRoot = node.closest<HTMLElement>("[data-ui-compact]");
    const nextTouchRows = uiDensityRoot
      ? uiDensityRoot.dataset.uiCompact === "true"
      : !!document.querySelector('[data-ui-compact="true"]');
    setTouchRows(nextTouchRows);
    const nextRowHeight = 22;
    const cssFontSize = Number.parseFloat(computedStyle(node).getPropertyValue("--ui-text-size"));
    const defaultFontHeight = themeFontHeight("default", 1);
    const textScale =
      Number.isFinite(cssFontSize) && cssFontSize > 0
        ? cssFontSize / defaultFontHeight
        : themeFontHeight("default", 2) / defaultFontHeight;
    cancelTimer();
    const rect = clientRect(node),
      sceneElement = node.closest<HTMLElement>("[data-ui-scene]"),
      scene = sceneElement ? clientRect(sceneElement) : undefined;
    const origin = { x: scene?.left ?? 0, y: scene?.top ?? 0 },
      viewport = sceneElement ? sceneViewport(sceneElement) : DEFAULT_SURFACE_VIEWPORT;
    const sx = viewport.width / viewport.sceneWidth,
      sy = viewport.height / viewport.sceneHeight,
      workarea = {
        width: scene ? viewport.sceneWidth : viewportSize(window).width / sx,
        height: scene ? viewport.sceneHeight : viewportSize(window).height / sy,
      },
      size = measureMenu(localizedItems, nextRowHeight, textScale);
    setLayout({
      viewport,
      origin,
      workarea,
      bounds: {
        x: Math.max(
          0,
          Math.min(
            workarea.width - size.width,
            Math.round(((point?.x ?? rect.left) - origin.x) / sx),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            workarea.height - size.height,
            Math.round(((point?.y ?? rect.bottom) - origin.y) / sy),
          ),
        ),
        width: size.width,
        height: size.height,
      },
      touchRows: nextTouchRows,
      textScale,
    });
    setPath([]);
    setActive([keyboard ? localizedItems.findIndex((item) => !item.disabled) : -1]);
    setFocusLevel(0);
    onExpandedChange?.(true);
  };
  useEffect(() => {
    if (expanded === undefined) return;
    if (expanded) open(true);
    else {
      cancelTimer();
      setLayout(null);
      setPath([]);
      setActive([-1]);
    }
    // External expansion changes only when the owning menubar switches menus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);
  const panels: Panel[] = [];
  if (layout) {
    const size = measureMenu(localizedItems, rowHeight, layout.textScale);
    panels.push({
      items: localizedItems,
      layout: {
        ...layout,
        bounds: { ...layout.bounds, width: size.width, height: size.height },
      },
      label: displayLabel,
      rows: size.rows,
      rowHeight,
      language,
      touchRows: layout.touchRows,
      textScale: layout.textScale,
    });
    for (let depth = 0; depth < path.length; depth++) {
      const parent = panels[depth],
        item = parent.items[path[depth]];
      if (!item?.children?.length || item.disabled) break;
      const childSize = measureMenu(item.children, rowHeight, parent.textScale),
        bounds = placeSubmenu(
          parent.layout.bounds,
          parent.layout.bounds.y + parent.rows[path[depth]],
          childSize,
          layout.workarea,
        );
      panels.push({
        items: item.children,
        layout: { ...layout, bounds },
        label: item.label,
        rows: childSize.rows,
        rowHeight,
        language,
        touchRows: parent.touchRows,
        textScale: parent.textScale,
      });
    }
  }
  useEffect(() => {
    if (!layout) return;
    const key = `${focusLevel}:${active[focusLevel] ?? -1}`;
    const target = nodes.current.get(key) ?? panelNodes.current.get(focusLevel);
    target?.focus({ preventScroll: true });
  }, [layout, focusLevel, active]);
  useEffect(() => {
    if (!layout) return;
    const outside = (event: PointerEvent) => {
      if (
        !tree.current?.contains(event.target as Node) &&
        (activation === MenuActivation.ContextMenu ||
          !trigger.current?.contains(event.target as Node))
      )
        close(false);
    };
    const dismiss = () => close(false);
    const focusOutside = (event: FocusEvent) => {
      if (
        !tree.current?.contains(event.target as Node) &&
        (activation === MenuActivation.ContextMenu ||
          !trigger.current?.contains(event.target as Node))
      )
        close(false);
    };
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    const scroll = (event: Event) => {
      if (!tree.current?.contains(event.target as Node)) dismiss();
    };
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [layout, close, activation]);
  const openChild = (depth: number, index: number, keyboard: boolean) => {
    cancelTimer();
    const item = panels[depth]?.items[index];
    if (item?.disabled || !item?.children?.length) return;
    setPath((old) => [...old.slice(0, depth), index]);
    setActive((old) => [
      ...old.slice(0, depth),
      index,
      keyboard ? item.children!.findIndex((child) => !child.disabled) : -1,
    ]);
    setFocusLevel(depth + 1);
  };
  const select = (depth: number, index: number, keyboard = false) => {
    const item = panels[depth]?.items[index];
    if (!item || item.disabled) return;
    if (item.children?.length) openChild(depth, index, keyboard);
    else {
      close();
      item.onSelect?.();
    }
  };
  const hover = (depth: number, index: number) => {
    if (
      focusLevel === depth &&
      active[depth] === index &&
      (timer.current !== null || path[depth] === index)
    )
      return;
    cancelTimer();
    const item = panels[depth]?.items[index];
    if (!item || item.disabled) return;
    setFocusLevel(depth);
    setActive((old) => [...old.slice(0, depth), index]);
    if (path[depth] !== index) setPath((old) => old.slice(0, depth));
    if (item.children?.length && path[depth] !== index)
      timer.current = setTimeout(() => openChild(depth, index, false), SUBMENU_OPEN_DELAY_MS);
  };
  const pointed = (x: number, y: number) => {
    const button = hitElement({ x: x, y: y }, document)?.closest<HTMLElement>("[data-menu-owner]");
    if (button?.dataset.menuOwner !== id) return null;
    return {
      depth: Number(button.dataset.menuDepth),
      index: Number(button.dataset.menuIndex),
    };
  };
  return (
    <>
      {renderTrigger({
        buttonRef: trigger,
        type: "button",
        "aria-label": displayLabel,
        "aria-haspopup": "menu",
        "aria-expanded": !!layout,
        "aria-controls": layout ? id : undefined,
        onClick:
          activation === MenuActivation.Click
            ? (event) => (layout ? close() : open(event.detail === 0))
            : undefined,
        onContextMenu:
          activation === MenuActivation.ContextMenu
            ? (event) => {
                trigger.current = event.currentTarget;
                event.preventDefault();
                open(
                  false,
                  clientPoint(event).x || clientPoint(event).y
                    ? { x: clientPoint(event).x, y: clientPoint(event).y }
                    : undefined,
                );
              }
            : undefined,
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open(true);
          }
        },
      })}
      {layout &&
        createPortal(
          <div
            ref={tree}
            className={styles.menuTree}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (event.pointerType === "touch") {
                if (!event.isPrimary || touchContact.current) {
                  touchContact.current = null;
                  return;
                }
                // Pointer cancellation of compatibility mouse events does not
                // cancel native touch scrolling governed by touch-action.
                event.preventDefault();
                touchContact.current = {
                  id: event.pointerId,
                  x: clientPoint(event).x,
                  y: clientPoint(event).y,
                  moved: false,
                };
                return;
              }
              event.preventDefault();
              pointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const contact = touchContact.current;
              if (contact?.id === event.pointerId) {
                if (
                  Math.hypot(clientPoint(event).x - contact.x, clientPoint(event).y - contact.y) >=
                  8
                )
                  contact.moved = true;
                return;
              }
              if (pointer.current !== event.pointerId) return;
              const item = pointed(clientPoint(event).x, clientPoint(event).y);
              if (item) hover(item.depth, item.index);
            }}
            onPointerUp={(event) => {
              const contact = touchContact.current;
              if (contact?.id === event.pointerId) {
                touchContact.current = null;
                if (!contact.moved) {
                  const item = pointed(clientPoint(event).x, clientPoint(event).y);
                  if (item) {
                    event.preventDefault();
                    compatibilityMouse.current.complete(event.nativeEvent);
                    select(item.depth, item.index);
                  }
                }
                return;
              }
              if (pointer.current !== event.pointerId) return;
              pointer.current = null;
              const item = pointed(clientPoint(event).x, clientPoint(event).y);
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              if (item) select(item.depth, item.index);
            }}
            onPointerCancel={(event) => {
              if (event.pointerType === "touch") touchContact.current = null;
              else close();
            }}
            onLostPointerCapture={() => {
              pointer.current = null;
            }}
          >
            {panels.map((panel, depth) => {
              const { bounds, viewport, origin } = panel.layout,
                sx = viewport.width / viewport.sceneWidth,
                sy = viewport.height / viewport.sceneHeight;
              return (
                <ScrollArea
                  key={depth}
                  ref={(node) => {
                    if (node) panelNodes.current.set(depth, node);
                    else panelNodes.current.delete(depth);
                  }}
                  role="menu"
                  id={depth === 0 ? id : `${id}-${depth}`}
                  aria-label={panel.label}
                  tabIndex={-1}
                  className={`${styles.menuPanel} ${panel.touchRows ? styles.touchRows : ""}`}
                  viewport={viewport}
                  scrollX={bounds.width > layout.workarea.width}
                  scrollY={bounds.height > layout.workarea.height}
                  style={{
                    pointerEvents: "auto",
                    left: origin.x + Math.floor(bounds.x * sx),
                    top: origin.y + Math.floor(bounds.y * sy),
                    width: Math.min(
                      surfaceLayout(bounds, viewport).width,
                      Math.floor(layout.workarea.width * sx),
                    ),
                    height: Math.min(bounds.height, layout.workarea.height) * sy,
                    touchAction: touchRows ? "pan-y" : undefined,
                  }}
                  onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey) return;
                    const index = active[depth] ?? -1,
                      entries = panel.items;
                    const handled = () => {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelTimer();
                    };
                    if (event.key === "Escape" || (event.key === "ArrowLeft" && depth > 0)) {
                      handled();
                      if (depth > 0) {
                        setPath((old) => old.slice(0, depth - 1));
                        setActive((old) => old.slice(0, depth));
                        setFocusLevel(depth - 1);
                      } else close();
                      return;
                    }
                    if (event.key === "ArrowRight") {
                      handled();
                      if (entries[index]?.children?.length && !entries[index]?.disabled)
                        openChild(depth, index, true);
                      else onNavigate?.(1);
                      return;
                    }
                    if (event.key === "ArrowLeft") {
                      handled();
                      onNavigate?.(-1);
                      return;
                    }
                    if (event.key === "Tab") {
                      close();
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      handled();
                      select(depth, index, true);
                      return;
                    }
                    const mnemonic =
                      language === "en" && event.key.length === 1
                        ? menuMnemonicMatch(entries, event.key)
                        : -1;
                    if (mnemonic >= 0) {
                      handled();
                      select(depth, mnemonic, true);
                      return;
                    }
                    const enabled = entries
                        .map((item, index) => (item.disabled ? -1 : index))
                        .filter((index) => index >= 0),
                      offset = enabled.indexOf(index);
                    let next: number | undefined;
                    if (event.key === "ArrowDown") next = enabled[(offset + 1) % enabled.length];
                    else if (event.key === "ArrowUp")
                      next =
                        enabled[
                          offset < 0
                            ? enabled.length - 1
                            : (offset - 1 + enabled.length) % enabled.length
                        ];
                    else if (event.key === "Home") next = enabled[0];
                    else if (event.key === "End") next = enabled[enabled.length - 1];
                    else if (
                      event.key.length === 1 &&
                      !entries.some((item) => menuMnemonicIndex(item) >= 0)
                    )
                      next = [...enabled.slice(offset + 1), ...enabled.slice(0, offset + 1)].find(
                        (index) =>
                          entries[index].label.toLowerCase().startsWith(event.key.toLowerCase()),
                      );
                    if (next !== undefined) {
                      handled();
                      setPath((old) => old.slice(0, depth));
                      setActive((old) => [...old.slice(0, depth), next]);
                      setFocusLevel(depth);
                    }
                  }}
                >
                  <div
                    className={styles.menuSurface}
                    style={{
                      width: surfaceLayout(bounds, viewport).width,
                      height: surfaceLayout(bounds, viewport).height,
                    }}
                  >
                    <MenuArtwork panel={panel} active={path[depth] ?? active[depth] ?? -1} />
                    {panel.items.map((item, index) => (
                      <button
                        key={index}
                        ref={(node) => {
                          const key = `${depth}:${index}`;
                          if (node) nodes.current.set(key, node);
                          else nodes.current.delete(key);
                        }}
                        type="button"
                        role={
                          item.checked === undefined
                            ? "menuitem"
                            : item.checkType === MenuCheckType.Checkbox
                              ? "menuitemcheckbox"
                              : "menuitemradio"
                        }
                        aria-checked={item.checked}
                        aria-label={item.label}
                        aria-haspopup={item.children?.length ? "menu" : undefined}
                        aria-expanded={item.children?.length ? path[depth] === index : undefined}
                        aria-controls={
                          item.children?.length && path[depth] === index
                            ? `${id}-${depth + 1}`
                            : undefined
                        }
                        disabled={item.disabled}
                        tabIndex={-1}
                        {...stylusPointerInputProps(!item.disabled)}
                        data-menu-owner={id}
                        data-menu-depth={depth}
                        data-menu-index={index}
                        className={styles.menuItemHitTarget}
                        style={{
                          left: MENU_METRICS.itemInset * sx,
                          top: panel.rows[index] * sy,
                          width: (bounds.width - MENU_METRICS.itemInset * 2) * sx,
                          height: panel.rowHeight * sy,
                        }}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch") hover(depth, index);
                        }}
                        onPointerLeave={() => {
                          cancelTimer();
                          // MenuItem::onProcessMessage(kMouseLeaveMessage) keeps
                          // only an item whose submenu is open highlighted.
                          if (path[depth] !== index)
                            setActive((old) =>
                              old[depth] === index ? [...old.slice(0, depth), -1] : old,
                            );
                        }}
                        onClick={(event) => {
                          if (event.detail === 0) select(depth, index, true);
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
