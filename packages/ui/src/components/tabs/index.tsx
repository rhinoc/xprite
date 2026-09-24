import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { composeEventHandlers } from "$/base/utils/compose-event-handlers";
import { clientPoint, clientRect } from "$/base/utils/dom-geometry";
import { UI_SCALE_X } from "$/components/canvas-surface/geometry";
import { UI_SCALE } from "$/components/canvas-surface/metrics";
import { useTabInteractions, type TabDragPoint } from "$/components/tabs/use-tab-interactions";
import { Text, TextVariant } from "$/components/text";
import { UiIcon, UiPart, uiMetrics, useUi, type UiPartName } from "$/components/theme/appearance";

import styles from "$/components/tabs/tabs.module.css";

const TAB_TRAILING_GAP = 4;

export interface TabItem {
  id: string;
  label: string;
  /** Theme icon for a tab such as the workspace home tab. */
  icon?: { active: UiPartName; inactive: UiPartName };
  /** Translate labels that are UI source strings rather than user content. */
  translateLabel?: boolean;
  modified?: boolean;
  closable?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClose" | "onDragEnd"> {
  tabs: readonly TabItem[];
  value: string;
  width: number;
  onValueChange: (id: string) => void;
  onClose?: (id: string) => void;
  onReorder?: (id: string, targetId: string) => void;
  /** Disable tab dragging while retaining touch scrolling and tab selection. */
  dragEnabled?: boolean;
  paneId?: string;
  onDragMove?: (id: string, point: TabDragPoint) => void;
  onDragEnd?: (id: string, point: TabDragPoint, cancelled: boolean) => void;
  ariaLabel?: string;
  tabListLabel?: string;
  onDoubleClickEmpty?: () => void;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  /** Optional content in the free area before the tabs. */
  leadingContent?: ReactNode;
  /** Width reserved before the tabs for leading controls, in CSS pixels. */
  leadingContentWidth?: number;
  /** Inline content after the tabs, pushed to the end when space permits. */
  trailingContent?: ReactNode;
  /** Width reserved after the tabs for trailing controls, in CSS pixels. */
  trailingContentWidth?: number;
  children?: ReactNode;
  className?: string;
  narrowTabWidth?: number;
}

