import { ARTICLES } from "$content/articles/index";
import { publicLanguage } from "$content/site/language";
import { siteApplications, siteFooterGroups, showcaseLabel } from "$content/site/navigation";
import { DOCUMENT_PAGES } from "$content/site/pages";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";

import type { DocumentContentsManager } from "$/managers/public/document-contents-manager";
import {
  SiteFooter,
  SiteMenubar,
  type SiteFooterProps,
  type SiteLanguage,
} from "@xprite/site-shell";
import { writeBrowserLanguagePreference } from "@xprite/site-shell/browser";
import {
  Button,
  Icon,
  IconKind,
  ButtonAppearance,
  StatusBar,
  Text,
  TextVariant,
  TextRole,
  ContentPadding,
  ListBox,
  ListBoxMode,
  RichText,
  SurfaceTone,
  Menubar,
  Panel,
  PanelVariant,
  type MenubarNavigationLink,
  type MenubarMenu,
  ButtonVariant,
  IconSize,
  ScrollArea,
  ScrollbarRendering,
} from "@xprite/ui";
import {
  clientRect,
  clientToLocal,
  layoutSize,
  scrollPosition,
  setScrollPosition,
} from "@xprite/ui/utils";

import "$/components/public/site-preset.module.css";
import scrollStyles from "$/public-controls.module.css";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Business markup is kept intact; shared controls own their anatomy and skin. */
export function PublicHtml({ html }: { html: string }) {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function PublicReaderScroll({
  content,
  language = "en",
}: {
  content: string;
  language?: string;
}) {
  return (
    <ScrollArea
      className={scrollStyles.documentScroll}
      scrollbarRendering={ScrollbarRendering.Browser}
      scrollX={false}
      reserveScrollbarGutter
      aria-label={language.startsWith("zh") ? "文档滚动" : "Document scroll"}
      viewportProps={{
        tabIndex: 0,
        "data-public-reader-scroll": "",
        "data-ui-scroll-region-focus": "true",
      }}
    >
      <PublicHtml html={content} />
    </ScrollArea>
  );
}

export function PublicFooter({
  language = "en",
  groups = siteFooterGroups(language),
}: {
  language?: string;
  groups?: SiteFooterProps["groups"];
}) {
  return (
    <SiteFooter
      groups={groups}
      label={language.startsWith("zh") ? "网站导航" : "Website navigation"}
    />
  );
}

export interface PublicWindowProps {
  language?: string;
  title: string;
  content: string;
  attributes?: HTMLAttributes<HTMLElement>;
  footer?: string;
  heading?: boolean;
}
export function PublicWindow({
  title,
  content,
  attributes,
  footer,
  heading,
  language,
}: PublicWindowProps) {
  return (
    <Panel
      {...attributes}
      variant={
        attributes && "data-public-contents" in attributes
          ? PanelVariant.Utility
          : PanelVariant.Document
      }
      defaultCollapsed={!!attributes && "data-public-related-window" in attributes}
      data-ui-window-priority={
        attributes && "data-public-document" in attributes ? "primary" : undefined
      }
      emphasized
      contentPadding={ContentPadding.None}
      tone={
        attributes && "data-public-directory-window" in attributes
          ? SurfaceTone.Info
          : attributes && "data-public-related-window" in attributes
            ? SurfaceTone.Accent
            : attributes && "data-public-contents" in attributes
              ? SurfaceTone.Warning
              : attributes && "data-public-folders" in attributes
                ? SurfaceTone.Accent
                : attributes && "data-public-document" in attributes
                  ? SurfaceTone.Success
                  : SurfaceTone.Neutral
      }
      title={heading ? <h1 data-public-window-heading>{title}</h1> : title}
      aria-label={title}
      footer={footer ? <PublicHtml html={footer} /> : undefined}
    >
      {attributes &&
      ("data-public-document" in attributes || "data-public-contents" in attributes) ? (
        <PublicHtml html={content} />
      ) : (
        <PublicReaderScroll content={content} language={language} />
      )}
    </Panel>
  );
}

interface PublicNavigationLink extends MenubarNavigationLink {
  icon?: "language";
}
export interface PublicNavigationProps {
  label: string;
  brandLabel: string;
  brandHref: string;
  brandImage?: string;
  language?: string;
  currentHref?: string;
  links: readonly PublicNavigationLink[];
  menus?: readonly MenubarMenu[];
}
export function PublicNavigation({
  label,
  brandLabel,
  brandHref,
  brandImage = "/menu-icon.svg",
  language = "en",
  currentHref = brandHref,
  links,
  menus = [],
}: PublicNavigationProps) {
  const chinese = language.startsWith("zh");
  const otherLanguage = links.find((link) => link.icon === "language");
  const path = currentHref.split("?")[0].replace(/^\/zh-CN(?=\/)/, "");
  const article = ARTICLES.find((article) => article.path === path);
  const documentPage = DOCUMENT_PAGES.find((page) => page.path === currentHref.split("?")[0]);
  const applicationName =
    article?.shortTitle[publicLanguage(language)] ??
    documentPage?.title ??
    (path.startsWith("/help")
      ? chinese
        ? "使用指南"
        : "User guide"
      : path.startsWith("/compare")
        ? chinese
          ? "编辑器比较"
          : "Compare"
        : showcaseLabel(language));
  const languages: readonly SiteLanguage[] | undefined = otherLanguage
    ? [
        { value: language, label: chinese ? "简体中文" : "English", href: currentHref },
        {
          value: chinese ? "en" : "zh-CN",
          label: chinese ? "English" : "简体中文",
          href: otherLanguage.href,
          onClick: (event) => {
            writeBrowserLanguagePreference(chinese ? "en" : "zh-CN");
            otherLanguage.onClick?.(event);
          },
        },
      ]
    : undefined;
  return (
    <div data-public-navigation style={{ display: "contents" }}>
      <SiteMenubar
        label={label}
        applicationName={applicationName}
        applications={siteApplications(currentHref, language)}
        language={language}
        languages={languages}
        brandImage={brandImage}
        menus={menus}
      />
      <noscript>
        <Menubar label={label} links={[{ label: brandLabel, href: brandHref }, ...links]} />
      </noscript>
    </div>
  );
}

export function PublicIcon({
  label,
  href,
  variant,
}: {
  label: string;
  href: string;
  variant: IconKind;
}) {
  return (
    <Button
      variant={ButtonVariant.Tile}
      slots={{ leading: <Icon kind={variant} size={IconSize.Large} /> }}
      compactOnSmallScreens
      text={label}
      href={href}
    />
  );
}
export function PublicButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Button href={href} slots={{}} className={className}>
      {label}
    </Button>
  );
}

