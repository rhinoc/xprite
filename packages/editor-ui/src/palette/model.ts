import type { Rgba } from "@xprite/editor-core/base";
export enum PalettePresetKind {
  Builtin = "builtin",
  Saved = "saved",
}
export interface PaletteBrowserChoice {
  id: string;
  name: string;
  group: string;
  author: string | null;
  colors: readonly Rgba[];
  source: PalettePresetKind;
}
export type PaletteTranslate = (source: string, values?: Record<string, string | number>) => string;
