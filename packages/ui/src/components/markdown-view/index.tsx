import {
  useId,
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { themeFontHeight } from "$/base/components/theme-controls";
import { layoutSize, observeResize, scrollElementIntoView } from "$/base/utils/dom-geometry";
import { UI_SCALE } from "$/components/canvas-surface/metrics";
import { Divider, DividerVariant } from "$/components/divider";
import { Text, TextVariant } from "$/components/text";
import { useUi } from "$/components/theme";

import styles from "$/components/markdown-view/markdown-view.module.css";

enum BlockKind {
  Heading = "heading",
  Paragraph = "paragraph",
  List = "list",
  Image = "image",
}

type MarkdownBlock =
  | { kind: BlockKind.Heading; level: number; text: string; id: string }
  | { kind: BlockKind.Paragraph; text: string }
  | { kind: BlockKind.List; ordered: boolean; start: number; items: string[] }
  | { kind: BlockKind.Image; alt: string; source: string };

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const LIST_PATTERN = /^(?:([-*])|(\d+)\.)\s+(.+)$/;
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;
const EXTERNAL_LINK_PATTERN = /^https?:\/\//i;
const FRAGMENT_PREFIX = "#";
const STRONG_DELIMITER = "**";
const CODE_DELIMITER = "`";
const DOCUMENT_CONTENT_INSET = 8;
const DOCUMENT_SEPARATOR_HEIGHT = 16;
const DOCUMENT_TEXT_SCALE = 3;
const DOCUMENT_CAPTION_SCALE = 2;
const DOCUMENT_HEADING_SCALE = 4;
const DOCUMENT_TITLE_SCALE = 5;
const DOCUMENT_LINE_GAP = themeFontHeight("default", 1);

function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }
    const image = line.match(IMAGE_PATTERN);
    if (image) {
      blocks.push({ kind: BlockKind.Image, alt: image[1], source: image[2] });
      index++;
      continue;
    }
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      blocks.push({
        kind: BlockKind.Heading,
        level: heading[1].length,
        text: heading[2],
        id: headingId(heading[2]),
      });
      index++;
      continue;
    }
    const list = line.match(LIST_PATTERN);
    if (list) {
      const ordered = Boolean(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(LIST_PATTERN);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(item[3]);
        index++;
      }
      blocks.push({ kind: BlockKind.List, ordered, start: ordered ? Number(list[2]) : 1, items });
      continue;
    }
    const paragraph = [line];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !HEADING_PATTERN.test(lines[index].trim()) &&
      !IMAGE_PATTERN.test(lines[index].trim()) &&
      !LIST_PATTERN.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index++;
    }
    blocks.push({ kind: BlockKind.Paragraph, text: paragraph.join(" ") });
  }
  return blocks;
}

export interface MarkdownImageSource {
  src: string;
  /** Display dimensions reserve the image's aspect ratio before loading. */
  width: number;
  height: number;
}

export interface MarkdownViewProps extends HTMLAttributes<HTMLElement> {
  markdown: string;
  resolveImage?: (source: string) => MarkdownImageSource | undefined;
}

