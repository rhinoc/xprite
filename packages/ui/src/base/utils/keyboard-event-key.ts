/**
 * Returns the event's key name, or "" when the browser omitted it.
 *
 * `KeyboardEvent.key` is typed as a string, but Safari autofill, IME and some
 * synthetic events deliver keydown/keyup events whose key is undefined.
 */
export function keyboardEventKey(event: { readonly key?: string | null }): string {
  return typeof event.key === "string" ? event.key : "";
}
