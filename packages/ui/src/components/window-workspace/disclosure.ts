import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

export interface WindowDisclosureProps {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
}
const INTERACTIVE_CAPTION_CONTENT = "button, a, input, select, textarea, [contenteditable]";
/** Two touch taps on a title bar within this window (ms) roll the window up or down. */
export const DOUBLE_TAP_INTERVAL = 350;
const DOUBLE_TAP_DISTANCE = 24;

/** System 7.5 WindowShade: click activates, drag moves, double-click rolls up the titlebar. */
export function useWindowDisclosure({
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
}: WindowDisclosureProps) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const lastTap = useRef<{ at: number; x: number; y: number }>();
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
    // A touch double tap already toggled in pointerUp; ignore the synthesized dblclick.
    if (event.timeStamp - touchToggledAt.current < DOUBLE_TAP_INTERVAL * 2) {
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
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    if (
      event.pointerType !== "touch" ||
      !event.currentTarget.contains(event.target as Node) ||
      (event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)
    )
      return;
    const previous = lastTap.current;
    const tap = { at: event.timeStamp, x: event.clientX, y: event.clientY };
    if (
      previous &&
      tap.at - previous.at <= DOUBLE_TAP_INTERVAL &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_DISTANCE
    ) {
      lastTap.current = undefined;
      touchToggledAt.current = tap.at;
      event.preventDefault();
      change(!current);
      return;
    }
    lastTap.current = tap;
  };
  return { collapsed: current, change, toggle, click, doubleClick, keyDown, pointerUp };
}
