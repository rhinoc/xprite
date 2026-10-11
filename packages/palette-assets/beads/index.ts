import records from "./records.json";
interface BeadColor {
  readonly code: string;
  readonly name: string;
  readonly rgb: readonly [number, number, number];
}

export enum BeadBrand {
  Mard = "mard",
  Artkal = "artkal",
  Perler = "perler",
  Hama = "hama",
}

export interface BeadPalette {
  id: BeadBrand;
  name: string;
  file: string;
  colors: readonly BeadColor[];
}

/** Canonical code/name/RGB records also supply the editor's ordinary color presets. */
export const BEAD_PALETTES: readonly BeadPalette[] = records.map((palette) => ({
  ...palette,
  id: palette.id as BeadBrand,
  colors: palette.colors.map((color) => ({ ...color, rgb: color.rgb as [number, number, number] })),
}));
