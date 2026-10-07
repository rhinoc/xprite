import { useRef, useState, type HTMLAttributes, type ReactNode, type PointerEvent } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { clientDeltaToLocal, clientPoint, borderSize } from "$/base/utils/dom-geometry";
import { PointerDragActivation } from "$/base/utils/pointer-drag-activation";
import {
  surfaceAttributes,
  surfaceStyle,
  type SurfaceContentProps,
} from "$/components/surface/content";

import "$/components/note/note.module.css";

const MIN_WIDTH = 80;
const MIN_HEIGHT = 47;
const COLLAPSED_HEIGHT = 11;
const RESIZE_KEY_STEP = 1;
const DEFAULT_DISMISS_LABEL = "Close note";
const DEFAULT_COLLAPSE_LABEL = "Collapse note";
const DEFAULT_EXPAND_LABEL = "Expand note";
const DEFAULT_RESIZE_LABEL = "Resize note";

export enum NoteVariant {
  Plain = "plain",
  Window = "window",
}
export enum NoteDismissBehavior {
  Remove = "remove",
  Collapse = "collapse",
}

export enum NoteColor {
  Yellow = "yellow",
  Cyan = "cyan",
  Green = "green",
  Pink = "pink",
  Lilac = "lilac",
  Gray = "gray",
  White = "white",
}
export interface NoteProps extends Omit<HTMLAttributes<HTMLElement>, "color" | "title"> {
  color?: NoteColor;
  variant?: NoteVariant;
  children?: ReactNode;
  contentPadding?: SurfaceContentProps["contentPadding"];
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
  title?: ReactNode;
  dismissBehavior?: NoteDismissBehavior;
  onDismiss?(): void;
  dismissLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  resizeLabel?: string;
}

/** Figma Misc / Notes geometry at its native 126×47 CSS size. */
export function Note({
  color = NoteColor.Yellow,
  variant = NoteVariant.Plain,
  children,
  contentPadding,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  title,
  dismissBehavior = NoteDismissBehavior.Remove,
  onDismiss,
  dismissLabel,
  collapseLabel = DEFAULT_COLLAPSE_LABEL,
  expandLabel = DEFAULT_EXPAND_LABEL,
  resizeLabel = DEFAULT_RESIZE_LABEL,
  style,
  ...props
}: NoteProps) {
  const { translateSource } = useTheme();
  const name = typeof title === "string" ? title : translateSource("note");
  const closeLabel =
    dismissLabel !== undefined
      ? translateSource(dismissLabel)
      : dismissBehavior === NoteDismissBehavior.Collapse
        ? translateSource("Hide {name}").replace("{name}", name)
        : translateSource(DEFAULT_DISMISS_LABEL);
  const root = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };
  const [size, setSize] = useState<{ width: number; height: number }>();
  const gesture = useRef<{
    pointerId: number;
    activation: PointerDragActivation;
    start: { x: number; y: number };
    original: { width: number; height: number };
    previous: typeof size;
  }>();
  const resizeStart = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !root.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      activation: new PointerDragActivation(event),
      start: clientPoint(event),
      original: borderSize(root.current),
      previous: size,
    };
  };
  const resizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = gesture.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !root.current ||
      !drag.activation.update(event)
    )
      return;
    const point = clientPoint(event);
    const delta = clientDeltaToLocal(root.current, {
      x: point.x - drag.start.x,
      y: point.y - drag.start.y,
    });
    setSize({
      width: Math.max(MIN_WIDTH, Math.round(drag.original.width + delta.x)),
      height: Math.max(MIN_HEIGHT, Math.round(drag.original.height + delta.y)),
    });
  };
  const resizeEnd = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (cancel) setSize(drag.previous);
    gesture.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  if (dismissed) return null;
  return (
    <aside
      aria-label={dismissBehavior === NoteDismissBehavior.Collapse ? name : undefined}
      {...props}
      ref={root}
      data-ui-desktop-window
      data-ui-note={variant}
      {...surfaceAttributes({ contentPadding })}
      data-ui-note-color={color}
      data-note-collapsed={collapsed || undefined}
      style={{
        ...surfaceStyle({ contentPadding }, style),
        ...size,
        ...(collapsed ? { height: COLLAPSED_HEIGHT, minHeight: COLLAPSED_HEIGHT } : {}),
      }}
    >
      {variant === NoteVariant.Window && (
        <div data-slot="note-header">
          <button
            type="button"
            data-ui-note-close
            aria-label={closeLabel}
            onClick={() => {
              if (onDismiss) onDismiss();
              else if (dismissBehavior === NoteDismissBehavior.Collapse) setCollapsed(true);
              else setDismissed(true);
            }}
          >
            <svg width="7" height="7" viewBox="41 69 7 7" aria-hidden="true">
              <path fill="var(--ui-note-paper)" d="M41 69h7v7h-7z" />
              <path
                fill="var(--ui-note-control)"
                d="M48 69H47V75H41V76H48V69ZM42 70V74H43V71H46V70H42Z"
              />
            </svg>
          </button>
          {collapsed && title && <span data-slot="note-collapsed-title">{title}</span>}
          <button
            type="button"
            data-ui-note-collapse
            aria-label={translateSource(collapsed ? expandLabel : collapseLabel)}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg width="7" height="7" viewBox="150 69 7 7" aria-hidden="true">
              <path
                fill="var(--ui-note-paper)"
                d="M156 69H154V70H153V71H152V72H151V73H150V75H156V69Z"
              />
              <path
                fill="var(--ui-note-control)"
                d="M157 69H156V75H150V76H157V69ZM155 71H154V70H155V71ZM153 72V71H154V72H153ZM152 73H153V72H152V73ZM152 73V74H151V73H152Z"
              />
            </svg>
          </button>
        </div>
      )}
      <div data-slot="note-content" data-ui-surface-content hidden={collapsed}>
        {children}
      </div>
      {variant === NoteVariant.Window && !collapsed && (
        <button
          type="button"
          data-ui-note-resize
          aria-label={translateSource(resizeLabel)}
          onPointerDown={resizeStart}
          onPointerMove={resizeMove}
          onPointerUp={(e) => resizeEnd(e)}
          onPointerCancel={(e) => resizeEnd(e, true)}
          onKeyDown={(event) => {
            if (
              !root.current ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
            )
              return;
            event.preventDefault();
            const current = borderSize(root.current);
            setSize({
              width: Math.max(
                MIN_WIDTH,
                current.width +
                  (event.key === "ArrowLeft"
                    ? -RESIZE_KEY_STEP
                    : event.key === "ArrowRight"
                      ? RESIZE_KEY_STEP
                      : 0),
              ),
              height: Math.max(
                MIN_HEIGHT,
                current.height +
                  (event.key === "ArrowUp"
                    ? -RESIZE_KEY_STEP
                    : event.key === "ArrowDown"
                      ? RESIZE_KEY_STEP
                      : 0),
              ),
            });
          }}
        >
          <svg width="8" height="8" viewBox="154 106 8 8" aria-hidden="true">
            <path
              fill="var(--ui-note-control)"
              fillRule="evenodd"
              d="M162 106H158V110H154V114H162V106ZM155 111V113H161V107H159V111H155Z"
            />
            <path fill="var(--ui-note-paper)" d="M161 107H159V111H155V113H161V107Z" />
          </svg>
        </button>
      )}
    </aside>
  );
}
