import type { PixelationPort } from "$/managers/ports/pixelation";
import {
  readStoredPalettePresets,
  comparePaletteResourceNames,
  EDITOR_PALETTE_PRESETS_KEY,
} from "@xprite/editor-core/import-export";
import { readBundledPalettePresets } from "@xprite/editor-ui/palette-presets";
import { PalettePresetKind } from "@xprite/editor-ui/palette/model";

/** Bundled palettes plus the editor's saved presets, read through the host's key-value storage. */
export function readPixelationPalettes(
  getItem: (key: string) => string | null,
): ReturnType<PixelationPort["paletteResources"]> {
  const bundled = readBundledPalettePresets();
  const saved = readStoredPalettePresets(getItem(EDITOR_PALETTE_PRESETS_KEY));
  return {
    choices: [
      ...bundled.map((preset) => ({
        ...preset,
        id: `builtin:${preset.id}`,
        source: PalettePresetKind.Builtin,
      })),
      ...saved.map((preset) => ({
        ...preset,
        id: `saved:${preset.name.toLocaleLowerCase()}`,
        group: "Saved Presets",
        author: null,
        source: PalettePresetKind.Saved,
      })),
    ].sort((a, b) => comparePaletteResourceNames(a.name, b.name)),
  };
}
