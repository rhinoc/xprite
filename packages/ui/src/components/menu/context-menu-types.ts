import type { HTMLAttributes, ReactElement } from "react";

export type ContextMenuTargetProps = Pick<
  HTMLAttributes<HTMLElement>,
  | "style"
  | "onPointerDownCapture"
  | "onPointerMoveCapture"
  | "onPointerUp"
  | "onPointerCancel"
  | "onDoubleClick"
  | "onKeyDown"
  | "onContextMenu"
>;

/** Capture handlers run before the target's handlers; bubbling handlers run after them. */
export type ContextMenuTargetPropsGetter = <Props extends object = ContextMenuTargetProps>(
  props?: Props & ContextMenuTargetProps,
) => Omit<Props, keyof ContextMenuTargetProps> & ContextMenuTargetProps;

/** Custom targets must forward these handlers to their existing DOM root. */
export type ContextMenuTargetContent =
  | ReactElement
  | ((getTargetProps: ContextMenuTargetPropsGetter) => ReactElement);
