import {
  DOCUMENT_SECTION_INSET,
  observeDocumentContents,
} from "$/adapters/public/document-contents";
import type { DocumentContentsManager } from "$/managers/public/document-contents-manager";
import { clientRect, clientToLocal, scrollPosition, setScrollPosition } from "@xprite/ui/utils";

/** Native scroll regions keep their first-paint geometry when controls become ready. */
export function connectDocumentNavigation(
  viewport: HTMLElement,
  contents?: DocumentContentsManager,
) {
  const scrollToFragment = (hash: string) => {
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return false;
    }
    const target = document.getElementById(id);
    const scroller = viewport;
    if (!target || !viewport.contains(target)) return false;
    const readingWindow = scroller.closest("details[data-public-document]");
    if (readingWindow instanceof HTMLDetailsElement) readingWindow.open = true;
    const rect = clientRect(target);
    const point = clientToLocal(scroller, { x: rect.left, y: rect.top });
    setScrollPosition(scroller, {
      y: scrollPosition(scroller).y + point.y - DOCUMENT_SECTION_INSET,
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

  const stopContents = contents ? observeDocumentContents(viewport, viewport, contents) : undefined;
  const frame = requestAnimationFrame(restore);
  document.addEventListener("click", click);
  window.addEventListener("hashchange", restore);
  window.addEventListener("popstate", restore);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("click", click);
    window.removeEventListener("hashchange", restore);
    window.removeEventListener("popstate", restore);
    stopContents?.();
  };
}
