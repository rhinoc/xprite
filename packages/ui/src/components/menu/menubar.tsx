import { useEffect, useState, useRef, type CSSProperties } from "react";

import {
  centerThemePixel,
  themeFontHeight,
  measureThemeText,
} from "$/base/components/theme-controls";
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

const MENUBAR_DEFAULT_BOUNDS: SurfaceBounds = { x: 0, y: 0, width: 1920, height: 22 };
const MENUBAR_LABEL = "Application menu";
const MENU_TRIGGER_HORIZONTAL_PADDING = 16;

export interface MenubarMenu {
  label: string;
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
export interface MenubarProps {
  menus: readonly MenubarMenu[];
  bounds?: SurfaceBounds;
  viewport?: SurfaceViewport;
  label?: string;
  onMenuOpen?: (index: number) => void;
  expandOnHover?: boolean;
}
/** Flat bitmap-theme menu surface with a two-pixel logical item border. */
export function Menubar({
  menus,
  bounds = MENUBAR_DEFAULT_BOUNDS,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  label = MENUBAR_LABEL,
  onMenuOpen,
  expandOnHover = false,
}: MenubarProps) {
  const { definition: theme, language, translateSource } = useTheme();
  const displayMenus = menus.map((menu) => ({ ...menu, label: translateSource(menu.label) }));
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
      width: measureThemeText(menu.label) + MENU_TRIGGER_HORIZONTAL_PADDING,
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
      const index = menus.findIndex(
        (menu) => mnemonic(menu).toLowerCase() === event.key.toLowerCase(),
      );
      if (index >= 0) {
        event.preventDefault();
        setOpened(index);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [menus, language]);
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
                {language === "en" &&
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
