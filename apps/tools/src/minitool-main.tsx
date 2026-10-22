import "$/adapters/minitool/runtime-compat";
import "$/adapters/minitool/minitool-page.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { detectFlexGap, mirrorCompactLayout } from "$/adapters/minitool/runtime-compat";
import { forwardFieldTaps } from "$/adapters/minitool/touch-targets";
import { installWindowInsets } from "$/adapters/minitool/window-insets";
import { loadMiniToolPreferences, miniToolPreferences } from "$/adapters/minitool/xhs-bridge";
import { createMiniToolPixelationApplication } from "$/MiniToolPixelationApp";
import { ToolApplicationRoot } from "$/tool-application-root";
import { EDITOR_PALETTE_PRESETS_KEY } from "@xprite/editor-core/import-export";
import { publicLanguage, PublicLanguage } from "@xprite/growth-content/language";
import { macintoshTheme, UiColorScheme } from "@xprite/ui";
import { loadUiThemeSnapshot, preloadUiAssets } from "@xprite/ui/assets";

const ROOT_ID = "pixelation-root";
const LANGUAGE_KEY = "xprite-minitool-language";

/** Popup menu and select rows at finger height; the desktop theme draws 16 px rows. */
const TOUCH_MENU_ROW_HEIGHT = 44;

/**
 * The theme definitions are loaded once and cached, so raising the row height on both colour
 * schemes' definitions holds for menus, selects and later appearance switches in this bundle.
 */
async function raiseMenuRows() {
  const snapshots = await Promise.all(
    [UiColorScheme.Light, UiColorScheme.Dark].map((scheme) =>
      loadUiThemeSnapshot(scheme, macintoshTheme),
    ),
  );
  for (const { definition } of snapshots) {
    const { dimensions } = definition;
    dimensions.menu_row_height = Math.max(dimensions.menu_row_height ?? 0, TOUCH_MENU_ROW_HEIGHT);
  }
}

function writeLanguage(language: PublicLanguage) {
  miniToolPreferences.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
}

async function start() {
  detectFlexGap();
  mirrorCompactLayout();
  forwardFieldTaps();
  await Promise.all([
    installWindowInsets(),
    loadMiniToolPreferences([LANGUAGE_KEY, EDITOR_PALETTE_PRESETS_KEY]),
  ]);
  // Xiaohongshu's audience reads Simplified Chinese unless the user picked another language.
  const language = publicLanguage(
    miniToolPreferences.getItem(LANGUAGE_KEY) ?? PublicLanguage.SimplifiedChinese,
  );
  document.documentElement.lang = language;
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? UiColorScheme.Dark
    : UiColorScheme.Light;
  await preloadUiAssets(colorScheme, language, macintoshTheme);
  await raiseMenuRows();
  const initialTheme = await loadUiThemeSnapshot(colorScheme, macintoshTheme);
  const application = createMiniToolPixelationApplication(initialTheme);
  const element = document.getElementById(ROOT_ID)!;
  element.textContent = "";
  createRoot(element, { identifierPrefix: ROOT_ID }).render(
    <StrictMode>
      <ToolApplicationRoot
        rootId={ROOT_ID}
        language={language}
        onLanguageChange={writeLanguage}
        artwork={{}}
      >
        {application.view}
      </ToolApplicationRoot>
    </StrictMode>,
  );
  window.addEventListener("pagehide", () => application.dispose());
}

void start().catch((error: unknown) => {
  console.error("Unable to start the pixelate tool", error);
  const element = document.getElementById(ROOT_ID);
  if (!element) return;
  element.dataset.toolStartupError = String(error);
  element.textContent = "无法打开像素画工具，请关闭后重新打开。";
});
