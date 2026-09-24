import type { AtlasPartName } from "$/base/theme/theme-name-types";

export type UiAppearance = "light" | "dark";

export interface UiPartDefinition {
  id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  w1?: number;
  w2?: number;
  w3?: number;
  h1?: number;
  h2?: number;
  h3?: number;
  width: number;
  height: number;
  focusx?: number;
  focusy?: number;
  slices: number[] | null;
}

export interface UiStyleDefinition {
  provenance: {
    source: string;
    sha256: string;
    sheetSha256: string;
  };
  sheet: { width: number; height: number };
  dimensions: Record<string, number>;
  colors: Record<string, string>;
  parts: Record<AtlasPartName, UiPartDefinition>;
}
