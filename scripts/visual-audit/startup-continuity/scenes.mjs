import { appearances, layouts } from "../tools-startup/scenes.mjs";

const pageRegion = { name: "page", selectors: ["#root"] };
const publicRegions = [
  { name: "navigation", selectors: ['[data-public-island="navigation"]'] },
  { name: "main", selectors: ["main"] },
];
const publicReady = "html[data-public-controls-ready]";
const articleRegions = [
  ...publicRegions,
  { name: "document", selectors: ["[data-public-document-content]"] },
];
const showcasePage = (language) => ({
  name: `showcase-${language}`,
  path: language === "en" ? "/about/" : "/zh-CN/about/",
  ready: "[data-showcase-desktop]",
  regions: [pageRegion, { name: "main", selectors: ["main"] }],
});
const guidePage = (language) => ({
  name: `help-${language}`,
  path: language === "en" ? "/help/" : "/zh-CN/help/",
  ready: publicReady,
  regions: [...articleRegions, { name: "contents", selectors: ['[data-public-island="index"]'] }],
});
const articlePage = (language) => ({
  name: `article-${language}`,
  path: language === "en" ? "/compare/aseprite-online/" : "/zh-CN/compare/aseprite-online/",
  ready: publicReady,
  regions: articleRegions,
});
const representativePages = [
  {
    name: "editor",
    path: "/",
    ready: "#root .xse-root",
    regions: [{ name: "page", selectors: ["#xse-startup", "#root"] }],
  },
  showcasePage("zh-CN"),
  guidePage("zh-CN"),
  { name: "learn", path: "/learn/", ready: publicReady, regions: publicRegions },
  articlePage("zh-CN"),
  { name: "document", path: "/zh-CN/privacy/", ready: publicReady, regions: articleRegions },
  ...["macintosh", "aseprite"].map((theme) => ({
    name: `gallery-${theme}`,
    path: "/components/",
    galleryTheme: theme,
    ready: "#root[data-gallery-ready] main",
    regions: [{ name: "page", selectors: ["#gallery-startup", "#root"] }],
  })),
];
const SYSTEM_APPEARANCE = "system";
const WIDE_LAYOUT = "wide";
const LIGHT_APPEARANCE = "light";
const systemRepresentatives = new Set(["editor", "showcase-zh-CN", "gallery-macintosh"]);
const savedAppearances = appearances.filter(({ saved }) => saved !== SYSTEM_APPEARANCE);
const systemAppearances = appearances.filter(({ saved }) => saved === SYSTEM_APPEARANCE);
const wide = layouts.find(({ name }) => name === WIDE_LAYOUT);
const light = appearances.find(({ name }) => name === LIGHT_APPEARANCE);
const scene = (page, layout, appearance) => ({
  id: `${page.name}-${layout.name}-${appearance.name}`,
  page,
  layout,
  appearance,
});

export const CPU_SLOWDOWN = 4;
export const READY_OBSERVATION_MILLISECONDS = 500;
export const MINIMUM_READY_FRAMES = 10;
export const STARTUP_TIMEOUT_MILLISECONDS = 60000;
/** All template, bootstrap and language samples are required on every run. */
export const scenes = [
  ...representativePages.flatMap((page) =>
    layouts.flatMap((layout) =>
      savedAppearances.map((appearance) => scene(page, layout, appearance)),
    ),
  ),
  ...representativePages
    .filter(({ name }) => systemRepresentatives.has(name))
    .flatMap((page) => systemAppearances.map((appearance) => scene(page, wide, appearance))),
  ...[showcasePage("en"), guidePage("en"), articlePage("en")].map((page) =>
    scene(page, wide, light),
  ),
];