/** Read-only documents: headings, paragraphs, flat lists, strong text, inline code, links and resolved images. HTML is displayed as text. */
export function MarkdownView({
  markdown,
  resolveImage,
  className,
  style,
  ...props
}: MarkdownViewProps) {
  const root = useRef<HTMLElement>(null);
  const prefix = useId();
  const [contentWidth, setContentWidth] = useState(0);
  const { style: uiStyle } = useUi();
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const width = layoutSize(node).width - DOCUMENT_CONTENT_INSET * 2;
      if (width > 0) setContentWidth(width);
    };
    measure();
    return observeResize([node], measure);
  }, []);
  const documentStyle = {
    "--ui-document-face": uiStyle.colors.textbox_face,
    "--ui-document-text": uiStyle.colors.text,
    "--ui-document-link": uiStyle.colors.link_text,
    "--ui-document-link-hover": uiStyle.colors.link_hover,
    "--ui-document-inset": `${DOCUMENT_CONTENT_INSET}px`,
    "--ui-document-font-size": `${themeFontHeight("default", DOCUMENT_TEXT_SCALE)}px`,
    "--ui-document-line-height": `${themeFontHeight("default", DOCUMENT_TEXT_SCALE) + DOCUMENT_LINE_GAP}px`,
    "--ui-document-list-indent": `${themeFontHeight("default", DOCUMENT_HEADING_SCALE)}px`,
    ...style,
  } as CSSProperties;
  const textRun = (text: string, scale: number, key?: number) => (
    <Text
      key={key}
      variant={TextVariant.Inline}
      wrap
      className={styles.text}
      scale={scale}
      ink="currentColor"
    >
      {text}
    </Text>
  );
  const inline = (text: string, scale = DOCUMENT_TEXT_SCALE): ReactNode =>
    text.split(INLINE_PATTERN).map((part, index) => {
      if (part.startsWith(STRONG_DELIMITER))
        return <strong key={index}>{textRun(part.slice(2, -2), scale)}</strong>;
      if (part.startsWith(CODE_DELIMITER))
        return <code key={index}>{textRun(part.slice(1, -1), scale)}</code>;
      const link = part.match(LINK_PATTERN);
      if (!link) return textRun(part, scale, index);
      const [, label, href] = link;
      if (href.startsWith(FRAGMENT_PREFIX)) {
        const id = `${prefix}-${href.slice(1)}`;
        return (
          <a
            key={index}
            href={`#${id}`}
            onClick={(event) => {
              event.preventDefault();
              const target = [...(root.current?.querySelectorAll<HTMLElement>("[id]") ?? [])].find(
                (element) => element.id === id,
              );
              scrollElementIntoView(target, { block: "start", inline: "nearest" });
              target?.focus({ preventScroll: true });
            }}
          >
            {textRun(label, scale)}
          </a>
        );
      }
      return EXTERNAL_LINK_PATTERN.test(href) ? (
        <a key={index} href={href} target="_blank" rel="noopener noreferrer">
          {textRun(label, scale)}
        </a>
      ) : (
        textRun(label, scale, index)
      );
    });
  return (
    <article
      {...props}
      ref={root}
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={documentStyle}
    >
      {blocks.map((block, index) => {
        if (block.kind === BlockKind.Image) {
          const image = resolveImage?.(block.source);
          return image ? (
            <figure className={styles.figure} key={index}>
              <img
                src={image.src}
                alt={block.alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
              />
              {block.alt && <figcaption>{textRun(block.alt, DOCUMENT_CAPTION_SCALE)}</figcaption>}
            </figure>
          ) : (
            <p key={index}>{textRun(block.alt, DOCUMENT_TEXT_SCALE)}</p>
          );
        }
        if (block.kind === BlockKind.Heading) {
          const Heading = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          const headingScale = block.level === 1 ? DOCUMENT_TITLE_SCALE : DOCUMENT_HEADING_SCALE;
          const followsHeading = blocks[index - 1]?.kind === BlockKind.Heading;
          const precedesHeading = blocks[index + 1]?.kind === BlockKind.Heading;
          return (
            <div
              className={[
                styles.heading,
                followsHeading && styles.joinedHeading,
                precedesHeading && styles.headingBeforeHeading,
              ]
                .filter(Boolean)
                .join(" ")}
              key={index}
              id={`${prefix}-${block.id}`}
              tabIndex={-1}
            >
              {index > 0 && !followsHeading && contentWidth > 0 && (
                <Divider
                  variant={DividerVariant.InView}
                  pixelSize={{
                    width: contentWidth / UI_SCALE,
                    height: DOCUMENT_SEPARATOR_HEIGHT / UI_SCALE,
                  }}
                />
              )}
              <Heading
                style={{
                  fontSize: themeFontHeight("default", headingScale),
                  lineHeight: `${themeFontHeight("default", headingScale) + DOCUMENT_LINE_GAP}px`,
                }}
              >
                {inline(block.text, headingScale)}
              </Heading>
            </div>
          );
        }
        if (block.kind === BlockKind.List) {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ));
          return block.ordered ? (
            <ol key={index} start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </article>
  );
}
