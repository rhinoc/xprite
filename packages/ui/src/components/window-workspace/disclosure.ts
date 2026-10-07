import { useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";

export interface WindowDisclosureProps {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
}
const INTERACTIVE_CAPTION_CONTENT = "button, a, input, select, textarea";

/** System 7.5 WindowShade: click activates, drag moves, double-click rolls up the titlebar. */
export function useWindowDisclosure({
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
}: WindowDisclosureProps) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
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
    if (!(event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)) event.preventDefault();
  };
  const doubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest(INTERACTIVE_CAPTION_CONTENT)) return;
    event.preventDefault();
    change(!current);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    change(!current);
  };
  return { collapsed: current, toggle, click, doubleClick, keyDown };
}
