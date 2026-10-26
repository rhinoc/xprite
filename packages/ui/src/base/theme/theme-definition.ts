import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiColorScheme, UiStyleDefinition } from "$/base/theme/theme-types";

export interface UiCursorArtwork {
  svg: string;
  width: number;
  height: number;
  hotspot: { x: number; y: number };
}

export type UiThemeTokens = Readonly<Partial<Record<`--${string}`, string>>>;

/** A complete skin; component behavior and application state stay outside this contract. */
export interface UiThemeArtwork {
  definition: UiStyleDefinition;
  sheetUrl: string;
  tokens?: UiThemeTokens;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

/** Pass a theme directly to UIProvider. No global registry or component branches are required. */
export interface UiTheme {
  readonly id: string;
  readonly label: string;
  readonly cursors: Readonly<Record<string, UiCursorArtwork>>;
  readonly typography: UiStyleDefinition["typography"];
  readonly load: (colorScheme: UiColorScheme) => Promise<UiThemeArtwork>;
  /** Declare and fetch Asian/CJK Fusion faces. Called only for Asian UI languages. */
  readonly loadCjkFonts?: () => Promise<void>;
}
