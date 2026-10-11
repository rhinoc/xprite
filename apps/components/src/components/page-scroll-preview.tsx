import { useEffect, useState } from "react";

import {
  createUiPortal,
  ScrollArea,
  ScrollAreaTarget,
  RichText,
  UIProvider,
  useUi,
  type ScrollAreaPageProps,
} from "@xprite/ui";

import styles from "$/components.module.css";

const PREVIEW_DOCUMENT =
  '<!doctype html><html lang="en"><head><title>Page scroll preview</title></head><body></body></html>';
const PREVIEW_PARAGRAPHS = 12;

/** The document scrollbar needs its own window rather than the fixed components shell. */
export function ComponentsPageScrollPreview({ props }: { props: Record<string, unknown> }) {
  const pageProps = { ...props, target: ScrollAreaTarget.Page } as ScrollAreaPageProps;
  const [documentHost, setDocumentHost] = useState<Document>();
  const { theme, colorScheme, language, tokens, style } = useUi();
  useEffect(() => {
    if (!documentHost) return;
    const source = documentHost.defaultView?.frameElement?.ownerDocument;
    if (!source) return;
    const copyStyles = () => {
      for (const old of documentHost.head.querySelectorAll("[data-components-preview-style]"))
        old.remove();
      for (const node of source.head.querySelectorAll('style, link[rel="stylesheet"]')) {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.setAttribute("data-components-preview-style", "");
        documentHost.head.append(copy);
      }
    };
    copyStyles();
    const observer = new MutationObserver(copyStyles);
    observer.observe(source.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [documentHost]);
  useEffect(() => {
    if (!documentHost) return;
    documentHost.documentElement.lang = language;
    for (const [name, value] of Object.entries(tokens))
      documentHost.documentElement.style.setProperty(name, String(value));
    documentHost.body.style.margin = "0";
    documentHost.body.style.minWidth = "0";
    documentHost.body.style.height = "auto";
    documentHost.body.style.boxSizing = "border-box";
    documentHost.body.style.backgroundColor = style.colors.background;
  }, [documentHost, tokens, language, style]);
  return (
    <>
      <iframe
        className={styles["components-page-preview"]}
        title="Page scroll preview"
        srcDoc={PREVIEW_DOCUMENT}
        onLoad={(event) => setDocumentHost(event.currentTarget.contentDocument ?? undefined)}
      />
      {documentHost &&
        createUiPortal(
          <UIProvider
            theme={theme}
            colorScheme={colorScheme}
            language={language}
            preloadArtwork={false}
          >
            <ScrollArea {...pageProps}>
              <RichText style={{ padding: "12px" }}>
                <h1>Animation notes</h1>
                {Array.from({ length: PREVIEW_PARAGRAPHS }, (_, index) => (
                  <section key={index}>
                    <h2>Frame {index + 1}</h2>
                    <p>Keep the outline crisp and the background transparent.</p>
                  </section>
                ))}
              </RichText>
            </ScrollArea>
          </UIProvider>,
          documentHost.body,
        )}
    </>
  );
}
