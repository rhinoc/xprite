import { useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";

import { connectDocumentNavigation } from "$/adapters/public/document-navigation";
import { PublicArticleDiagram } from "$/components/articles/article-diagram";
import { FeatureDirectory } from "$/components/features/feature-directory";
import { PublicFooter, PublicIndex, PublicNavigation } from "$/components/public/static-ui";
import { DocumentContentsManager } from "$/managers/public/document-contents-manager";
import { DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { macintoshTheme } from "@xprite/ui";
import { UiColorScheme } from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";
import { connectWindowWorkspace, installPageFragmentContainment } from "@xprite/ui/utils";

createBrowserSiteTelemetry({
  production: import.meta.env.PROD,
  token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
  region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
  version: __XPRITE_VERSION__,
  release: __XPRITE_RELEASE__,
  captureLinks: true,
});

const DOCUMENT_SCROLL_CONTROLS = "[data-public-reader-scroll]";

function PublicControlsReady() {
  useLayoutEffect(() => {
    document.documentElement.dataset.publicControlsReady = "true";
    return () => {
      delete document.documentElement.dataset.publicControlsReady;
    };
  }, []);
  return null;
}

/** Enhance static content with the same controls as React pages; links work without JavaScript. */
async function mountPublicControls() {
  for (const workspace of document.querySelectorAll<HTMLElement>("[data-public-desktop]")) {
    for (const layer of workspace.querySelectorAll<HTMLElement>(
      "[data-public-sidebar], [data-public-reading-stack]",
    ))
      layer.setAttribute("data-ui-desktop-layer", "true");
    connectWindowWorkspace(workspace, { staticWindowShade: true });
  }
  const desktop = createBrowserDesktop();
  const colorScheme =
    document.querySelector<HTMLElement>("[data-ui-theme][data-ui-appearance]")?.dataset
      .uiAppearance === "dark"
      ? UiColorScheme.Dark
      : UiColorScheme.Light;
  const theme = await loadUiThemeSnapshot(colorScheme, macintoshTheme);
  const language = document.documentElement.lang;
  let contents: DocumentContentsManager | undefined;
  for (const island of document.querySelectorAll<HTMLElement>(
    '[data-public-island="index"], [data-public-island="navigation"], [data-public-island="site-footer"], [data-public-island="features"], [data-public-island="article-diagram"]',
  )) {
    const props = JSON.parse(island.dataset.publicProps ?? "{}");
    if (island.dataset.publicIsland === "index" && island.closest("[data-public-contents]"))
      contents = new DocumentContentsManager(
        props.items.map((item: { href: string }) => item.href),
      );
    hydrateRoot(
      island,
      <DesktopProvider
        manager={desktop}
        theme={macintoshTheme}
        language={language}
        initialTheme={theme}
        preloadArtwork={false}
        scope={false}
      >
        {island.dataset.publicIsland === "article-diagram" ? (
          <PublicArticleDiagram {...props} />
        ) : island.dataset.publicIsland === "features" ? (
          <FeatureDirectory {...props} />
        ) : island.dataset.publicIsland === "navigation" ? (
          <PublicNavigation {...props} />
        ) : island.dataset.publicIsland === "site-footer" ? (
          <PublicFooter {...props} />
        ) : (
          <PublicIndex {...props} contents={contents} />
        )}
      </DesktopProvider>,
      {
        identifierPrefix: island.dataset.publicIdentifier,
        onRecoverableError(error) {
          island.dataset.publicHydrationError = String(error);
          console.error(error);
        },
      },
    );
  }
  installPageFragmentContainment(document);
  for (const viewport of document.querySelectorAll<HTMLElement>(DOCUMENT_SCROLL_CONTROLS))
    connectDocumentNavigation(
      viewport,
      viewport.closest("[data-public-document]") ? contents : undefined,
    );
  const host = document.createElement("div");
  host.style.display = "contents";
  document.body.append(host);
  flushSync(() => {
    createRoot(host).render(
      <DesktopProvider
        manager={desktop}
        theme={macintoshTheme}
        initialTheme={theme}
        language={language}
        preloadArtwork={false}
        scope={false}
        documentTheme
      >
        <PublicControlsReady />
      </DesktopProvider>,
    );
  });
}

void mountPublicControls();

// Static document scopes carry inline tokens that CSS-only HMR cannot replace.
if (import.meta.hot) import.meta.hot.on("public-ui:invalidate", () => location.reload());
