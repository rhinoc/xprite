import { cn } from "$/base/utils/cn";
import { MarkdownDocument } from "$/components/rich-text/markdown-document";
import type { RichTextProps } from "$/components/rich-text/types";

import styles from "$/components/text/text.module.css";

export type { RichTextProps, MarkdownImageSource } from "$/components/rich-text/types";

/** Read-only rich content. Use children for JSX or markdown for Markdown source. */
export function RichText(props: RichTextProps) {
  if (props.markdown !== undefined) return <MarkdownDocument {...props} />;
  const { className, markdown: _markdown, resolveImage: _resolveImage, ...attributes } = props;
  return (
    <div
      {...attributes}
      className={cn(styles.richText, className)}
      data-slot="rich-text"
      data-format="markup"
    />
  );
}
