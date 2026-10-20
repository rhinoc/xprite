/**
 * Returns a keyboard event key name, or "" when the platform omitted it.
 *
 * `KeyboardEvent.key` is typed as a string, but Safari autofill, IME and some
 * synthetic events deliver keydown/keyup events whose key is undefined.
 */
export function keyboardKey(key: string | null | undefined): string {
  return typeof key === "string" ? key : "";
}
