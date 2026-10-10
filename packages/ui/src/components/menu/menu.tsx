import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { measureThemeText, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemeIcon, ThemePart } from "$/base/theme/theme-part";
import { ThemeRepeat } from "$/base/theme/theme-repeat";
import { ThemeScope } from "$/base/theme/theme-scope";
import {
  computedStyle,
  viewportSize,
  hitElement,
  clientPoint,
  clientRect,
} from "$/base/utils/dom-geometry";
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
import { menuShortcutArtwork, menuTextArtwork } from "$/components/menu/shortcut-artwork";
import { ScrollArea } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/menu/menu.module.css";

const DEFAULT_MENU_METRICS = {
  rowHeight: 22,
  themeArtScale: 2,
  frameInset: 6,
  separatorHeight: 8,
  separatorOffsetY: 0,
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
  shortcutColumnAligned: 0,
  shortcutGlyphOffsetY: 0,
  widthReserve: 32,
  minimumWidth: 0,
  textStateOffsetX: 0,
} as const;

type MenuMetrics = { [Key in keyof typeof DEFAULT_MENU_METRICS]: number };
function menuMetrics(dimensions: Record<string, number>): MenuMetrics {
  return Object.fromEntries(
    Object.entries(DEFAULT_MENU_METRICS).map(([key, value]) => [
      key,
      dimensions[`menu_${key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)}`] ?? value,
    ]),
  ) as MenuMetrics;
}

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
  /** Native navigation; browser modifier clicks and context menus remain available. */
  href?: string;
  /** Close the menu without reloading the current destination on a plain click. */
  current?: boolean;
  hrefLang?: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** Optional application/document icon, after the checkmark column. */
  icon?: ReactNode;
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
  rowHeight: number = DEFAULT_MENU_METRICS.rowHeight,
  textScale: number = DEFAULT_MENU_METRICS.textScale,
  measure: typeof measureThemeText = measureThemeText,
  MENU_METRICS: MenuMetrics = DEFAULT_MENU_METRICS,
  shortcutGlyphs?: Parameters<typeof menuShortcutArtwork>[1],
  labelGlyphs?: Parameters<typeof menuTextArtwork>[1],
) {
  let y = MENU_METRICS.frameInset;
  const rows = items.map((item) => {
    if (item.separator) y += MENU_METRICS.separatorHeight;
    const top = y;
    y += rowHeight;
    return top;
  });
  const shortcutWidth = (item: MenuItem) =>
    item.shortcut && !item.children?.length
      ? menuShortcutArtwork(
          item.shortcut,
          shortcutGlyphs,
          (text) => measure(text, "default", textScale),
          textScale / DEFAULT_MENU_METRICS.textScale,
        ).width
      : 0;
  const columnWidth = Math.max(0, ...items.map(shortcutWidth));
  const width =
    Math.max(
      0,
      ...items.map(
        (item) =>
          menuTextArtwork(
            item.label,
            labelGlyphs,
            (text) => measure(text, "default", textScale),
            textScale / DEFAULT_MENU_METRICS.textScale,
          ).width + (MENU_METRICS.shortcutColumnAligned ? columnWidth : shortcutWidth(item)),
      ),
    ) +
    MENU_METRICS.textInset +
    (items.some((item) => item.icon) ? rowHeight + MENU_METRICS.itemInset : 0) +
    MENU_METRICS.widthReserve;
  return {
    rows,
    width: Math.max(width, MENU_METRICS.minimumWidth),
    height: y + MENU_METRICS.frameInset,
  };
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
function menuDestinations(items: readonly MenuItem[]): readonly MenuItem[] {
  return items.flatMap((item) => [
    ...(item.href ? [item] : []),
    ...(item.children ? menuDestinations(item.children) : []),
  ]);
}
function MenuArtwork({ panel, active }: { panel: Panel; active: number }) {
  const { definition: theme } = useTheme();
  const MENU_METRICS = menuMetrics(theme.dimensions);
  const { measureThemeText, themeFontHeight } = useThemeText();
  const { bounds, viewport } = panel.layout;
  const layout = surfaceLayout(bounds, viewport);
  const sx = layout.width / bounds.width,
    sy = layout.height / bounds.height;
  const fontHeight = themeFontHeight("default", panel.textScale);
  const iconColumn = panel.items.some((item) => item.icon)
    ? panel.rowHeight + MENU_METRICS.itemInset
    : 0;
  const shortcutArtwork = (value: string) =>
    menuShortcutArtwork(
      value,
      theme.controlParts?.menu?.shortcutGlyphs,
      (text) => measureThemeText(text, "default", panel.textScale),
      panel.textScale / DEFAULT_MENU_METRICS.textScale,
    );
  const shortcutColumnWidth = Math.max(
    0,
    ...panel.items.map((item) =>
      item.shortcut && !item.children?.length ? shortcutArtwork(item.shortcut).width : 0,
    ),
  );
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
        {menuTextArtwork(
          value,
          theme.controlParts?.menu?.labelGlyphs,
          (text) => measureThemeText(text, "default", panel.textScale),
          panel.textScale / DEFAULT_MENU_METRICS.textScale,
        ).segments.map((segment, index) =>
          segment.glyph ? (
            <svg
              key={index}
              aria-hidden="true"
              width={(segment.glyph.width * panel.textScale) / DEFAULT_MENU_METRICS.textScale}
              height={(segment.glyph.height * panel.textScale) / DEFAULT_MENU_METRICS.textScale}
              viewBox={`0 0 ${segment.glyph.width} ${segment.glyph.height}`}
              shapeRendering="crispEdges"
              style={{
                position: "absolute",
                left: left + dx + segment.x,
                top: top + Math.floor((panel.rowHeight - fontHeight) / 2) + dy,
              }}
            >
              {segment.glyph.paths.map((path, index) => (
                <path key={index} d={path.path} fill={ink} opacity={path.opacity} />
              ))}
            </svg>
          ) : (
            <Text
              key={index}
              variant={TextVariant.PositionedPixel}
              text={segment.text!}
              x={left + dx + segment.x}
              y={top + Math.floor((panel.rowHeight - fontHeight) / 2) + dy}
              color={ink}
            />
          ),
        )}
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
          const mnemonic =
            panel.language === "en" && theme.dimensions.menu_mnemonics_visible !== 0
              ? menuMnemonicIndex(item)
              : -1;
          return (
            <span key={index}>
              {item.separator && (
                <span
                  className={styles.menuSeparator}
                  style={{
                    left: MENU_METRICS.itemInset,
                    top: top - MENU_METRICS.separatorHeight + MENU_METRICS.separatorOffsetY,
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
              {item.checked && theme.controlParts?.menu?.checkedVector ? (
                <svg
                  aria-hidden="true"
                  width={theme.controlParts.menu.checkedVector.width}
                  height={theme.controlParts.menu.checkedVector.height}
                  viewBox={`0 0 ${theme.controlParts.menu.checkedVector.width} ${theme.controlParts.menu.checkedVector.height}`}
                  shapeRendering="crispEdges"
                  style={{
                    position: "absolute",
                    left: MENU_METRICS.itemInset,
                    top: top + (panel.rowHeight - theme.controlParts.menu.checkedVector.height) / 2,
                  }}
                >
                  <path d={theme.controlParts.menu.checkedVector.path} fill={ink} />
                </svg>
              ) : (
                item.checked && (
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
                )
              )}
              {item.icon && (
                <span
                  className={styles.menuItemIcon}
                  style={{
                    left: MENU_METRICS.textInset,
                    top,
                    width: panel.rowHeight,
                    height: panel.rowHeight,
                    color: ink,
                  }}
                >
                  {item.icon}
                </span>
              )}
              {text(
                item.label,
                MENU_METRICS.textInset +
                  iconColumn +
                  (selected || item.disabled ? MENU_METRICS.textStateOffsetX : 0),
                top,
                ink,
                !!item.disabled,
                mnemonic,
              )}
              {item.children?.length ? (
                <>
                  {item.disabled &&
                    !theme.controlParts?.menu?.arrowPart &&
                    arrow(
                      top,
                      theme.colors.background,
                      MENU_METRICS.disabledEmboss,
                      MENU_METRICS.disabledEmboss,
                    )}
                  {theme.controlParts?.menu?.arrowPart ? (
                    <ThemeIcon
                      part={theme.controlParts.menu.arrowPart}
                      color={ink}
                      scale={2}
                      x={
                        bounds.width -
                        MENU_METRICS.submenuArrowInset -
                        theme.parts[theme.controlParts.menu.arrowPart].width * 2
                      }
                      y={
                        top +
                        (panel.rowHeight -
                          theme.parts[theme.controlParts.menu.arrowPart].height * 2) /
                          2
                      }
                    />
                  ) : (
                    arrow(top, ink)
                  )}
                </>
              ) : item.shortcut ? (
                (() => {
                  const scale = panel.textScale / DEFAULT_MENU_METRICS.textScale;
                  const shortcut = shortcutArtwork(item.shortcut);
                  const left =
                    bounds.width -
                    MENU_METRICS.shortcutInset -
                    (MENU_METRICS.shortcutColumnAligned ? shortcutColumnWidth : shortcut.width);
                  return shortcut.segments.map((segment, index) =>
                    segment.glyph ? (
                      <svg
                        key={index}
                        aria-hidden="true"
                        width={segment.glyph.width * scale}
                        height={segment.glyph.height * scale}
                        viewBox={`0 0 ${segment.glyph.width} ${segment.glyph.height}`}
                        shapeRendering="crispEdges"
                        style={{
                          position: "absolute",
                          left: left + segment.x,
                          top:
                            top +
                            Math.floor((panel.rowHeight - segment.glyph.height * scale) / 2) +
                            MENU_METRICS.shortcutGlyphOffsetY,
                        }}
                      >
                        {segment.glyph.paths.map((path, index) => (
                          <path key={index} d={path.path} fill={ink} opacity={path.opacity} />
                        ))}
                      </svg>
                    ) : (
                      <span key={index}>
                        {text(segment.text!, left + segment.x, top, ink, !!item.disabled)}
                      </span>
                    ),
                  );
                })()
              ) : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
/** Native menu destinations and commands share their geometry and input handlers. */
function MenuItemTarget({
  item,
  targetRef,
  onActivate,
  onNavigate,
  ...props
}: HTMLAttributes<HTMLElement> & {
  item: MenuItem;
  targetRef?: (node: HTMLElement | null) => void;
  onActivate?: () => void;
  onNavigate: () => void;
}) {
  if (item.href) {
    return (
      <a
        {...props}
        ref={targetRef}
        href={item.disabled ? undefined : item.href}
        aria-current={item.current ? "page" : undefined}
        hrefLang={item.hrefLang}
        target={item.target}
        rel={item.rel}
        onClick={(event) => {
          if (item.disabled) {
            event.preventDefault();
            return;
          }
          if (item.current && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
            event.preventDefault();
          item.onClick?.(event);
          onNavigate();
        }}
      >
        <span className={styles.menuItemLabel} aria-hidden="true">
          {item.label}
        </span>
      </a>
    );
  }
  return (
    <button
      {...props}
      ref={targetRef}
      type="button"
      disabled={item.disabled}
      onClick={(event) => {
        if (event.detail === 0) onActivate?.();
      }}
    />
  );
}

/** One scene popup tree: DOM artwork and semantic targets share the same geometry. */
export function Menu<Trigger extends HTMLElement = HTMLButtonElement>({
  label,
  items,
  renderTrigger,
  activation = MenuActivation.Click,
  expanded,
  onExpandedChange,
  onNavigate,
}: MenuProps<Trigger>) {
  const { definition: theme, language, translateSource } = useTheme();
  const MENU_METRICS = menuMetrics(theme.dimensions);
  const { measureThemeText, themeFontHeight } = useThemeText();
  const [touchRows, setTouchRows] = useState(false);
  const rowHeight = MENU_METRICS.rowHeight;
  const localizedItems = useMemo(
    () => translateItems(items, translateSource),
    [items, language, translateSource],
  );
  const displayLabel = translateSource(label);
  const destinations = useMemo(() => menuDestinations(localizedItems), [localizedItems]);
  const id = useId(),
    trigger = useRef<Trigger | null>(null),
    tree = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const triggerPress = useRef<number | null>(null);
  const skipTriggerClick = useRef(false);
  const nodes = useRef(new Map<string, HTMLElement>()),
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
      triggerPress.current = null;
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
    const nextRowHeight = MENU_METRICS.rowHeight;
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
      size = measureMenu(
        localizedItems,
        nextRowHeight,
        textScale,
        measureThemeText,
        MENU_METRICS,
        theme.controlParts?.menu?.shortcutGlyphs,
        theme.controlParts?.menu?.labelGlyphs,
      );
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
    if (expanded) {
      const selectFirst = theme.controlParts?.menu?.selectFirstOnOpen !== false;
      if (selectFirst || !layout) open(selectFirst);
    } else {
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
    const size = measureMenu(
      localizedItems,
      rowHeight,
      layout.textScale,
      measureThemeText,
      MENU_METRICS,
      theme.controlParts?.menu?.shortcutGlyphs,
      theme.controlParts?.menu?.labelGlyphs,
    );
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
      const childSize = measureMenu(
          item.children,
          rowHeight,
          parent.textScale,
          measureThemeText,
          MENU_METRICS,
          theme.controlParts?.menu?.shortcutGlyphs,
          theme.controlParts?.menu?.labelGlyphs,
        ),
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
    else if (item.href) nodes.current.get(`${depth}:${index}`)?.click();
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
  // Keep the initial title press active while the pointer crosses into the popup.
  useEffect(() => {
    if (!layout || triggerPress.current === null) return;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== triggerPress.current) return;
      const item = pointed(clientPoint(event).x, clientPoint(event).y);
      if (item) hover(item.depth, item.index);
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== triggerPress.current) return;
      triggerPress.current = null;
      const node = trigger.current;
      if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      const item = pointed(clientPoint(event).x, clientPoint(event).y);
      if (item) select(item.depth, item.index);
      else if (!node?.contains(hitElement(clientPoint(event), document))) close(false);
    };
    const cancel = () => close(false);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", cancel);
    };
  });
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
            ? (event) => {
                if (skipTriggerClick.current && event.detail !== 0) {
                  skipTriggerClick.current = false;
                  return;
                }
                skipTriggerClick.current = false;
                if (layout) close();
                else open(event.detail === 0);
              }
            : undefined,
        onPointerDown:
          activation === MenuActivation.Click && theme.controlParts?.menu?.pressToOpen
            ? (event) => {
                if (event.pointerType !== "mouse" || event.button !== 0) return;
                event.preventDefault();
                skipTriggerClick.current = true;
                if (layout) close();
                else {
                  open();
                  triggerPress.current = event.pointerId;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }
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
      {destinations.length > 0 && (
        <div hidden className={styles.collapsedDestinations}>
          {destinations
            .filter((item) => !panels.some((panel) => panel.items.includes(item)))
            .map((item, index) => (
              <MenuItemTarget
                key={index}
                item={item}
                aria-label={item.label}
                tabIndex={-1}
                onNavigate={() => close()}
              />
            ))}
        </div>
      )}
      {layout &&
        createPortal(
          <ThemeScope>
            <div
              ref={tree}
              className={styles.menuTree}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                // A native link must keep its own click target and browser gestures.
                if (event.target instanceof Element && event.target.closest("a[href]")) return;
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
                    Math.hypot(
                      clientPoint(event).x - contact.x,
                      clientPoint(event).y - contact.y,
                    ) >= 8
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
                if (item && !panels[item.depth]?.items[item.index]?.href)
                  select(item.depth, item.index);
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
                      boxShadow: "var(--ui-menu-popup-shadow, none)",
                      clipPath: "var(--ui-menu-popup-clip, none)",
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
                        <MenuItemTarget
                          key={index}
                          item={item}
                          targetRef={(node) => {
                            const key = `${depth}:${index}`;
                            if (node) nodes.current.set(key, node);
                            else nodes.current.delete(key);
                          }}
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
                          aria-disabled={item.disabled || undefined}
                          onActivate={() => select(depth, index, true)}
                          onNavigate={() => close()}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                );
              })}
            </div>
          </ThemeScope>,
          document.body,
        )}
    </>
  );
}
