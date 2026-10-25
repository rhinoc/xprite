import {
  createElement,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { CursorProvider } from "$/base/components/cursor";
import { ThemeScope } from "$/base/theme/theme-scope";

import styles from "$/components/theme/portal-host.module.css";

const ELEMENT_NODE = 1;
const FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

type DocumentWithWebkitFullscreen = Document & {
  webkitFullscreenElement?: Element | null;
};

function isElementNode(node: Element | DocumentFragment | null | undefined): node is Element {
  return !!node && (node as Node).nodeType === ELEMENT_NODE;
}

function belongsToOtherDocument(
  node: Element | DocumentFragment | null | undefined,
  rootDocument: Document,
): node is Element | DocumentFragment {
  return !!node && node.ownerDocument != null && node.ownerDocument !== rootDocument;
}

export function activeFullscreenElement(rootDocument: Document | null | undefined): Element | null {
  if (!rootDocument) return null;
  return (
    rootDocument.fullscreenElement ??
    (rootDocument as DocumentWithWebkitFullscreen).webkitFullscreenElement ??
    null
  );
}

/** React-owned layer inside the fullscreen host. Prefer this over appending during render. */
export function findUiPortalRoot(fullscreen: Element): HTMLElement | null {
  if (!isElementNode(fullscreen)) return null;
  const root = fullscreen.querySelector<HTMLElement>("[data-ui-portal-root]");
  return root && root !== fullscreen && fullscreen.contains(root) ? root : null;
}

/** Preferred mounts that already paint inside the fullscreen subtree stay put. */
function keepPreferredInsideFullscreen(
  preferred: Element | DocumentFragment | null | undefined,
  fullscreen: Element,
  rootDocument: Document,
): preferred is Element {
  if (!isElementNode(preferred) || preferred === fullscreen) return false;
  if (preferred === rootDocument.body || preferred === rootDocument.documentElement) return false;
  return fullscreen.contains(preferred);
}

export function chooseUiPortalContainer(
  preferred?: Element | DocumentFragment | null,
  rootDocument: Document | null | undefined = typeof document === "undefined"
    ? undefined
    : document,
): Element | DocumentFragment | null {
  if (!rootDocument) return preferred ?? null;
  if (belongsToOtherDocument(preferred, rootDocument)) return preferred;
  const fullscreen = activeFullscreenElement(rootDocument);
  if (fullscreen) {
    if (keepPreferredInsideFullscreen(preferred, fullscreen, rootDocument)) return preferred;
    return fullscreen;
  }
  return preferred ?? rootDocument.body;
}

let appendedFullscreenHost: HTMLElement | null = null;

function discardAppendedFullscreenPortalHost() {
  appendedFullscreenHost?.remove();
  appendedFullscreenHost = null;
}

function ensureAppendedFullscreenPortalHost(fullscreen: Element): HTMLElement {
  if (appendedFullscreenHost?.isConnected && appendedFullscreenHost.parentElement === fullscreen) {
    return appendedFullscreenHost;
  }
  discardAppendedFullscreenPortalHost();
  const host = fullscreen.ownerDocument.createElement("div");
  host.dataset.uiPortalRoot = "";
  host.className = styles.root;
  fullscreen.append(host);
  appendedFullscreenHost = host;
  return host;
}

/** Fullscreen host layer, else preferred, else body. */
export function resolveUiPortalContainer(
  preferred?: Element | DocumentFragment | null,
  rootDocument: Document | null | undefined = typeof document === "undefined"
    ? undefined
    : document,
): Element | DocumentFragment | null {
  const chosen = chooseUiPortalContainer(preferred, rootDocument);
  const fullscreen = activeFullscreenElement(rootDocument);
  if (!fullscreen) {
    discardAppendedFullscreenPortalHost();
    return chosen;
  }
  if (chosen && chosen !== fullscreen) return chosen;
  const existing = findUiPortalRoot(fullscreen);
  if (existing) {
    discardAppendedFullscreenPortalHost();
    return existing;
  }
  return ensureAppendedFullscreenPortalHost(fullscreen);
}

function subscribeUiPortalContainer(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const notify = () => {
    if (!activeFullscreenElement(document)) discardAppendedFullscreenPortalHost();
    onStoreChange();
  };
  for (const name of FULLSCREEN_CHANGE_EVENTS) document.addEventListener(name, notify);
  return () => {
    for (const name of FULLSCREEN_CHANGE_EVENTS) document.removeEventListener(name, notify);
  };
}

function fullscreenStoreSnapshot(): string {
  if (typeof document === "undefined") return "";
  const fullscreen = activeFullscreenElement(document);
  if (!fullscreen) return "";
  return findUiPortalRoot(fullscreen) ? "fullscreen-root" : "fullscreen";
}

/** Re-resolve the portal mount when the browser fullscreen element changes. */
function useUiPortalContainer(
  preferred?: Element | DocumentFragment | null,
): Element | DocumentFragment | null {
  useSyncExternalStore(subscribeUiPortalContainer, fullscreenStoreSnapshot, () => "");
  return resolveUiPortalContainer(preferred);
}

function UiPortalHost({
  children,
  container,
}: {
  children?: ReactNode;
  container?: Element | DocumentFragment | null;
}) {
  const target = useUiPortalContainer(container);
  if (!target) return null;
  return createPortal(
    createElement(ThemeScope, null, createElement(CursorProvider, null, children)),
    target,
  );
}

/** Stable overlay layer for the fullscreen element. Keep it outside overflow/clip scroll areas. */
export function UiPortalRoot({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      data-ui-portal-root=""
      className={className ? `${styles.root} ${className}` : styles.root}
    />
  );
}

/** Carry the current UI theme into a different DOM container. */
export function createUiPortal(children: ReactNode, container: Element | DocumentFragment) {
  return createElement(UiPortalHost, { container }, children);
}
