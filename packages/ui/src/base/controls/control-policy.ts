export type ButtonInkRole =
  | "disabled"
  | "button_normal_text"
  | "button_hot_text"
  | "button_selected_text";

/** Source button/button-set ink selection independent of any editor state. */
export function buttonInkRole(state: {
  buttonSet: boolean;
  selected: boolean;
  hovered: boolean;
  pressed: boolean;
  disabled: boolean;
}): ButtonInkRole {
  if (state.disabled) return "disabled";
  if (state.pressed || (state.selected && !state.buttonSet)) return "button_selected_text";
  if (state.hovered || state.selected) return "button_hot_text";
  return "button_normal_text";
}

/** Split selection offsets using the browser's UTF-16 coordinate convention. */
export function entrySelection(text: string, start: number | null, end: number | null) {
  const clamp = (value: number | null) =>
    Math.max(0, Math.min(text.length, Number.isFinite(value) ? Math.trunc(value!) : 0));
  const a = clamp(start),
    b = clamp(end),
    from = Math.min(a, b),
    to = Math.max(a, b);
  return {
    before: text.slice(0, from),
    selected: text.slice(from, to),
    after: text.slice(to),
    from,
    to,
  };
}