export function PublicRichText({
  content,
  attributes,
}: {
  content: string;
  attributes?: HTMLAttributes<HTMLDivElement>;
}) {
  return <RichText {...attributes} dangerouslySetInnerHTML={{ __html: content }} />;
}
export function PublicIndex({
  label,
  items,
  contents,
}: {
  label: string;
  items: { label: string; href: string }[];
  contents?: DocumentContentsManager;
}) {
  const activeHref = useSyncExternalStore(
    contents?.subscribe ?? subscribeNoContents,
    contents?.getSnapshot ?? noContentsSnapshot,
    contents?.getServerSnapshot ?? noContentsSnapshot,
  );
  const viewport = useRef<HTMLDivElement>(null);
  useClientLayoutEffect(() => {
    const scroller = viewport.current;
    const link = scroller?.querySelector<HTMLElement>('a[aria-current="location"]');
    if (!scroller || !link) return;
    const rect = clientRect(link);
    const top = clientToLocal(scroller, { x: rect.left, y: rect.top }).y;
    const bottom = clientToLocal(scroller, { x: rect.left, y: rect.bottom }).y;
    const height = layoutSize(scroller).height;
    const delta = top < 0 ? top : bottom > height ? bottom - height : 0;
    if (delta) setScrollPosition(scroller, { y: scrollPosition(scroller).y + delta });
  }, [activeHref]);
  return (
    <ListBox
      mode={ListBoxMode.Navigation}
      border={false}
      aria-label={label}
      items={items}
      activeHref={activeHref ?? items[0]?.href}
      scrollbarRendering={ScrollbarRendering.Browser}
      scrollViewportRef={viewport}
      className="public-index"
      style={{ maxHeight: "100%" }}
    />
  );
}

const subscribeNoContents = () => () => {};
const noContentsSnapshot = (): string | undefined => undefined;

export function PublicStatus({
  label,
  trailing,
  href,
}: {
  label: string;
  trailing: string;
  href?: string;
}) {
  return (
    <StatusBar
      leading={
        href ? (
          <Button href={href} appearance={ButtonAppearance.Quiet} slots={{}}>
            {label}
          </Button>
        ) : (
          <Text variant={TextVariant.Reading} textRole={TextRole.Caption}>
            {label}
          </Text>
        )
      }
      trailing={
        <Text variant={TextVariant.Reading} textRole={TextRole.Caption}>
          {trailing}
        </Text>
      }
    />
  );
}
