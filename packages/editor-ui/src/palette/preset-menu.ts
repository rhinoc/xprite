import { PalettePresetKind, type PaletteBrowserChoice } from "$/palette/model";
import type { Rgba } from "@xprite/editor-core/base";

/** Id of the opt-in "Automatic" item that hands the colours back to the host. */
export const AUTOMATIC_PALETTE_ID = "automatic";

function samePalette(a: readonly Rgba[], b: readonly Rgba[]) {
  return (
    a.length === b.length &&
    a.every((color, index) => color.every((channel, i) => channel === b[index][i]))
  );
}

/**
 * The menu rows matching the search, with Automatic first when the host offers it. Automatic's
 * strip is the palette it currently gives; with none known yet the row has no strip.
 */
export function presetMenuChoices(
  choices: readonly PaletteBrowserChoice[],
  search: string,
  automatic?: { label: string; colors?: readonly Rgba[] },
): PaletteBrowserChoice[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const all: PaletteBrowserChoice[] =
    automatic === undefined
      ? [...choices]
      : [
          {
            id: AUTOMATIC_PALETTE_ID,
            name: automatic.label,
            group: "",
            author: null,
            colors: automatic.colors ?? [],
            source: PalettePresetKind.Builtin,
          },
          ...choices,
        ];
  return all.filter((choice) => {
    const text = `${choice.name} ${choice.group} ${choice.author ?? ""}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/**
 * Whether a row carries the check mark: Automatic while it is active, otherwise the preset whose
 * colours are the active palette (never both).
 */
export function presetMenuChecked(
  choice: PaletteBrowserChoice,
  activePalette: readonly Rgba[],
  automaticActive = false,
): boolean {
  return choice.id === AUTOMATIC_PALETTE_ID
    ? automaticActive
    : !automaticActive && samePalette(choice.colors, activePalette);
}
