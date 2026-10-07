import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiAppearance, UiStyleDefinition } from "$/base/theme/theme-types";

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
  readonly load: (appearance: UiAppearance) => Promise<UiThemeArtwork>;
}
