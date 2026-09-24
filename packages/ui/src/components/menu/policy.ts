/** Aseprite ui/menu.cpp choose_side, in physical GUI pixels (scale 2). */
export interface MenuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)));
export function placeSubmenu(
  parent: MenuRect,
  rowTop: number,
  size: { width: number; height: number },
  workarea: { width: number; height: number },
): MenuRect {
  const y = clamp(rowTop - 6, workarea.height - size.height);
  const left = clamp(parent.x - size.width + 2, workarea.width - size.width);
  const right = clamp(parent.x + parent.width - 2, workarea.width - size.width);
  const overlap = (x: number) =>
    Math.max(0, Math.min(x + size.width, parent.x + parent.width) - Math.max(x, parent.x)) *
    Math.max(0, Math.min(y + size.height, parent.y + parent.height) - Math.max(y, parent.y));
  return { x: overlap(right) <= overlap(left) ? right : left, y, ...size };
}
export function menuMnemonicIndex(item: {
  label: string;
  mnemonic?: string;
  mnemonicIndex?: number;
}) {
  // Widget stores the mnemonic character, not its markup position.
  // Theme::drawMnemonicUnderline finds its first case-insensitive occurrence.
  const chars = [...item.label];
  const mnemonic =
    item.mnemonic ?? (item.mnemonicIndex === undefined ? undefined : chars[item.mnemonicIndex]);
  return mnemonic ? chars.findIndex((char) => char.toLowerCase() === mnemonic.toLowerCase()) : -1;
}
export function menuMnemonicMatch(
  items: readonly {
    label: string;
    mnemonic?: string;
    mnemonicIndex?: number;
    disabled?: boolean;
  }[],
  key: string,
) {
  return items.findIndex(
    (item) =>
      !item.disabled &&
      [...item.label][menuMnemonicIndex(item)]?.toLowerCase() === key.toLowerCase(),
  );
}
export const SUBMENU_OPEN_DELAY_MS = 250;
