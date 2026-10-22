import "$/adapters/runtime-compat";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { detectFlexGap } from "$/adapters/runtime-compat";
import { loadMiniToolPreferences, miniToolPreferences } from "$/adapters/xhs-bridge";
import { miniToolText } from "$/managers/text";
import { createMiniToolPixelationApplication } from "$/MiniToolApp";
import { EDITOR_PALETTE_PRESETS_KEY } from "@xprite/editor-core/import-export";
import { publicLanguage, PublicLanguage } from "@xprite/growth-content/language";

const ROOT_ID = "pixelation-root";
const LANGUAGE_KEY = "xprite-minitool-language";

async function start() {
  detectFlexGap();
  await loadMiniToolPreferences([LANGUAGE_KEY, EDITOR_PALETTE_PRESETS_KEY]);
  // Xiaohongshu's audience reads Simplified Chinese unless the user picked another language.
  const language = publicLanguage(
    miniToolPreferences.getItem(LANGUAGE_KEY) ?? PublicLanguage.SimplifiedChinese,
  );
  document.documentElement.lang = language;
  const application = createMiniToolPixelationApplication(miniToolText(language));
  const element = document.getElementById(ROOT_ID)!;
  element.textContent = "";
  createRoot(element, { identifierPrefix: ROOT_ID }).render(
    <StrictMode>{application.view}</StrictMode>,
  );
  element.dataset.toolReady = "";
  window.addEventListener("pagehide", () => application.dispose());
}

void start().catch((error: unknown) => {
  console.error("Unable to start the pixelate tool", error);
  const element = document.getElementById(ROOT_ID);
  if (!element) return;
  element.dataset.toolStartupError = String(error);
  element.textContent = "无法打开像素画工具，请关闭后重新打开。";
});
