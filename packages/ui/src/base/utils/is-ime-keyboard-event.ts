const IME_COMPOSITION_KEY_CODE = 229;

/** Some browsers clear isComposing before the key that accepts the candidate. */
export function isImeKeyboardEvent(event: Pick<KeyboardEvent, "isComposing" | "keyCode">) {
  return event.isComposing || event.keyCode === IME_COMPOSITION_KEY_CODE;
}
