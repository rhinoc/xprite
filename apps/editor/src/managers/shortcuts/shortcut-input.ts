import type { ShortcutInput } from "@xprite/editor-core";

const MODIFIER_ORDER = ["Ctrl", "Cmd", "Alt", "Shift", "Space"] as const;
const MODIFIERS = new Set<string>(MODIFIER_ORDER);
const KEY_ALIASES: Readonly<Record<string, string>> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  cmd: "Cmd",
  meta: "Cmd",
  super: "Cmd",
  win: "Cmd",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  shift: "Shift",
  space: "Space",
  esc: "Escape",
  escape: "Escape",
  del: "Delete",
  delete: "Delete",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  return: "Enter",
  enter: "Enter",
  pgup: "PageUp",
  pgdn: "PageDown",
};

export function normalizeShortcut(
  source: string,
  modifiersOnly = false,
  allowKey = false,
): string | null {
  if (source.length > 100) return null;
  if (source.trim().toLowerCase() === "default") return modifiersOnly ? "" : null;
  const plusKey = source.endsWith("+");
  const tokens = source
    .split("+")
    .filter(Boolean)
    .map((value) => value.trim());
  if (plusKey) tokens.push("+");
  const modifiers = new Set<string>();
  let key = "";
  for (const token of tokens) {
    const canonical =
      KEY_ALIASES[token.toLowerCase()] ?? (token.length === 1 ? token.toUpperCase() : token);
    if (
      MODIFIERS.has(canonical) &&
      !(canonical === "Space" && tokens.length === 1 && !modifiersOnly)
    )
      modifiers.add(canonical);
    else if (key) return null;
    else key = canonical;
  }
  if (modifiersOnly && key && !allowKey) return null;
  if (!modifiersOnly && !key) return null;
  return [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    ...(key ? [key] : []),
  ].join("+");
}

export function shortcutToInput(shortcut: string, modifiersOnly = false): ShortcutInput {
  const tokens = shortcut.split("+").filter(Boolean);
  let key =
    tokens.find((token) => !MODIFIERS.has(token)) ??
    (!modifiersOnly && shortcut === "Space" ? " " : "");
  if (shortcut.endsWith("+")) key = "+";
  return {
    key: key === "Space" ? " " : key,
    ctrl: tokens.includes("Ctrl"),
    meta: tokens.includes("Cmd"),
    alt: tokens.includes("Alt"),
    shift: tokens.includes("Shift"),
    space: tokens.includes("Space") && key !== " ",
  };
}

export function inputToShortcut(
  input: ShortcutInput,
  modifiersOnly = false,
  allowKey = false,
): string {
  const key = input.key === " " ? "Space" : input.key;
  return (
    normalizeShortcut(
      [
        input.ctrl ? "Ctrl" : "",
        input.meta ? "Cmd" : "",
        input.alt ? "Alt" : "",
        input.shift ? "Shift" : "",
        input.space && key !== "Space" ? "Space" : "",
        (modifiersOnly && !allowKey) || ["Control", "Meta", "Alt", "Shift"].includes(key)
          ? ""
          : key,
      ]
        .filter(Boolean)
        .join("+"),
      modifiersOnly,
      allowKey,
    ) ?? ""
  );
}

export function shortcutMatches(
  shortcut: string,
  input: ShortcutInput,
  modifiersOnly = false,
  subset = false,
): boolean {
  const expected = shortcutToInput(shortcut, modifiersOnly);
  if (modifiersOnly && shortcut === "Space") {
    expected.key = "";
    expected.space = true;
  }
  if (subset) {
    return (
      (!expected.ctrl || !!input.ctrl) &&
      (!expected.meta || !!input.meta) &&
      (!expected.alt || !!input.alt) &&
      (!expected.shift || !!input.shift) &&
      (!expected.space || !!input.space)
    );
  }
  return (
    (modifiersOnly || expected.key.toLowerCase() === input.key.toLowerCase()) &&
    !!expected.ctrl === !!input.ctrl &&
    !!expected.meta === !!input.meta &&
    !!expected.alt === !!input.alt &&
    !!expected.shift === !!input.shift &&
    (!!expected.space === !!input.space || (!expected.space && input.key === " "))
  );
}
