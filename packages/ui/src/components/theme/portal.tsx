import { createElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ThemeScope } from "$/base/theme/theme-scope";

/** Carry the current UI theme into a different DOM container. */
export function createUiPortal(children: ReactNode, container: Element | DocumentFragment) {
  return createPortal(createElement(ThemeScope, null, children), container);
}
