import type { FeatureGroup, FeatureItem } from "$content/features";
import { localizedSiteHref, pickText, publicLanguage } from "$content/site/language";
import { useRef, useState } from "react";

import { PublicImage } from "$/components/public/public-image";
import {
  Button,
  Dialog,
  OverlayContentLayout,
  RichText,
  ScrollArea,
  Text,
  TextRole,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/features/feature-directory.module.css";

const FEATURE_WINDOW_BOUNDS = { x: 0, y: 0, width: 640, height: 520 };
const FEATURE_WINDOW_MIN_SIZE = { width: 280, height: 220 };

/** A directory entry: preview on the left, name, description and input → output on the right. */
function FeatureEntry({
  item,
  language,
  onOpen,
}: {
  item: FeatureItem;
  language: string;
  onOpen: (item: FeatureItem, trigger: HTMLElement) => void;
}) {
  return (
    <li>
      <a
        className={styles.item}
        href={localizedSiteHref(item.href, language)}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          onOpen(item, event.currentTarget);
        }}
      >
        {item.media ? (
          <span className={styles.preview}>
            <img
              src={item.media.src}
              alt=""
              width={item.media.width}
              height={item.media.height}
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : (
          <span className={styles.preview} aria-hidden="true" />
        )}
        <span className={styles.itemBody}>
          <span className={styles.itemHead}>
            <span className={styles.itemTitle}>{item.title}</span>
            {item.io && (
              <span className={styles.io}>
                <span className={styles.ioPart}>{item.io.input}</span>
                <span className={styles.arrow} aria-hidden="true" />
                <span className={styles.ioPart}>{item.io.output}</span>
              </span>
            )}
          </span>
          <span className={styles.itemText}>{item.description}</span>
        </span>
      </a>
    </li>
  );
}

export function FeatureDirectory({
  language,
  description,
  groups,
}: {
  language: string;
  description: string;
  groups: readonly FeatureGroup[];
}) {
  const [opened, setOpened] = useState<FeatureItem | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const text = (
    en: string,
    zh: string,
    ja: string,
    ko: string,
    ru: string,
    pt: string,
    es: string,
  ) => pickText(publicLanguage(language), en, zh, ja, ko, ru, pt, es);
  const close = () => {
    setOpened(null);
    trigger.current?.focus();
  };
  return (
    <>
      <div className={styles.directory}>
        <Text as="p" variant={TextVariant.Reading} className={styles.description} wrap>
          {description}
        </Text>
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={group.id}>
            <h2 id={group.id} className={styles.groupTitle}>
              {group.title}
            </h2>
            <ul className={styles.items}>
              {group.items.map((item) => (
                <FeatureEntry
                  key={item.href}
                  item={item}
                  language={language}
                  onOpen={(target, element) => {
                    trigger.current = element;
                    setOpened(target);
                  }}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {opened && (
        <Dialog
          key={opened.href}
          portal
          open
          centerOnOpen
          constrainToViewport
          title={opened.title}
          closeLabel={text(
            `Close ${opened.title}`,
            `关闭${opened.title}`,
            `${opened.title}を閉じる`,
            `${opened.title} 닫기`,
            `Закрыть ${opened.title}`,
            `Fechar ${opened.title}`,
            `Cerrar ${opened.title}`,
          )}
          defaultBounds={FEATURE_WINDOW_BOUNDS}
          minSize={FEATURE_WINDOW_MIN_SIZE}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          movable
          resizable
          contentLayout={OverlayContentLayout.Flow}
        >
          {({ clientBounds }) => (
            <div className={styles.windowContent} style={{ height: clientBounds.height }}>
              <ScrollArea className={styles.windowScroll} scrollX={false} aria-label={opened.title}>
                <RichText
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    const link =
                      event.target instanceof Element
                        ? event.target.closest<HTMLAnchorElement>("a[href]")
                        : null;
                    const href = link?.getAttribute("href");
                    const related = groups
                      .flatMap((group) => group.items)
                      .find((item) => localizedSiteHref(item.href, language) === href);
                    if (!related) return;
                    event.preventDefault();
                    setOpened(related);
                  }}
                >
                  {opened.contentHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: opened.contentHtml }} />
                  ) : (
                    <p>{opened.description}</p>
                  )}
                </RichText>
                {opened.media && (
                  <figure className={styles.media}>
                    <PublicImage {...opened.media} />
                    <Text
                      as="figcaption"
                      variant={TextVariant.Reading}
                      textRole={TextRole.Caption}
                      wrap
                    >
                      {opened.media.caption}
                    </Text>
                    {opened.media.credit && (
                      <a href={opened.media.credit.href} target="_blank" rel="noopener noreferrer">
                        {opened.media.credit.label}
                      </a>
                    )}
                  </figure>
                )}
              </ScrollArea>
              <div className={styles.windowActions}>
                <Button
                  href={
                    opened.href.startsWith("/tools/")
                      ? localizedSiteHref(opened.href, language)
                      : "/editor"
                  }
                  slots={{}}
                >
                  {opened.href.startsWith("/tools/")
                    ? text(
                        "Open tool",
                        "打开工具",
                        "ツールを開く",
                        "도구 열기",
                        "Открыть инструмент",
                        "Abrir ferramenta",
                        "Abrir herramienta",
                      )
                    : text(
                        "Open editor",
                        "打开编辑器",
                        "エディターを開く",
                        "에디터 열기",
                        "Открыть редактор",
                        "Abrir editor",
                        "Abrir editor",
                      )}
                </Button>
                <Button onClick={close} slots={{}}>
                  {text("Close", "关闭", "閉じる", "닫기", "Закрыть", "Fechar", "Cerrar")}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
