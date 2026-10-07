import type { HTMLAttributes } from "react";

export interface MarkdownImageSource {
  src: string;
  /** Display dimensions reserve the image's aspect ratio before loading. */
  width: number;
  height: number;
}

interface MarkupRichTextProps extends HTMLAttributes<HTMLDivElement> {
  markdown?: never;
  resolveImage?: never;
}

export interface MarkdownRichTextProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "dangerouslySetInnerHTML"
> {
  markdown: string;
  resolveImage?: (source: string) => MarkdownImageSource | undefined;
  children?: never;
  dangerouslySetInnerHTML?: never;
}

/** Supply JSX/HTML content or Markdown, never both. */
export type RichTextProps = MarkupRichTextProps | MarkdownRichTextProps;
