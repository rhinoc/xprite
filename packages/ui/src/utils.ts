export { cn } from "$/base/utils/cn";
export { useElementSize } from "$/base/utils/use-element-size";
export { usePointerGesture, type PointerGestureCallbacks } from "$/base/utils/use-pointer-gesture";
export {
  connectWindowWorkspace,
  suspendDesktopWindowChrome,
  resumeDesktopWindowChrome,
} from "$/base/utils/window-workspace";
export * from "$/base/utils/dom-geometry";
export { installPageFragmentContainment, scrollFragmentTarget } from "$/base/utils/page-fragment";
export { formatShortcutForPlatform } from "$/base/utils/format-shortcut";
export { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
export { usesNativeTextEditing } from "$/base/utils/native-text-input";
export { PointerDragActivation, PointerDragAxis } from "$/base/utils/pointer-drag-activation";
export {
  PointerResizeGesture,
  type PointerResizeGestureOptions,
} from "$/base/utils/pointer-resize-gesture";

export {
  connectStylusTouchDefaults,
  stylusPointerInputProps,
  StylusInputMode,
} from "$/base/utils/stylus-input";

export { dropdownArrowOffsetY } from "$/components/combobox/arrow-position";
