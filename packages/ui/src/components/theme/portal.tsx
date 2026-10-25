import { createElement, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CursorProvider } from "$/base/components/cursor";
import { ThemeScope } from "$/base/theme/theme-scope";

import styles from "$/components/theme/portal-host.module.css";

const ELEMENT_NODE = 1;

function isElementNode(node: Element | DocumentFragment | null | undefined): node is Element {
  return !!node && (node as Node).nodeType === ELEMENT_NODE;
}

function belongsToOtherDocument(
  node: Element | DocumentFragment | null | undefined,
  rootDocument: Document,
): node is Element | DocumentFragment {
  return !!node && node.ownerDocument != null && node.ownerDocument !== rootDocument;
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
  const fullscreen = rootDocument.fullscreenElement;
  if (fullscreen) {
    if (keepPreferredInsideFullscreen(preferred, fullscreen, rootDocument)) return preferred;
    return fullscreen;
  }
  return preferred ?? rootDocument.body;
}

let fullscreenHost: HTMLElement | null = null;

function discardFullscreenPortalHost() {
  fullscreenHost?.remove();
  fullscreenHost = null;
}

function ensureFullscreenPortalHost(fullscreen: Element): HTMLElement {
  if (fullscreenHost?.isConnected && fullscreenHost.parentElement === fullscreen) {
    return fullscreenHost;
  }
  discardFullscreenPortalHost();
  const host = fullscreen.ownerDocument.createElement("div");
  host.dataset.uiPortalRoot = "";
  host.className = styles.root;
  fullscreen.append(host);
  fullscreenHost = host;
  return host;
}

/** Fullscreen element (via a host layer), else preferred, else body. */
export function resolveUiPortalContainer(
  preferred?: Element | DocumentFragment | null,
  rootDocument: Document | null | undefined = typeof document === "undefined"
    ? undefined
    : document,
): Element | DocumentFragment | null {
  const chosen = chooseUiPortalContainer(preferred, rootDocument);
  if (!rootDocument?.fullscreenElement) {
    discardFullscreenPortalHost();
    return chosen;
  }
  if (chosen && chosen === rootDocument.fullscreenElement) {
    return ensureFullscreenPortalHost(chosen);
  }
  return chosen;
}

function subscribeUiPortalContainer(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const notify = () => {
    if (!document.fullscreenElement) discardFullscreenPortalHost();
    onStoreChange();
  };
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
}

function fullscreenElementSnapshot(): Element | null {
  return typeof document === "undefined" ? null : document.fullscreenElement;
}

/** Re-resolve the portal mount when the browser fullscreen element changes. */
export function useUiPortalContainer(
  preferred?: Element | DocumentFragment | null,
): Element | DocumentFragment | null {
  useSyncExternalStore(subscribeUiPortalContainer, fullscreenElementSnapshot, () => null);
  return resolveUiPortalContainer(preferred);
}

function UiPortalHost({
  children,
  container,
}: {
  children: ReactNode;
  container?: Element | DocumentFragment | null;
}) {
  const target = useUiPortalContainer(container);
  if (!target) return null;
  return createPortal(
    createElement(ThemeScope, null, createElement(CursorProvider, null, children)),
    target,
  );
}

/** Carry the current UI theme into a different DOM container. */
export function createUiPortal(children: ReactNode, container?: Element | DocumentFragment | null) {
  return createElement(UiPortalHost, { container }, children);
}
