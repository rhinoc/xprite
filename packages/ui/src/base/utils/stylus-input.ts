const STYLUS_INPUT_ATTRIBUTE = "data-ui-stylus-input";

export enum StylusInputMode {
  Pointer = "pointer",
  Native = "native",
}

enum NativeTouchType {
  Stylus = "stylus",
}

enum NativeActivationTag {
  Button = "BUTTON",
  Link = "A",
  Input = "INPUT",
  Textarea = "TEXTAREA",
  Select = "SELECT",
  Summary = "SUMMARY",
  Label = "LABEL",
}

enum NativeActivationRole {
  Button = "button",
  Link = "link",
  MenuItem = "menuitem",
  Option = "option",
  Tab = "tab",
}

const NATIVE_ACTIVATION_TAGS = new Set<string>(Object.values(NativeActivationTag));
const NATIVE_ACTIVATION_ROLES = new Set<string>(Object.values(NativeActivationRole));

type NativeStylusTouch = Touch & { readonly touchType?: string };

/** Opt in only where pointer handlers perform the action, including its release. */
export function stylusPointerInputProps(enabled = true) {
  return {
    "data-ui-stylus-input": enabled ? StylusInputMode.Pointer : StylusInputMode.Native,
  } as const;
}

/** A non-passive native listener is needed; React's touch listeners are passive.
 * Prevent only stylus defaults, retaining the existing pointer drawing/gesture path.
 */
export function connectStylusTouchDefaults(
  target: HTMLElement | Document,
  shouldPreventDefault: (event: TouchEvent) => boolean,
  onPrevented?: (event: TouchEvent, touches: readonly Touch[]) => void,
): () => void {
  const start = (nativeEvent: Event) => {
    const event = nativeEvent as TouchEvent;
    if (!event.cancelable) return;
    const touches = Array.from(event.changedTouches).filter(
      (touch) => (touch as NativeStylusTouch).touchType === NativeTouchType.Stylus,
    );
    if (!touches.length || !shouldPreventDefault(event)) return;
    event.preventDefault();
    onPrevented?.(event, touches);
  };
  target.addEventListener("touchstart", start, { passive: false, capture: true });
  return () => target.removeEventListener("touchstart", start, true);
}

/** Document delegation also covers portal controls. Unmarked native activations
 * and editable descendants stop ownership lookup, so enclosing drag surfaces
 * do not disable clicks, text selection, IME or Pencil Scribble.
 */
export function stylusPointerOwner(event: Event): Element | null {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true") return null;
    const mode = node.getAttribute(STYLUS_INPUT_ATTRIBUTE);
    if (mode === StylusInputMode.Native) return null;
    if (mode === StylusInputMode.Pointer) return node;
    const editable = node.getAttribute("contenteditable");
    if (
      (editable !== null && editable !== "false") ||
      NATIVE_ACTIVATION_TAGS.has(node.tagName) ||
      NATIVE_ACTIVATION_ROLES.has(node.getAttribute("role") ?? "")
    )
      return null;
  }
  return null;
}
