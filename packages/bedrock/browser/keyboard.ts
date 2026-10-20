export interface KeyboardStroke {
  key: string;
  code: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  repeat: boolean;
}

// Safari autofill, IME and synthetic events can omit `key`/`code` despite the DOM typing.
const presentString = (value: string | undefined): string =>
  typeof value === "string" ? value : "";

/** Removes DOM event identity while preserving the browser's key semantics. */
export function normalizeKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "repeat"
  >,
): KeyboardStroke {
  return {
    key: presentString(event.key),
    code: presentString(event.code),
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
    repeat: event.repeat,
  };
}
