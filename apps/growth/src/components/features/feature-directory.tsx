import { FeatureIcon, type FeatureGroup, type FeatureItem } from "$content/features";
import { localizedSiteHref } from "$content/site/language";
import { useRef, useState } from "react";

import { PublicImage } from "$/components/public/public-image";
import {
  Button,
  ButtonVariant,
  ContentPadding,
  Dialog,
  Icon,
  IconKind,
  IconSize,
  Panel,
  PanelBorderStyle,
  PanelVariant,
  OverlayContentLayout,
  RichText,
  ScrollArea,
  Text,
  TextRole,
  TextVariant,
  Tooltip,
  TooltipPlacement,
} from "@xprite/ui";

import styles from "$/components/features/feature-directory.module.css";

const FEATURE_ICONS: Record<FeatureIcon, IconKind> = {
  [FeatureIcon.Application]: IconKind.Application,
  [FeatureIcon.Document]: IconKind.Document,
  [FeatureIcon.Folder]: IconKind.Folder,
  [FeatureIcon.Image]: IconKind.Image,
  [FeatureIcon.Map]: IconKind.Map,
  [FeatureIcon.NotePad]: IconKind.NotePad,
  [FeatureIcon.Search]: IconKind.Search,
};
const FEATURE_WINDOW_BOUNDS = { x: 0, y: 0, width: 640, height: 520 };
const FEATURE_WINDOW_MIN_SIZE = { width: 280, height: 220 };

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
  const chinese = language.startsWith("zh");
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
          <Panel
            key={group.id}
            variant={PanelVariant.Content}
            border={{ style: PanelBorderStyle.Single }}
            contentPadding={ContentPadding.None}
            title={
              <h2 id={group.id} className={styles.groupTitle}>
                {group.title}
              </h2>
            }
            aria-labelledby={group.id}
          >
            <nav className={styles.items} aria-label={group.title}>
              {group.items.map((item) => (
                <Tooltip key={item.title} text={item.description} placement={TooltipPlacement.Auto}>
                  <Button
                    variant={ButtonVariant.Tile}
                    slots={{
                      leading: <Icon kind={FEATURE_ICONS[item.icon]} size={IconSize.Large} />,
                    }}
                    text={item.title}
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
                      trigger.current = event.currentTarget;
                      setOpened(item);
                    }}
                  />
                </Tooltip>
              ))}
            </nav>
          </Panel>
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
          closeLabel={chinese ? `关闭${opened.title}` : `Close ${opened.title}`}
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
                    ? chinese
                      ? "打开工具"
                      : "Open tool"
                    : chinese
                      ? "打开编辑器"
                      : "Open editor"}
                </Button>
                <Button onClick={close} slots={{}}>
                  {chinese ? "关闭" : "Close"}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
