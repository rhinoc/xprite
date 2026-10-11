import "$/components/window/dialog-backdrop.module.css";

export * from "$/components/window/dialog";
export * from "$/components/window/alert-dialog";
export { focusDialogContainer, isDialogPopupTarget } from "$/components/window/focus";

export { FloatingLayer, FloatingLayerKind } from "$/components/window/floating-layer";
export type { FloatingLayerProps } from "$/components/window/floating-layer";
export {
  useOverlayInteraction,
  OverlayInteractionScope,
  OverlayDismissReason,
} from "$/components/window/interaction";
export type { OverlayInteractionOptions, OverlayOwner } from "$/components/window/interaction";
export { useWindowGesture } from "$/components/window/gesture";
export type { WindowGestureOptions } from "$/components/window/gesture";
export { WindowGestureEdge } from "$/components/window/gesture";
export { useModalFocus } from "$/components/window/focus";
export type { ModalFocusOptions } from "$/components/window/focus";