/** A themed tab strip with selection, reordering, and close behavior. */
export function Tabs({
  tabs,
  value,
  width,
  onValueChange,
  onClose,
  onReorder,
  dragEnabled,
  paneId,
  onDragMove,
  onDragEnd,
  ariaLabel = "Tabs",
  tabListLabel = "Tabs",
  onDoubleClickEmpty,
  onContextMenu,
  onDoubleClick,
  style: rootStyle,
  leadingContent,
  leadingContentWidth = 0,
  trailingContent,
  trailingContentWidth = 0,
  children,
  className = "",
  narrowTabWidth,
  ...props
}: TabsProps) {
  const { style, translateKey, translateSource } = useUi();
  const metrics = uiMetrics(style);
  const [denseUi, setDenseUi] = useState(false);
  const interactions = useTabInteractions({
    tabs: tabs.map((tab) => tab.id),
    value,
    onValueChange,
    onClose: onClose ?? (() => {}),
    onReorder,
    dragEnabled,
    onDragMove,
    onDragEnd,
  });
  useLayoutEffect(() => {
    const root = interactions.ref.current?.closest<HTMLElement>("[data-ui-compact]");
    if (!root) return;
    const update = () => setDenseUi(root.dataset.uiCompact === "true");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-ui-compact"] });
    return () => observer.disconnect();
  }, [interactions.ref]);
  const tabWidth = denseUi
    ? (narrowTabWidth ?? Math.min(112, metrics.tabWidth * 2))
    : metrics.tabWidth * 2;
  const faceHeight = metrics.tabFaceHeight * 2;
  const bottomHeight = metrics.tabBottomHeight * 2;
  const closeWidth = metrics.tabCloseWidth * 2;
  const tabContentWidth = tabs.length * tabWidth + TAB_TRAILING_GAP;
  const availableTabWidth = Math.max(0, width - leadingContentWidth - trailingContentWidth);
  const scrollContentWidth = trailingContent
    ? tabContentWidth
    : Math.max(availableTabWidth, tabContentWidth);
  const contentWidth = tabContentWidth + leadingContentWidth + trailingContentWidth;
  const paintWidth =
    denseUi || leadingContentWidth > 0 || trailingContentWidth > 0
      ? Math.max(width, contentWidth)
      : width;
  const [hotClose, setHotClose] = useState<string | null>(null);
  const [pressedClose, setPressedClose] = useState<string | null>(null);
  const artwork = (tab: TabItem, x: number, active: boolean, floating = false) => {
    const label = tab.translateLabel ? translateSource(tab.label) : tab.label;
    const closeHot = !floating && hotClose === tab.id;
    const closePressed = !floating && pressedClose === tab.id && closeHot;
    const icon =
      tab.modified && !closeHot
        ? active
          ? "tab_modified_icon_active"
          : "tab_modified_icon_normal"
        : active && !closePressed
          ? "tab_close_icon_active"
          : "tab_close_icon_normal";
    return (
      <span
        key={tab.id}
        aria-hidden="true"
        className={styles.artwork}
        style={{
          position: "absolute",
          left: x,
          top: 0,
          width: tabWidth,
          height: faceHeight + bottomHeight,
          pointerEvents: "none",
        }}
      >
        <UiPart
          part={active ? "tab_active" : "tab_normal"}
          scale={2}
          drawCenter
          style={{ position: "absolute", left: 0, top: 0, width: tabWidth, height: faceHeight }}
        />
        <UiPart
          part={active ? "tab_bottom_active" : "tab_bottom_normal"}
          scale={2}
          drawCenter
          style={{
            position: "absolute",
            left: 0,
            top: faceHeight,
            width: tabWidth,
            height: bottomHeight,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: tab.closable === false ? tabWidth - 8 : tabWidth - closeWidth,
            height: faceHeight,
            overflow: "hidden",
          }}
        >
          {tab.icon && (
            <UiIcon part={active ? tab.icon.active : tab.icon.inactive} x={8} y={6} scale={2} />
          )}
          <Text
            variant={TextVariant.PositionedPixel}
            text={label}
            x={tab.icon ? 28 : 8}
            y={8}
            color={active ? style.colors.tab_active_text : style.colors.tab_normal_text}
          />
        </span>
        {tab.closable !== false && onClose && (
          <>
            {closeHot && (
              <UiPart
                part={closePressed ? "tab_icon_bg_clicked" : "tab_icon_bg_hover"}
                scale={2}
                drawCenter
                style={{
                  position: "absolute",
                  left: tabWidth - closeWidth,
                  top: 0,
                  width: 28,
                  height: faceHeight,
                }}
              />
            )}
            <UiIcon part={icon} x={tabWidth - closeWidth + 6} y={8} scale={2} />
          </>
        )}
      </span>
    );
  };
  const dragging = interactions.dragging;
  const isFloating = dragging?.floating === true;
  const visibleTabs = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => tab.id !== dragging?.value);
  const floatingTab =
    isFloating && dragging && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.floatingTab}
            aria-hidden="true"
            style={{
              left: dragging.x - dragging.offsetX,
              top: dragging.y - dragging.offsetY,
              width: tabWidth,
              height: faceHeight + bottomHeight,
              transformOrigin: "top left",
              transform: `scale(${dragging.scaleX}, ${dragging.scaleY})`,
            }}
          >
            {artwork(
              tabs.find((tab) => tab.id === dragging.value)!,
              0,
              true,
              true,
            )}
          </div>,
          document.body,
        )
      : null;
  return (
    <div
      {...props}
      ref={interactions.ref}
      className={`${styles.root} xse-tab-strip ${className}`}
      role="group"
      data-ui-tab-pane={paneId}
      style={
        {
          height: metrics.tabsHeight * UI_SCALE,
          "--ui-tab-control-height": `${faceHeight}px`,
          "--ui-menu-normal-face": style.colors.menuitem_normal_face,
          ...rootStyle,
        } as CSSProperties
      }
      aria-label={translateSource(ariaLabel)}
      onContextMenu={onContextMenu}
      onDoubleClick={composeEventHandlers((event) => {
        if (!(event.target as Element).closest('[role="tab"],button,[role="menu"]')) {
          event.preventDefault();
          onDoubleClickEmpty?.();
        }
      }, onDoubleClick)}
    >
      {leadingContent && (
        <span
          className={styles.leadingContent}
          style={{
            flex: `0 0 ${leadingContentWidth * UI_SCALE_X}px`,
            height: faceHeight + bottomHeight,
          }}
        >
          <UiPart
            part="tab_filler"
            scale={2}
            drawCenter
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: faceHeight,
              pointerEvents: "none",
            }}
          />
          <UiPart
            part="tab_bottom_normal"
            scale={2}
            drawCenter
            style={{
              position: "absolute",
              left: 0,
              top: faceHeight,
              width: "100%",
              // Keep the atlas minimum width from covering the first tab's corner.
              minWidth: 0,
              height: bottomHeight,
              pointerEvents: "none",
            }}
          />
          <span className={styles.leadingControl}>{leadingContent}</span>
        </span>
      )}
      {(denseUi || leadingContentWidth > 0 || trailingContentWidth > 0) && (
        <span
          aria-hidden="true"
          className={styles.scrollSpacer}
          style={{
            flex: `${trailingContent ? 1 : 0} 0 ${scrollContentWidth * UI_SCALE_X}px`,
            height: 1,
          }}
        />
      )}
      <div
        aria-hidden="true"
        className={styles.paintLayer}
        style={{
          width: `max(100%, ${paintWidth}px)`,
          height: faceHeight + bottomHeight,
          pointerEvents: "none",
        }}
      >
        <UiPart
          part="tab_filler"
          scale={2}
          drawCenter
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: faceHeight,
          }}
        />
        <UiPart
          part="tab_bottom_normal"
          scale={2}
          drawCenter
          style={{
            position: "absolute",
            left: 0,
            top: faceHeight,
            width: "100%",
            height: bottomHeight,
          }}
        />
        {visibleTabs.map(({ tab, index }, position) =>
          artwork(
            tab,
            leadingContentWidth + (isFloating ? position : index) * tabWidth,
            value === tab.id,
          ),
        )}
        {dragging &&
          !isFloating &&
          tabs.find((tab) => tab.id === dragging.value) &&
          artwork(
            tabs.find((tab) => tab.id === dragging.value)!,
            leadingContentWidth +
              dragging.originIndex * tabWidth +
              Math.round(dragging.delta / UI_SCALE_X),
            value === dragging.value,
          )}
      </div>
      {trailingContent}
      <div className={styles.tabList} role="tablist" aria-label={translateSource(tabListLabel)}>
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            {...interactions.getTabProps(tab.id)}
            role="tab"
            tabIndex={value === tab.id ? 0 : -1}
            aria-selected={value === tab.id}
            aria-label={tab.translateLabel ? translateSource(tab.label) : tab.label}
            aria-description={tab.modified ? translateKey("ui.unsaved.changes") : undefined}
            className={styles.tab}
            style={{
              left: Math.floor((leadingContentWidth + index * tabWidth) * UI_SCALE_X),
              width: Math.ceil(tabWidth * UI_SCALE_X),
              height: metrics.tabFaceHeight * UI_SCALE,
            }}
            onKeyDown={(event) => {
              interactions.getTabProps(tab.id).onKeyDown(event);
              if (event.defaultPrevented) return;
              if (event.key === "Delete" && tab.closable !== false && onClose) {
                event.preventDefault();
                onClose(tab.id);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onValueChange(tab.id);
              } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next =
                  (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                onValueChange(tabs[next].id);
                (
                  event.currentTarget.parentElement?.querySelectorAll("[role=tab]")[
                    next
                  ] as HTMLElement
                )?.focus();
              }
            }}
          >
            {tab.closable !== false && onClose && (
              <button
                className={styles.closeButton}
                aria-label={translateKey("ui.close.name").replace(
                  "{name}",
                  tab.translateLabel ? translateSource(tab.label) : tab.label,
                )}
                type="button"
                style={{
                  width: metrics.tabCloseWidth * UI_SCALE,
                  height: metrics.tabFaceHeight * UI_SCALE,
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                }}
                onPointerEnter={() => setHotClose(tab.id)}
                onPointerLeave={() => setHotClose(null)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setPressedClose(tab.id);
                }}
                onPointerMove={(event) => {
                  if (pressedClose !== tab.id) return;
                  const rect = clientRect(event.currentTarget);
                  setHotClose(
                    clientPoint(event).x >= rect.left &&
                      clientPoint(event).x < rect.right &&
                      clientPoint(event).y >= rect.top &&
                      clientPoint(event).y < rect.bottom
                      ? tab.id
                      : null,
                  );
                }}
                onPointerUp={(event) => {
                  if (event.button !== 0 || pressedClose !== tab.id) return;
                  event.stopPropagation();
                  const rect = clientRect(event.currentTarget);
                  const inside =
                    clientPoint(event).x >= rect.left &&
                    clientPoint(event).x < rect.right &&
                    clientPoint(event).y >= rect.top &&
                    clientPoint(event).y < rect.bottom;
                  setPressedClose(null);
                  setHotClose(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  if (inside) onClose(tab.id);
                }}
                onPointerCancel={() => {
                  setPressedClose(null);
                  setHotClose(null);
                }}
                onLostPointerCapture={() => setPressedClose(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) onClose(tab.id);
                }}
              />
            )}
          </div>
        ))}
      </div>
      {children}
      {floatingTab}
    </div>
  );
}

export type { TabDragPoint } from "$/components/tabs/use-tab-interactions";
