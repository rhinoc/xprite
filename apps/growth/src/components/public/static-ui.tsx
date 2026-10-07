import { siteApplications } from "$content/navigation/index";
import { type HTMLAttributes, type ReactNode } from "react";

import { SiteMenubar } from "@xprite/site-shell";
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
  NavigationList,
  RichText,
  SurfaceTone,
  PanelWindowChrome,
  Menubar,
  Panel,
  PanelVariant,
  PanelWindowKind,
  type MenubarNavigationLink,
  type MenubarMenu,
  ButtonVariant,
  IconSize,
} from "@xprite/ui";

import "$/components/public/site-preset.module.css";

/** Business markup is kept intact; shared controls own their anatomy and skin. */
export function PublicHtml({ html }: { html: string }) {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface PublicWindowProps {
  title: string;
  content: string;
  attributes?: HTMLAttributes<HTMLElement>;
  footer?: string;
  heading?: boolean;
}
export function PublicWindow({ title, content, attributes, footer, heading }: PublicWindowProps) {
  return (
    <Panel
      {...attributes}
      variant={PanelVariant.Window}
      windowKind={
        attributes && "data-public-contents" in attributes
          ? PanelWindowKind.Utility
          : attributes && "data-public-error-window" in attributes
            ? PanelWindowKind.Dialog
            : PanelWindowKind.Document
      }
      collapsible={!(attributes && "data-public-error-window" in attributes)}
      defaultCollapsed={!!attributes && "data-public-related-window" in attributes}
      data-ui-window-priority={
        attributes && "data-public-document" in attributes ? "primary" : undefined
      }
      windowChrome={PanelWindowChrome.Emphasized}
      contentPadding={
        attributes && "data-public-error-window" in attributes ? 24 : ContentPadding.None
      }
      tone={
        attributes && "data-public-directory-window" in attributes
          ? SurfaceTone.Informative
          : attributes && "data-public-related-window" in attributes
            ? SurfaceTone.Accent
            : attributes && "data-public-error-window" in attributes
              ? SurfaceTone.Warning
              : attributes && "data-public-contents" in attributes
                ? SurfaceTone.Warning
                : attributes && "data-public-folders" in attributes
                  ? SurfaceTone.Accent
                  : attributes && "data-public-document" in attributes
                    ? SurfaceTone.Positive
                    : SurfaceTone.Neutral
      }
      title={heading ? <h1 data-public-window-heading>{title}</h1> : title}
      aria-label={title}
      footer={footer ? <PublicHtml html={footer} /> : undefined}
    >
      <PublicHtml html={content} />
    </Panel>
  );
}

interface PublicNavigationLink extends MenubarNavigationLink {
  icon?: "help" | "language";
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
  leadingContent?: ReactNode;
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
  leadingContent,
}: PublicNavigationProps) {
  const chinese = language.startsWith("zh");
  const otherLanguage = links.find((link) => link.icon === "language");
  const help = links.find((link) => link.icon === "help");
  const applicationName = currentHref.startsWith("/help")
    ? chinese
      ? "使用指南"
      : "User guide"
    : currentHref.startsWith("/learn")
      ? chinese
        ? "文件导出指南"
        : "File guides"
      : currentHref.startsWith("/compare")
        ? chinese
          ? "工具比较"
          : "Compare"
        : chinese
          ? "设备演示"
          : "Device demos";
  const languages = otherLanguage
    ? [
        { value: language, label: chinese ? "简体中文" : "English", href: currentHref },
        {
          value: chinese ? "en" : "zh-CN",
          label: chinese ? "English" : "简体中文",
          href: otherLanguage.href,
          onClick: otherLanguage.onClick,
        },
      ]
    : undefined;
  return (
    <div data-public-navigation style={{ display: "contents" }}>
      <SiteMenubar
        label={label}
        applicationName={applicationName}

        applications={siteApplications(currentHref, language, import.meta.env.DEV, help?.href)}
        language={language}
        languages={languages}
        brandImage={brandImage}
        menus={menus}
        leadingContent={leadingContent}
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
}: {
  label: string;
  items: { label: string; href: string }[];
}) {
  return (
    <NavigationList
      aria-label={label}
      items={items}
      className="public-index"
      style={{ maxHeight: "var(--public-index-height, calc(100svh - 200px))" }}
    />
  );
}

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
