import type { Rgba } from "$/base/primitives";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";

/** Keep source indices as well as colors, including holes in a palette selection. */
export interface PaletteClipboard {
  colors: readonly Rgba[];
  selected: readonly number[];
}

export function selectedPaletteEntries(selected: readonly number[], size: number): number[] {
  return [
    ...new Set(selected.filter((index) => Number.isInteger(index) && index >= 0 && index < size)),
  ].sort((left, right) => left - right);
}

export function clonePaletteClipboard(value: PaletteClipboard): PaletteClipboard {
  return {
    colors: value.colors.map((color) => [...color] as Rgba),
    selected: selectedPaletteEntries(value.selected, value.colors.length),
  };
}

/** Check capacity without cloning colors or expanding the destination range. */
export function canPastePaletteEntries(
  paletteSize: number,
  selected: readonly number[],
  sourceCount: number,
): boolean {
  if (!Number.isInteger(sourceCount) || sourceCount < 1) return false;
  const destinations = new Set<number>();
  let last = -1;
  for (const index of selected) {
    if (!Number.isInteger(index) || index < 0 || index >= paletteSize) continue;
    destinations.add(index);
    last = Math.max(last, index);
  }
  return (
    destinations.size > 0 &&
    last + Math.max(0, sourceCount - destinations.size) < MAX_PALETTE_COLORS
  );
}

export function palettePasteDestinations(
  paletteSize: number,
  selected: readonly number[],
  sourceCount: number,
): number[] | null {
  if (!canPastePaletteEntries(paletteSize, selected, sourceCount)) return null;
  const destinations = selectedPaletteEntries(selected, paletteSize);
  let nextIndex = destinations[destinations.length - 1] + 1;
  while (destinations.length < sourceCount) destinations.push(nextIndex++);
  return destinations.slice(0, sourceCount);
}

/** Overwrite destination picks in order, then extend beyond the last pick as needed. */
export function pastePaletteEntries(
  colors: readonly Rgba[],
  selected: readonly number[],
  clipboard: PaletteClipboard,
): readonly Rgba[] | null {
  const source = selectedPaletteEntries(clipboard.selected, clipboard.colors.length);
  const destinations = palettePasteDestinations(colors.length, selected, source.length);
  if (!destinations) return null;
  const result = colors.map((color) => [...color] as Rgba);
  source.forEach((index, offset) => {
    result[destinations[offset]] = [...clipboard.colors[index]] as Rgba;
  });
  return result;
}
