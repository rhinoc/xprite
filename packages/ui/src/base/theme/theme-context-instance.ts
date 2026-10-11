import { createContext } from "react";

import type { UiTheme, UiThemeTokens } from "$/base/theme/theme-definition";
import type { UiColorScheme, UiStyleDefinition } from "$/base/theme/theme-types";

export interface ThemeContextValue {
  colorScheme: UiColorScheme;
  uiTheme: UiTheme;
  tokens: UiThemeTokens;
  definition: UiStyleDefinition;
  sheetUrl: string;
  language: string;
  translateKey: (key: string) => string;
  translateSource: (source: string) => string;
}

// Keep context identity stable when providers and hooks are hot updated independently.
export const ThemeContext = createContext<ThemeContextValue | null>(null);
