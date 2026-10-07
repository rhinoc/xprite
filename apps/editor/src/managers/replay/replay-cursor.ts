import type { ReplayCursorAppearance } from "$/managers/ports/replay";

const MAX_CURSOR_SIDE = 256;
const MAX_CURSOR_SOURCE_LENGTH = 32 * 1024;

export function validReplayCursor(value: unknown): value is ReplayCursorAppearance | null {
  if (value === null) return true;
  const cursor = value as ReplayCursorAppearance | undefined;
  return (
    !!cursor &&
    typeof cursor.source === "string" &&
    cursor.source.length <= MAX_CURSOR_SOURCE_LENGTH &&
    /^(data:image\/png;base64,|data:image\/svg\+xml,)/.test(cursor.source) &&
    [cursor.width, cursor.height].every(
      (size) => Number.isSafeInteger(size) && size > 0 && size <= MAX_CURSOR_SIDE,
    ) &&
    !!cursor.hotspot &&
    [cursor.hotspot.x, cursor.hotspot.y].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= MAX_CURSOR_SIDE,
    )
  );
}
