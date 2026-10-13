const fieldKeys = new WeakSet<object>();

/**
 * A text field marks the Enter/Escape it used to commit or revert its draft. The key still
 * belongs to the window: Enter fires its default button and Escape closes it, as in Aseprite.
 */
export function markFieldKey(event: object) {
  fieldKeys.add(event);
}

function isFieldKey(event: object) {
  return fieldKeys.has(event);
}

/** A key the field only edited with, so the owning window may still act on it. */
export function isUnclaimedKey(event: { defaultPrevented: boolean }) {
  return !event.defaultPrevented || isFieldKey(event);
}

/** Controls whose own Enter activation must win over the window default. */
const ENTER_OWNER_SELECTOR =
  'button,a[href],textarea,select,[role="button"],[role="menuitem"],[role="option"],[aria-expanded="true"],[contenteditable="true"],[contenteditable="plaintext-only"]';

interface DefaultActionKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Plain Enter (main or keypad) not consumed by a button-like control under focus. */
export function triggersDefaultAction(
  event: DefaultActionKey,
  target: { matches(selector: string): boolean } | null,
) {
  return (
    event.key === "Enter" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !target?.matches(ENTER_OWNER_SELECTOR)
  );
}
