import { useLayoutEffect, useRef, type ReactNode, type RefObject, type ReactPortal } from "react";
import { createPortal } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";

import { PublicIndex, PublicNavigation } from "$/components/public/static-ui";
import { DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { PageScrollArea, ScrollArea, macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";
import {
  connectWindowWorkspace,
  clientRect,
  clientToLocal,
  scrollPosition,
  setScrollPosition,
  scrollElementIntoView,
} from "@xprite/ui/utils";

import styles from "$/public-controls.module.css";

const SCROLL_CONTROLS = ".guide-image, .compare_tableScroll, main pre";
const DOCUMENT_SCROLL_CONTROLS = "[data-public-reader-scroll]";
const DOCUMENT_SECTION_INSET = 16;

function PublicDocumentContent({
  nodes,
  viewport,
}: {
  nodes: readonly Node[];
  viewport: RefObject<HTMLDivElement>;
}) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    host.current.append(...nodes);
    const scrollToFragment = (hash: string) => {
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        return false;
      }
      const target = document.getElementById(id);
      const scroller = viewport.current;
      if (!target || !scroller || !host.current?.contains(target)) return false;
      const readingWindow = scroller.closest("details[data-public-document]");
      if (readingWindow instanceof HTMLDetailsElement) readingWindow.open = true;
      const rect = clientRect(target);
      const point = clientToLocal(scroller, { x: rect.left, y: rect.top });
      setScrollPosition(scroller, {
        y: scrollPosition(scroller).y + point.y - DOCUMENT_SECTION_INSET,
      });
      scrollElementIntoView(scroller.closest("[data-public-document]"), {
        block: "nearest",
        behavior: "instant",
      });
      return true;
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
      if (!scrollToFragment(url.hash)) return;
      event.preventDefault();
      if (location.hash !== url.hash) history.pushState(null, "", url.hash);
    };
    const restore = () => scrollToFragment(location.hash);
    const frame = requestAnimationFrame(restore);
    document.addEventListener("click", click);
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", click);
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, [nodes, viewport]);
  return <div ref={host} />;
}

function PublicDocumentScroller({ nodes, language }: { nodes: readonly Node[]; language: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <ScrollArea
      className={styles.documentScroll}
      scrollX={false}
      reserveScrollbarGutter
      viewportRef={viewport}
      aria-label={language.startsWith("zh") ? "文档滚动" : "Document scroll"}
      viewportProps={{ tabIndex: 0, "data-ui-scroll-region-focus": "true" }}
    >
      <PublicDocumentContent nodes={nodes} viewport={viewport} />
    </ScrollArea>
  );
}

/** Enhance static content with the same controls as React pages; links work without JavaScript. */
async function mountPublicControls() {
  for (const workspace of document.querySelectorAll<HTMLElement>("[data-public-desktop]")) {
    for (const layer of workspace.querySelectorAll<HTMLElement>(
      "[data-public-sidebar], .compare_readingStack",
    ))
      layer.setAttribute("data-ui-desktop-layer", "true");
    connectWindowWorkspace(workspace, { staticWindowShade: true });
  }
  const desktop = createBrowserDesktop();
  const theme = await loadUiThemeSnapshot("light", macintoshTheme);
  const language = document.documentElement.lang;
  const portals: ReactPortal[] = [];
  const scope = (content: ReactNode) => (
    <DesktopProvider
      manager={desktop}
      theme={macintoshTheme}
      initialTheme={theme}
      language={language}
      preloadArtwork={false}
      documentTheme
    >
      {content}
    </DesktopProvider>
  );
  for (const island of document.querySelectorAll<HTMLElement>(
    '[data-public-island="index"], [data-public-island="navigation"]',
  )) {
    const props = JSON.parse(island.dataset.publicProps ?? "{}");
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
        {island.dataset.publicIsland === "navigation" ? (
          <PublicNavigation {...props} />
        ) : (
          <PublicIndex {...props} />
        )}
      </DesktopProvider>,
      { identifierPrefix: island.dataset.publicIdentifier },
    );
  }
  for (const region of document.querySelectorAll<HTMLElement>(SCROLL_CONTROLS)) {
    const slot = document.createElement("div");
    const preformatted = region.tagName === "PRE";
    const html = preformatted ? region.outerHTML : region.innerHTML;
    const className = preformatted ? styles.code : region.className;
    region.replaceWith(slot);
    portals.push(
      createPortal(
        scope(
          <ScrollArea
            className={className}
            scrollY={false}
            reserveScrollbarGutter
            contentClassName={styles.scrollContent}
            aria-label={
              region.getAttribute("aria-label") ??
              (language.startsWith("zh") ? "内容横向滚动" : "Content scroll")
            }
            viewportProps={{ tabIndex: 0, "data-ui-scroll-region-focus": "true" }}
            contentStyle={{ minHeight: 0 }}
          >
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </ScrollArea>,
        ),
        slot,
        `scroll-${portals.length}`,
      ),
    );
  }
  for (const region of document.querySelectorAll<HTMLElement>(DOCUMENT_SCROLL_CONTROLS)) {
    const slot = document.createElement("div");
    const nodes = Array.from(region.childNodes);
    region.replaceWith(slot);
    portals.push(
      createPortal(
        scope(<PublicDocumentScroller nodes={nodes} language={language} />),
        slot,
        `document-${portals.length}`,
      ),
    );
  }
  const host = document.createElement("div");
  host.style.display = "contents";
  document.body.append(host);
  createRoot(host).render(
    scope(
      <>
        <PageScrollArea
          documentGutter
          aria-label={language.startsWith("zh") ? "页面滚动" : "Page scroll"}
        />
        {portals}
      </>,
    ),
  );
}

void mountPublicControls();

// Static document scopes carry inline tokens that CSS-only HMR cannot replace.
if (import.meta.hot) import.meta.hot.on("public-ui:invalidate", () => location.reload());
