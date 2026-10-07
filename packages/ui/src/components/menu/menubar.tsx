import {
  useEffect,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
  type MouseEventHandler,
} from "react";

import { centerThemePixel, useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import {
  DEFAULT_SURFACE_VIEWPORT,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { Menu, type MenuItem } from "$/components/menu/menu";
import { menuMnemonicIndex, SUBMENU_OPEN_DELAY_MS } from "$/components/menu/policy";
import { Text, TextVariant } from "$/components/text";

import styles from "$/components/menu/menu.module.css";
import navigationStyles from "$/components/menu/navigation.module.css";

const MENUBAR_DEFAULT_BOUNDS: SurfaceBounds = { x: 0, y: 0, width: 1920, height: 22 };
const MENUBAR_LABEL = "Application menu";
const MENU_TRIGGER_HORIZONTAL_PADDING = 16;
const MENU_TRIGGER_ICON_WIDTH = 32;

export interface MenubarMenu {
  label: string;
  /** Icon or other title content; label remains the accessible name. */
  content?: ReactNode;
  mnemonic?: string;
  /** Markup position used to derive the source mnemonic character. */
  mnemonicIndex?: number;
  items: readonly MenuItem[];
}
function mnemonicIndex(menu: MenubarMenu) {
  return menuMnemonicIndex({
    ...menu,
    mnemonic: menu.mnemonic ?? (menu.mnemonicIndex === undefined ? [...menu.label][0] : undefined),
  });
}
function mnemonic(menu: MenubarMenu) {
  return [...menu.label][mnemonicIndex(menu)] ?? "";
}
export enum MenubarLayout {
  Positioned = "positioned",
  Flow = "flow",
}

export interface MenubarNavigationLink {
  label: string;
  /** Optional visible icon/content; label remains the accessible name. */
  content?: ReactNode;
  href: string;
  /** Start the group pinned to the trailing edge; subsequent links join it. */
  end?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  current?: boolean;
  lang?: string;
  hrefLang?: string;
  target?: string;
  rel?: string;
}
export interface MenubarProps {
  menus?: readonly MenubarMenu[];
  /** Menus before the application commands, such as a brand menu. */
  leadingMenus?: readonly MenubarMenu[];
  layout?: MenubarLayout;
  /** System menus pinned to the trailing edge in the flow layout. */
  trailingMenus?: readonly MenubarMenu[];
  /** Native page links rendered as a flat system-style navigation bar. */
  links?: readonly MenubarNavigationLink[];
  leadingContent?: ReactNode;
  /** Controls beside links in the flow/navigation layout. */
  trailingContent?: ReactNode;
  bounds?: SurfaceBounds;
  /** Scene width while retaining the theme's natural menu-bar height. */
  width?: number;
  viewport?: SurfaceViewport;
  label?: string;
  onMenuOpen?: (index: number) => void;
  expandOnHover?: boolean;
}
/** Flat bitmap-theme menu surface with a two-pixel logical item border. */
export function Menubar({
  menus = [],
  leadingMenus = [],
  trailingMenus = [],
  layout = MenubarLayout.Positioned,
  links,
  leadingContent,
  trailingContent,
  bounds: suppliedBounds,
  width,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  label = MENUBAR_LABEL,
  onMenuOpen,
  expandOnHover = false,
}: MenubarProps) {
  const { definition: theme, language, translateSource } = useTheme();
  const bounds = suppliedBounds ?? {
    ...MENUBAR_DEFAULT_BOUNDS,
    width: width ?? MENUBAR_DEFAULT_BOUNDS.width,
    height: theme.dimensions.menubar_height ?? MENUBAR_DEFAULT_BOUNDS.height,
  };
  const { measureThemeText, themeFontHeight } = useThemeText();
  const allMenus = [...leadingMenus, ...menus, ...trailingMenus];
  const displayMenus = allMenus.map((menu) => ({ ...menu, label: translateSource(menu.label) }));
  const [opened, setOpened] = useState(-1),
    [hovered, setHovered] = useState(-1);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverOpen = () => {
    if (hoverTimer.current === null) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const onMenuOpenRef = useRef(onMenuOpen);
  onMenuOpenRef.current = onMenuOpen;
  useEffect(() => {
    if (opened >= 0) onMenuOpenRef.current?.(opened);
  }, [opened]);
  useEffect(() => {
    if (expandOnHover || hoverTimer.current === null) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, [expandOnHover]);
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const sx = viewport.width / viewport.sceneWidth,
    sy = viewport.height / viewport.sceneHeight;
  let left = bounds.x;
  const positions = displayMenus.map((menu) => {
    const position = {
      x: left,
      width: menu.content
        ? MENU_TRIGGER_ICON_WIDTH
        : measureThemeText(menu.label) +
          (theme.dimensions.menubar_horizontal_padding ?? MENU_TRIGGER_HORIZONTAL_PADDING),
    };
    left += position.width;
    return position;
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key.length !== 1 ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      if (language !== "en") return;
      const index = allMenus.findIndex(
        (menu) => mnemonic(menu).toLowerCase() === event.key.toLowerCase(),
      );
      if (index >= 0) {
        event.preventDefault();
        setOpened(index);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [menus, leadingMenus, trailingMenus, language]);
  if (
    links ||
    leadingMenus.length > 0 ||
    trailingMenus.length > 0 ||
    layout === MenubarLayout.Flow
  ) {
    const entries = links ?? [];
    const menuOnly = entries.length === 0;
    const trailingStart = entries.findIndex((link) => link.end);
    const primary = trailingStart < 0 ? entries : entries.slice(0, trailingStart);
    const trailing = trailingStart < 0 ? [] : entries.slice(trailingStart);
    const renderLink = (link: MenubarNavigationLink) => (
      <a
        key={link.href}
        href={link.href}
        lang={link.lang}
        hrefLang={link.hrefLang}
        target={link.target}
        rel={link.rel}
        onClick={link.onClick}
        className={navigationStyles.link}
        data-ui-menubar-link="true"
        data-ui-menubar-end={link.end || undefined}
        aria-current={link.current ? "page" : undefined}
        aria-label={link.content !== undefined ? translateSource(link.label) : undefined}
      >
        {link.content ?? translateSource(link.label)}
      </a>
    );
    const renderMenus = (start: number, end: number) => (
      <div
        className={navigationStyles.menus}
        data-ui-menubar-menus="true"
        role={menuOnly ? "presentation" : "menubar"}
        aria-label={menuOnly ? undefined : translateSource(label)}
      >
        {displayMenus.slice(start, end).map((menu, offset) => {
          const index = start + offset;
          return (
            <Menu
              key={index}
              label={menu.label}
              items={menu.items}
              expanded={opened === index}
              onExpandedChange={(open) =>
                setOpened((previous) => (open ? index : previous === index ? -1 : previous))
              }
              onNavigate={(direction) =>
                setOpened((index + direction + allMenus.length) % allMenus.length)
              }
              renderTrigger={({ buttonRef, ...props }) => (
                <button
                  {...props}
                  ref={buttonRef}
                  type="button"
                  role="menuitem"
                  className={navigationStyles.link}
                  data-ui-menubar-link="true"
                  data-open={opened === index || undefined}
                  data-icon={menu.content !== undefined || undefined}
                  tabIndex={index === Math.max(0, opened) ? 0 : -1}
                  onPointerEnter={(event) => {
                    cancelHoverOpen();
                    if (event.pointerType === "mouse") {
                      if (opened >= 0) setOpened(index);
                      else if (expandOnHover)
                        hoverTimer.current = setTimeout(() => {
                          hoverTimer.current = null;
                          setOpened(index);
                        }, SUBMENU_OPEN_DELAY_MS);
                    }
                  }}
                  onPointerLeave={cancelHoverOpen}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      setOpened(
                        (index + (event.key === "ArrowLeft" ? -1 : 1) + allMenus.length) %
                          allMenus.length,
                      );
                    } else props.onKeyDown?.(event);
                  }}
                >
                  {menu.content ?? menu.label}
                </button>
              )}
            />
          );
        })}
      </div>
    );
    return (
      <nav
        role={menuOnly ? "menubar" : undefined}
        aria-label={translateSource(label)}
        className={navigationStyles.bar}
        data-ui-menubar="navigation"
      >
        {leadingMenus.length > 0 && renderMenus(0, leadingMenus.length)}
        {leadingContent && (
          <span className={navigationStyles.leading} data-ui-menubar-leading="true">
            {leadingContent}
          </span>
        )}
        <div className={navigationStyles.items} data-ui-menubar-items="true">
          {menus.length > 0 && renderMenus(leadingMenus.length, leadingMenus.length + menus.length)}
          {primary.map(renderLink)}
        </div>
        {(trailingContent || trailingMenus.length > 0 || trailing.length > 0) && (
          <div className={navigationStyles.trailing} data-ui-menubar-trailing="true">
            {trailingMenus.length > 0 &&
              renderMenus(leadingMenus.length + menus.length, allMenus.length)}
            {trailingContent}
            {trailing.map(renderLink)}
          </div>
        )}
      </nav>
    );
  }
  return (
    <div
      role="menubar"
      aria-label={translateSource(label)}
      className={styles.menuBar}
      onPointerDownCapture={cancelHoverOpen}
      style={
        {
          left: bounds.x * sx,
          top: bounds.y * sy,
          width: bounds.width * sx,
          height: bounds.height * sy,
          "--ui-menu-normal-face": theme.colors.menuitem_normal_face,
          "--ui-menu-highlight-face": theme.colors.menuitem_highlight_face,
          "--ui-menu-hot-face": theme.colors.menuitem_hot_face,
        } as CSSProperties
      }
    >
      {displayMenus.map((menu, index) => (
        <Menu
          key={menu.label}
          label={menu.label}
          items={menu.items}
          expanded={opened === index}
          onExpandedChange={(value) =>
            setOpened((previous) => (value ? index : previous === index ? -1 : previous))
          }
          onNavigate={(direction) => setOpened((index + direction + menus.length) % menus.length)}
          renderTrigger={({ buttonRef, ...props }) => (
            <button
              {...props}
              ref={buttonRef}
              role="menuitem"
              aria-keyshortcuts={`Alt+${mnemonic(menu).toUpperCase()}`}
              className={styles.menuTrigger}
              data-open={opened === index ? "true" : undefined}
              data-hovered={hovered === index ? "true" : undefined}
              tabIndex={index === Math.max(0, opened) ? 0 : -1}
              onPointerEnter={(event) => {
                cancelHoverOpen();
                setHovered(index);
                if (event.pointerType === "mouse") {
                  if (opened >= 0) setOpened(index);
                  else if (expandOnHover)
                    hoverTimer.current = setTimeout(() => {
                      hoverTimer.current = null;
                      setOpened(index);
                    }, SUBMENU_OPEN_DELAY_MS);
                }
              }}
              onPointerLeave={() => {
                cancelHoverOpen();
                setHovered(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setOpened(
                    (index + (event.key === "ArrowLeft" ? -1 : 1) + menus.length) % menus.length,
                  );
                } else props.onKeyDown?.(event);
              }}
              style={{
                left: (positions[index].x - bounds.x) * sx,
                top: 0,
                width: positions[index].width * sx,
                height: bounds.height * sy,
              }}
            >
              <span
                aria-hidden="true"
                className={styles.menuTriggerArt}
                style={{
                  width: positions[index].width,
                  height: bounds.height,
                  transform: `scale(${sx}, ${sy})`,
                }}
              >
                {menu.content ? (
                  <span
                    className={styles.menuTriggerContent}
                    style={{
                      color:
                        opened === index
                          ? theme.colors.menuitem_highlight_text
                          : hovered === index
                            ? theme.colors.menuitem_hot_text
                            : theme.colors.menuitem_normal_text,
                    }}
                  >
                    {menu.content}
                  </span>
                ) : (
                  <Text
                    variant={TextVariant.PositionedPixel}
                    text={menu.label}
                    x={
                      centerThemePixel(
                        positions[index].x,
                        positions[index].width,
                        measureThemeText(menu.label),
                      ) - positions[index].x
                    }
                    y={centerThemePixel(bounds.y, bounds.height, themeFontHeight()) - bounds.y}
                    color={
                      opened === index
                        ? theme.colors.menuitem_highlight_text
                        : hovered === index
                          ? theme.colors.menuitem_hot_text
                          : theme.colors.menuitem_normal_text
                    }
                  />
                )}
                {!menu.content &&
                  language === "en" &&
                  theme.dimensions.menubar_mnemonics_visible !== 0 &&
                  mnemonicIndex(menu) >= 0 &&
                  mnemonicIndex(menu) < [...menu.label].length && (
                    <span
                      aria-hidden="true"
                      className={styles.mnemonicUnderline}
                      style={{
                        left:
                          centerThemePixel(
                            positions[index].x,
                            positions[index].width,
                            measureThemeText(menu.label),
                          ) -
                          positions[index].x +
                          measureThemeText([...menu.label].slice(0, mnemonicIndex(menu)).join("")),
                        top:
                          centerThemePixel(bounds.y, bounds.height, themeFontHeight()) -
                          bounds.y +
                          themeFontHeight(),
                        width: measureThemeText([...menu.label][mnemonicIndex(menu)]),
                        height: 2,
                        background:
                          opened === index
                            ? theme.colors.menuitem_highlight_text
                            : hovered === index
                              ? theme.colors.menuitem_hot_text
                              : theme.colors.menuitem_normal_text,
                      }}
                    />
                  )}
              </span>
            </button>
          )}
        />
      ))}
    </div>
  );
}
