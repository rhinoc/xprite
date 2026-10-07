import type { Plugin } from "vite";

export enum SiteIconStyle {
  Website = "website",
  Editor = "editor",
}

const SITE_ICONS_PLACEHOLDER = "<!-- xprite-site-icons -->";
const WEBSITE_ICON_PATH = "menu-icon.svg";
const TOUCH_ICON_PATH = "icon-192.png?v=xprite-3";
const EDITOR_ICON_VERSION = "v=xprite-2";

/** Shared branding; root URLs stay outside each app's Vite base. */
export function siteIcons(style = SiteIconStyle.Website, base = "/"): string {
  const icons =
    style === SiteIconStyle.Editor
      ? `<link rel="icon" type="image/x-icon" href="${base}favicon.ico?${EDITOR_ICON_VERSION}" sizes="16x16 32x32">
<link rel="icon" type="image/png" href="${base}favicon-32.png?${EDITOR_ICON_VERSION}" sizes="32x32">
<link rel="icon" type="image/png" href="${base}favicon-16.png?${EDITOR_ICON_VERSION}" sizes="16x16">`
      : `<link rel="icon" type="image/svg+xml" href="${base}${WEBSITE_ICON_PATH}">`;
  return `${icons}\n<link rel="apple-touch-icon" href="${base}${TOUCH_ICON_PATH}" sizes="192x192">`;
}

export function applySiteIcons(html: string, style = SiteIconStyle.Website, base = "/"): string {
  return html.replace(SITE_ICONS_PLACEHOLDER, siteIcons(style, base));
}

export function siteHtml(style = SiteIconStyle.Website): Plugin {
  let base = "/";
  return {
    name: "xprite-site-html",
    configResolved(config) {
      // Embedded editor distributions keep their branding assets relative.
      base = style === SiteIconStyle.Editor ? config.base : "/";
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return applySiteIcons(html, style, base);
      },
    },
  };
}
