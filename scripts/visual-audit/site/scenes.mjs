import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { featureGroups } from "../../../apps/growth/build/pages/feature-directory.ts";
import { FEATURES_PATH } from "../../../apps/growth/content/features/index.ts";
import { featureMedia } from "../../../apps/growth/content/features/media.ts";
import { PublicLanguage, localizedSiteHref } from "../../../apps/growth/content/site/language.ts";
import { SITE_PAGES, SitePageKind } from "../../../apps/growth/content/site/pages.ts";
import { layouts, appearances, pages as startupPages } from "../tools-startup/scenes.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const toolRoots = new Map(
  startupPages.filter((page) => !page.publicPage).map((page) => [page.path, page.rootId]),
);
const PUBLIC_READY = "html[data-public-controls-ready]";
const publicRegions = [
  { name: "navigation", selector: "header" },
  { name: "main", selector: "main" },
];
const light = appearances.find((appearance) => appearance.name === "light");
const dark = appearances.find((appearance) => appearance.name === "dark");
const wide = layouts.find((layout) => layout.name === "wide");
const compact = layouts.find((layout) => layout.name === "compact");
const toolLanguages = new Map([
  ["/tools/viewer/", PublicLanguage.English],
  ["/tools/gif-to-sprite-sheet/", PublicLanguage.SimplifiedChinese],
  ["/tools/pixelate/", PublicLanguage.English],
  ["/tools/animal-crossing-qr/", PublicLanguage.English],
  ["/tools/fuse-beads/", PublicLanguage.SimplifiedChinese],
]);

function canonicalPath(path) {
  return path.replace(/^\/(?:zh-CN|ja|ko|ru|pt-BR|es)(?=\/)/, "") || "/";
}

function routeName(path) {
  return path.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home";
}

function makeScene(page, layout, appearance, options = {}) {
  return {
    id: `${page.name}-${page.language}-${layout.name}-${appearance.name}`,
    page,
    layout,
    appearance,
    motion: "reduce",
    ...options,
  };
}

function publicRoutePage(page, language, name) {
  return {
    name,
    path: localizedSiteHref(page.path, language),
    language,
    phase: page.kind === SitePageKind.Showcase ? "ssg" : "ready",
    ready: page.kind === SitePageKind.Showcase ? "[data-showcase-static-page]" : PUBLIC_READY,
    regions: publicRegions,
  };
}

const translatedRoutes = new Map();
for (const page of SITE_PAGES.filter(
  (entry) => entry.kind !== SitePageKind.Editor && entry.kind !== SitePageKind.Tool,
)) {
  const canonical = canonicalPath(page.path);
  const group = translatedRoutes.get(canonical) ?? [];
  group.push(page);
  translatedRoutes.set(canonical, group);
}

const routeOrderKey = (path) => (path === FEATURES_PATH ? "/about/features/" : path);
const routeGroups = [...translatedRoutes.entries()].sort(([left], [right]) =>
  routeOrderKey(left).localeCompare(routeOrderKey(right)),
);
const routes = routeGroups.flatMap(([canonical, translations], index) => {
  const featureDirectoryRoute = canonical === FEATURES_PATH;
  const preferredLanguage =
    canonical === "/about/" || featureDirectoryRoute
      ? PublicLanguage.SimplifiedChinese
      : index % 2 === 0
        ? PublicLanguage.English
        : PublicLanguage.SimplifiedChinese;
  const selected =
    translations.find((page) => page.language === preferredLanguage) ?? translations[0];
  const page = publicRoutePage(
    selected,
    selected.language,
    featureDirectoryRoute ? "about-features" : routeName(canonical),
  );
  if (canonical === "/about/")
    return [
      makeScene(page, wide, light),
      makeScene(page, compact, light, {
        id: `${page.name}-${page.language}-${compact.name}-${light.name}`,
      }),
    ];
  const layout = featureDirectoryRoute ? compact : index % 2 === 0 ? wide : compact;
  const appearance = featureDirectoryRoute ? dark : index % 2 === 0 ? light : dark;
  return [makeScene(page, layout, appearance)];
});

const toolPages = SITE_PAGES.filter((page) => page.kind === SitePageKind.Tool).flatMap(
  (page, index) => {
    const language = toolLanguages.get(page.path);
    if (!language) throw Error(`No visual-audit locale selected for tool ${page.path}.`);
    const rootId = toolRoots.get(page.path);
    if (!rootId) throw Error(`No startup root registered for tool ${page.path}.`);
    const layout = index % 2 === 0 ? wide : compact;
    const appearance = index % 2 === 0 ? light : dark;
    const base = {
      name: routeName(page.path),
      path: localizedSiteHref(page.path, language),
      language,
      phase: "ready",
      ready: `#${rootId}[data-tool-ready]`,
      rootId,
      regions: publicRegions,
    };
    return [
      makeScene({ ...base, name: `${base.name}-empty` }, layout, appearance),
      makeScene(
        {
          ...base,
          name: `${base.name}-loaded`,
          action: "example",
          regions: [
            ...publicRegions,
            { name: "workspace", selector: '[data-tool-state="ready"] main' },
          ],
        },
        layout,
        appearance,
      ),
    ];
  },
);

