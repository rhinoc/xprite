import {
  clientRect,
  clientToLocal,
  computedStyle,
  layoutSize,
  scrollPosition,
  scrollSize,
  scrollWindowTo,
  setScrollPosition,
} from "$/base/utils/dom-geometry";

const installed = new WeakSet<Document>();
const FRAGMENT_INSET = 16;

function pageScroller(doc: Document): Element {
  return doc.scrollingElement ?? doc.documentElement;
}

function fragmentElement(doc: Document, hash: string): HTMLElement | null {
  if (hash.length < 2) return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  const element = doc.getElementById(id);
  return element instanceof HTMLElement ? element : null;
}

function isPageScroller(element: Element, doc: Document): boolean {
  return (
    element === doc.scrollingElement || element === doc.documentElement || element === doc.body
  );
}

function canScrollVertically(element: HTMLElement): boolean {
  const overflow = computedStyle(element).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

/** The window that owns the anchor, not the page that places the desktop above the footer. */
function nearestWindowScroller(target: HTMLElement): HTMLElement | null {
  const doc = target.ownerDocument;
  let node = target.parentElement;
  while (node && !isPageScroller(node, doc)) {
    if (canScrollVertically(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function revealTarget(target: HTMLElement) {
  let node: HTMLElement | null = target;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
}

/** Move an anchor inside its window. The document scroll position stays unchanged. */
export function scrollFragmentTarget(target: HTMLElement) {
  revealTarget(target);
  const scroller = nearestWindowScroller(target);
  if (!scroller) return;
  const rect = clientRect(target);
  const local = clientToLocal(scroller, { x: rect.left, y: rect.top });
  const inset = Number.parseFloat(computedStyle(target).scrollMarginTop) || FRAGMENT_INSET;
  const current = scrollPosition(scroller);
  const limit = Math.max(0, scrollSize(scroller).height - (layoutSize(scroller)?.height ?? 0));
  setScrollPosition(scroller, {
    y: Math.min(limit, Math.max(0, current.y + local.y - inset)),
  });
}

function samePageFragment(link: HTMLAnchorElement, doc: Document): HTMLElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  const url = new URL(link.href, doc.baseURI);
  const location = view.location;
  if (
    url.origin !== location.origin ||
    url.pathname !== location.pathname ||
    url.search !== location.search ||
    url.hash.length < 2
  )
    return null;
  return fragmentElement(doc, url.hash);
}

/**
 * Same-page anchors scroll inside the window that contains them.
 * The page scroller keeps the desktop above the footer and does not pin that window to the browser edge.
 */
export function installPageFragmentContainment(doc: Document = document) {
  if (installed.has(doc)) return;
  installed.add(doc);
  const view = doc.defaultView;
  if (!view) return;
  let pageY = 0;
  let holding = false;
  let settling = view.location.hash.length > 1;
  const remember = () => {
    if (!holding) pageY = scrollPosition(pageScroller(doc))?.y ?? 0;
  };
  const restorePage = () => {
    setScrollPosition(pageScroller(doc), { y: pageY });
    scrollWindowTo(view, { y: pageY });
  };
  const holdPage = (hash: string) => {
    const target = fragmentElement(doc, hash);
    if (!target) return;
    holding = true;
    scrollFragmentTarget(target);
    restorePage();
    holding = false;
  };
  const click = (event: MouseEvent) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const link =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link) return;
    const target = samePageFragment(link, doc);
    if (!target) return;
    remember();
    event.preventDefault();
    const hash = new URL(link.href, doc.baseURI).hash;
    holdPage(hash);
    if (view.location.hash !== hash) view.history.pushState(null, "", hash);
  };
  view.addEventListener(
    "scroll",
    () => {
      if (holding) return;
      if (!settling) {
        remember();
        return;
      }
      holding = true;
      restorePage();
      holding = false;
    },
    { passive: true },
  );
  doc.addEventListener("click", click);
  view.addEventListener("hashchange", () => holdPage(view.location.hash));
  if (settling) {
    view.requestAnimationFrame(() => {
      holdPage(view.location.hash);
      view.requestAnimationFrame(() => {
        settling = false;
      });
    });
  }
}
