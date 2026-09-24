import { cloneElement, type CSSProperties, type MouseEventHandler, type ReactElement } from "react";

import type {
  ContextMenuTargetContent,
  ContextMenuTargetProps,
} from "$/components/menu/context-menu-types";
import { Menu, MenuActivation, type MenuItem } from "$/components/menu/menu";
import type { LongPressActivation, PointerContact } from "$/components/menu/pointer-gestures";
import { useContextMenuTarget } from "$/components/menu/use-context-menu-target";

export interface ContextMenuProps {
  label: string;
  items: readonly MenuItem[];
  /** Reuse an existing target, or bind its handlers explicitly through a function child. */
  children: ContextMenuTargetContent;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  style?: CSSProperties;
  longPressTarget?: string | false;
  /** Open during the hold, or reserve hold-and-drag and open on stationary release. */
  longPressActivation?: LongPressActivation;
  touchDoubleClickTarget?: string;
  gestureScope?: unknown;
  /** Let the target's editing/resize gesture take precedence over a stationary hold. */
  canOpenTouchMenu?: (input: PointerContact, target: Element) => boolean;
}

function ContextMenuTarget({
  children,
  ...options
}: Pick<
  ContextMenuProps,
  | "children"
  | "onContextMenu"
  | "style"
  | "longPressTarget"
  | "longPressActivation"
  | "touchDoubleClickTarget"
  | "gestureScope"
  | "canOpenTouchMenu"
> & {
  open?: MouseEventHandler<HTMLElement>;
}) {
  const getTargetProps = useContextMenuTarget(options);
  return typeof children === "function"
    ? children(getTargetProps)
    : cloneElement(
        children as ReactElement<ContextMenuTargetProps>,
        getTargetProps(children.props),
      );
}

/** Context behavior and popup tree add no target wrapper. Existing target refs are preserved. */
export function ContextMenu({ label, items, children, ...options }: ContextMenuProps) {
  return (
    <Menu<HTMLElement>
      label={label}
      items={items}
      activation={MenuActivation.ContextMenu}
      renderTrigger={({ onContextMenu: open }) => (
        <ContextMenuTarget {...options} open={open}>
          {children}
        </ContextMenuTarget>
      )}
    />
  );
}
