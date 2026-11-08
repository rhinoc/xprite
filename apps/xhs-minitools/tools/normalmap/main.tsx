import "$/shared/bridge/runtime-compat";
import "$/shared/bridge/page.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { detectFlexGap } from "$/shared/bridge/runtime-compat";
import { installWindowInsets } from "$/shared/bridge/window-insets";
import { loadMiniToolPreferences, miniToolPreferences } from "$/shared/bridge/xhs-bridge";
import { createMiniToolNormalMapApplication } from "$/tools/normalmap/app";
import { miniToolText } from "$/tools/normalmap/managers/text";
import { publicLanguage, PublicLanguage } from "@xprite/growth-content/language";

const ROOT_ID = "normalmap-root";
const LANGUAGE_KEY = "xprite-minitool-language";
const LIGHT_KEY = "xprite-normalmap-light";

async function start() {
  detectFlexGap();
  await Promise.all([installWindowInsets(), loadMiniToolPreferences([LANGUAGE_KEY, LIGHT_KEY])]);
  const language = publicLanguage(
    miniToolPreferences.getItem(LANGUAGE_KEY) ?? PublicLanguage.SimplifiedChinese,
  );
  document.documentElement.lang = language;
  const application = createMiniToolNormalMapApplication(miniToolText(language));
  const element = document.getElementById(ROOT_ID)!;
  element.textContent = "";
  createRoot(element, { identifierPrefix: ROOT_ID }).render(
    <StrictMode>{application.view}</StrictMode>,
  );
  element.dataset.toolReady = "";
  window.addEventListener("pagehide", () => application.dispose());
}

void start().catch((error: unknown) => {
  console.error("Unable to start the normal map tool", error);
  const element = document.getElementById(ROOT_ID);
  if (!element) return;
  element.dataset.toolStartupError = String(error);
  element.textContent = "无法打开法线贴图工具，请关闭后重新打开。";
});