const featureDirectory = makeScene(
  {
    name: "about-features",
    path: localizedSiteHref(FEATURES_PATH, PublicLanguage.English),
    language: PublicLanguage.English,
    phase: "ready",
    ready: PUBLIC_READY,
    regions: publicRegions,
  },
  compact,
  dark,
);

function representativeFeatureWindow(language, scrollWindow) {
  const markdown = readFileSync(
    `${root}/apps/growth/content/about/features.${language}.md`,
    "utf8",
  );
  const items = featureGroups(markdown).flatMap((group) => group.items);
  const item = scrollWindow
    ? items.find((candidate) => featureMedia(candidate.href, language))
    : items[0];
  if (!item) throw Error(`No feature-window sample is available for ${language}.`);
  const page = {
    name: `feature-window-${routeName(item.href)}`,
    path: localizedSiteHref(FEATURES_PATH, language),
    language,
    phase: "ready",
    ready: PUBLIC_READY,
    action: "feature",
    href: localizedSiteHref(item.href, language),
    regions: [...publicRegions, { name: "window", selector: '[role="dialog"]' }],
    ...(scrollWindow ? { scrollWindow: true } : {}),
  };
  return makeScene(
    page,
    language === PublicLanguage.English ? wide : compact,
    language === PublicLanguage.English ? light : dark,
  );
}

const featureWindows = [
  representativeFeatureWindow(PublicLanguage.English, false),
  representativeFeatureWindow(PublicLanguage.SimplifiedChinese, true),
];

/** Japanese and Korean mirror a few zh-CN templates: About, a compare article, the guide and a feature window. */
const cjkRoutes = [
  [PublicLanguage.Japanese, "/about/", wide, light],
  [PublicLanguage.Korean, "/about/", compact, light],
  [PublicLanguage.Japanese, "/compare/aseprite-on-ipad/", wide, light],
  [PublicLanguage.Korean, "/help/", compact, dark],
].map(([language, canonical, layout, appearance]) => {
  const selected = translatedRoutes.get(canonical)?.find((page) => page.language === language);
  if (!selected) throw Error(`No ${language} page for ${canonical}.`);
  return makeScene(publicRoutePage(selected, language, routeName(canonical)), layout, appearance);
});
const cjkFeatureWindows = [
  representativeFeatureWindow(PublicLanguage.Japanese, true),
  representativeFeatureWindow(PublicLanguage.Korean, false),
];

/** Russian, Brazilian Portuguese and Spanish add a reduced set: About, the guide, a compare article and one feature window. */
const latinCyrillicRoutes = [
  [PublicLanguage.Russian, "/about/", wide, light],
  [PublicLanguage.BrazilianPortuguese, "/help/", compact, light],
  [PublicLanguage.Spanish, "/compare/aseprite-online/", compact, dark],
].map(([language, canonical, layout, appearance]) => {
  const selected = translatedRoutes.get(canonical)?.find((page) => page.language === language);
  if (!selected) throw Error(`No ${language} page for ${canonical}.`);
  return makeScene(publicRoutePage(selected, language, routeName(canonical)), layout, appearance);
});
const latinCyrillicFeatureWindows = [representativeFeatureWindow(PublicLanguage.Russian, false)];

const footers = [
  makeScene(
    {
      name: "site-footer",
      path: localizedSiteHref(FEATURES_PATH, PublicLanguage.English),
      language: PublicLanguage.English,
      phase: "ready",
      ready: PUBLIC_READY,
      action: "footer",
      regions: [{ name: "footer", selector: "[data-site-footer]" }],
    },
    wide,
    light,
  ),
  makeScene(
    {
      name: "site-footer",
      path: localizedSiteHref(FEATURES_PATH, PublicLanguage.SimplifiedChinese),
      language: PublicLanguage.SimplifiedChinese,
      phase: "ready",
      ready: PUBLIC_READY,
      action: "footer",
      regions: [{ name: "footer", selector: "[data-site-footer]" }],
    },
    compact,
    dark,
  ),
];

export const scenes = [
  ...routes,
  ...toolPages,
  featureDirectory,
  ...featureWindows,
  ...footers,
  ...cjkRoutes,
  ...cjkFeatureWindows,
  ...latinCyrillicRoutes,
  ...latinCyrillicFeatureWindows,
];
if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length)
  throw Error("Site visual scene IDs must be unique.");
