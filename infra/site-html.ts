import type { Plugin } from "vite";

export enum SiteIconStyle {
  Website = "website",
  Editor = "editor",
}

const SITE_ICONS_PLACEHOLDER = "<!-- xprite-site-icons -->";
const WEBSITE_ICON_PATH = "menu-icon.svg";
const TOUCH_ICON_PATH = "icon-192.png?v=xprite-3";
const EDITOR_ICON_VERSION = "v=xprite-2";
const CHARSET_ELEMENT_PATTERN = /<meta\b[^>]*\bcharset\s*=[^>]*>/i;

/** Keep the encoding declaration ahead of large first-paint scripts. */
export function prependSiteHeadContent(html: string, content: string): string {
  if (!CHARSET_ELEMENT_PATTERN.test(html)) throw new Error("Site HTML must declare its charset");
  return html.replace(CHARSET_ELEMENT_PATTERN, (charset) => `${charset}\n${content}`);
}

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

/** Vite's injected bundle stylesheets: `<link rel="stylesheet" crossorigin href="<base>assets/…css">`. */
const BUNDLE_STYLESHEET_PATTERN =
  /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="[^"]*\/assets\/[^"]+\.css")(?![^>]*\bmedia=)[^>]*?\s*\/?>/g;

/**
 * Load bundled stylesheets without blocking first paint. Prerendered growth pages ship
 * their first-paint CSS separately (growth-desktop.css); the bundle CSS (~130 KB of shared
 * UI rules) only matters once scripts run, yet it held back FCP. The link keeps its
 * document position, so the cascade is unchanged once it applies. Tools pages keep
 * blocking CSS: their empty-stage layout depends on it and would shift.
 */
export function deferStylesheets(html: string): string {
  return html.replace(BUNDLE_STYLESHEET_PATTERN, (link) =>
    link.replace(/\s*\/?>$/, ` media="print" onload="this.media='all'">`),
  );
}

export function deferredBundleStylesheets(): Plugin {
  return {
    name: "xprite-deferred-bundle-stylesheets",
    apply: "build",
    transformIndexHtml: { order: "post", handler: deferStylesheets },
  };
}
