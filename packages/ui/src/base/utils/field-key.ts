const fieldKeys = new WeakSet<object>();

/**
 * A text field marks the Enter/Escape it used to commit or revert its draft. The key still
 * belongs to the window: Enter fires its default button and Escape closes it, as in Aseprite.
 */
export function markFieldKey(event: object) {
  fieldKeys.add(event);
}

export function isFieldKey(event: object) {
  return fieldKeys.has(event);
}

/** A key the field only edited with, so the owning window may still act on it. */
export function isUnclaimedKey(event: { defaultPrevented: boolean }) {
  return !event.defaultPrevented || isFieldKey(event);
}
