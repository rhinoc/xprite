import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

import { clientPoint } from "$/base/utils/dom-geometry";

export interface WindowDisclosureProps {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
}
const INTERACTIVE_CAPTION_CONTENT = "button, a, input, select, textarea, [contenteditable]";
/** After a touch toggle, ignore the browser's synthesized double-click for this long (ms). */
const TOUCH_DOUBLE_CLICK_GUARD = 700;
/** A touch that travels further than this (px) is a drag or scroll, not a tap. */
const TAP_DISTANCE = 12;

/**
 * System 7.5 WindowShade: click activates, drag moves, double-click rolls up the titlebar; on touch
 * a single tap on the titlebar rolls it.
 */
export function useWindowDisclosure({
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
}: WindowDisclosureProps) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const touchStart = useRef<{ id: number; x: number; y: number }>();
  const touchToggledAt = useRef(Number.NEGATIVE_INFINITY);
  const current = collapsed ?? localCollapsed;
  const change = (next: boolean) => {
    if (collapsed === undefined) setLocalCollapsed(next);
    onCollapsedChange?.(next);
  };
  const toggle = (event: SyntheticEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || collapsed !== undefined) return;
    const next = !(event.currentTarget as HTMLDetailsElement).open;
    if (next !== current) change(next);
  };
  const click = (event: MouseEvent<HTMLElement>) => {
    if (
      event.currentTarget.contains(event.target as Node) &&
      !(event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)
    )
      event.preventDefault();
  };
  const doubleClick = (event: MouseEvent<HTMLElement>) => {
    // A touch tap already toggled in pointerUp; ignore the synthesized dblclick.
    if (event.timeStamp - touchToggledAt.current < TOUCH_DOUBLE_CLICK_GUARD) {
      event.preventDefault();
      return;
    }
    if (
      !event.currentTarget.contains(event.target as Node) ||
      (event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)
    )
      return;
    event.preventDefault();
    change(!current);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    change(!current);
  };
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    touchStart.current =
      event.pointerType === "touch" ? { id: event.pointerId, ...clientPoint(event) } : undefined;
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = undefined;
    if (
      event.pointerType !== "touch" ||
      (start &&
        (start.id !== event.pointerId ||
          Math.hypot(clientPoint(event).x - start.x, clientPoint(event).y - start.y) >
            TAP_DISTANCE)) ||
      !event.currentTarget.contains(event.target as Node) ||
      (event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)
    )
      return;
    // A finger has no double-click to discover: one tap on the title bar rolls the window up or
    // down, so a collapsed window (such as the compact Adjust bar) opens from its title.
    touchToggledAt.current = event.timeStamp;
    event.preventDefault();
    change(!current);
  };
  return {
    collapsed: current,
    change,
    toggle,
    click,
    doubleClick,
    keyDown,
    pointerDown,
    pointerUp,
  };
}
