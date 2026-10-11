import type { CSSProperties, HTMLAttributes, Ref } from "react";

import type { ScrollbarStyle } from "$/base/theme/theme-types";
import type { SurfaceViewport } from "$/components/canvas-surface";
import { ScrollbarRendering } from "$/components/scrollbar/types";

export { ScrollbarRendering };

interface ScrollViewportProps extends HTMLAttributes<HTMLDivElement> {
  [attribute: `data-${string}`]: string | undefined;
}

export enum ScrollAreaTarget {
  Element = "element",
  Page = "page",
}

interface ScrollAreaRootProps extends HTMLAttributes<HTMLDivElement> {
  /** Stable gutter; defaults to false for Element and true for Page. */
  reserveScrollbarGutter?: boolean;
  /** Browser scrollbars or the active skin's scrollbar artwork. */
  scrollbarRendering?: ScrollbarRendering;
}

export interface DocumentScrollAreaProps extends ScrollAreaRootProps {
  /** Enhance an existing static document instead of wrapping its content. */
  documentGutter?: boolean;
  /** Choose compact, classic or transparent skinned scrollbars. */
  scrollbarStyle?: ScrollbarStyle;
}

export interface ScrollAreaElementProps extends ScrollAreaRootProps {
  /** Element scrolls a local viewport; Page scrolls the document. */
  target?: ScrollAreaTarget.Element;
  scrollX?: boolean;
  scrollY?: boolean;
  /** Override the theme default for the density of this particular region. */
  scrollbarStyle?: ScrollbarStyle;
  viewport?: SurfaceViewport;
  viewportRef?: Ref<HTMLDivElement>;
  viewportProps?: ScrollViewportProps;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  /** Re-measure after an external content revision without resetting native scroll position. */
  contentRevision?: number | string;
}

interface SkinnedPageScrollProps extends DocumentScrollAreaProps {
  target: ScrollAreaTarget.Page;
  scrollbarRendering?: ScrollbarRendering.Skinned;
}

interface BrowserPageScrollProps extends DocumentScrollAreaProps {
  target: ScrollAreaTarget.Page;
  scrollbarRendering: ScrollbarRendering.Browser;
}

export type ScrollAreaPageProps = SkinnedPageScrollProps | BrowserPageScrollProps;

export type ScrollAreaProps = ScrollAreaElementProps | ScrollAreaPageProps;
