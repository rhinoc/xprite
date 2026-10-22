import "$/adapters/minitool/runtime-compat";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { detectFlexGap, mirrorCompactLayout } from "$/adapters/minitool/runtime-compat";
import { loadMiniToolPreferences, miniToolPreferences } from "$/adapters/minitool/xhs-bridge";
import { createMiniToolPixelationApplication } from "$/MiniToolPixelationApp";
import { ToolApplicationRoot } from "$/tool-application-root";
import { EDITOR_PALETTE_PRESETS_KEY } from "@xprite/editor-core/import-export";
import { publicLanguage, PublicLanguage } from "@xprite/growth-content/language";
import { macintoshTheme, UiColorScheme } from "@xprite/ui";
import { loadUiThemeSnapshot, preloadUiAssets } from "@xprite/ui/assets";

const ROOT_ID = "pixelation-root";
const LANGUAGE_KEY = "xprite-minitool-language";

function writeLanguage(language: PublicLanguage) {
  miniToolPreferences.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
}

async function start() {
  detectFlexGap();
  mirrorCompactLayout();
  await loadMiniToolPreferences([LANGUAGE_KEY, EDITOR_PALETTE_PRESETS_KEY]);
  // Xiaohongshu's audience reads Simplified Chinese unless the user picked another language.
  const language = publicLanguage(
    miniToolPreferences.getItem(LANGUAGE_KEY) ?? PublicLanguage.SimplifiedChinese,
  );
  document.documentElement.lang = language;
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? UiColorScheme.Dark
    : UiColorScheme.Light;
  await preloadUiAssets(colorScheme, language, macintoshTheme);
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
