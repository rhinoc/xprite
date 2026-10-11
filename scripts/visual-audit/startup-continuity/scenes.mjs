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
const editorPage = (language) => ({
  name: `editor-${language}`,
  path: "/",
  language,
  ready: "#root .xse-root",
  regions: [{ name: "page", selectors: ["#xse-startup", "#root"] }],
});
const showcasePage = (language) => ({
  name: `showcase-${language}`,
  path: language === "en" ? "/about/" : "/zh-CN/about/",
  language,
  ready: "[data-showcase-desktop]",
  regions: [pageRegion, { name: "main", selectors: ["main"] }],
});
const guidePage = (language) => ({
  name: `help-${language}`,
  path: language === "en" ? "/help/" : "/zh-CN/help/",
  language,
  ready: publicReady,
  regions: [...articleRegions, { name: "contents", selectors: ['[data-public-island="index"]'] }],
});
const featureDirectoryPage = (language) => ({
  name: `features-${language}`,
  path: language === "en" ? "/about/features/" : "/zh-CN/about/features/",
  language,
  ready: publicReady,
  regions: publicRegions,
});
const articlePage = (language) => ({
  name: `article-${language}`,
  path: language === "en" ? "/compare/aseprite-online/" : "/zh-CN/compare/aseprite-online/",
  language,
  ready: publicReady,
  regions: articleRegions,
});
const documentPage = (language) => ({
  name: `document-${language}`,
  path: language === "en" ? "/privacy/" : "/zh-CN/privacy/",
  language,
  ready: publicReady,
  regions: articleRegions,
});

const SYSTEM_APPEARANCE = "system";
const WIDE_LAYOUT = "wide";
const LIGHT_APPEARANCE = "light";
const wide = layouts.find(({ name }) => name === WIDE_LAYOUT);
const compact = layouts.find(({ name }) => name !== WIDE_LAYOUT);
const savedAppearances = appearances.filter(({ saved }) => saved !== SYSTEM_APPEARANCE);
const systemAppearances = appearances.filter(({ saved }) => saved === SYSTEM_APPEARANCE);
const light = appearances.find(({ name }) => name === LIGHT_APPEARANCE);
const scene = (page, layout, appearance) => ({
  id: `${page.name}-${layout.name}-${appearance.name}`,
  page,
  layout,
  appearance,
});

const editorScenes = ["en", "zh-CN"].flatMap((language) => {
  const page = editorPage(language);
  return [
    ...layouts.flatMap((layout) =>
      savedAppearances.map((appearance) => scene(page, layout, appearance)),
    ),
    ...systemAppearances.map((appearance) => scene(page, wide, appearance)),
  ];
});

const aboutPage = showcasePage("zh-CN");
const aboutScenes = [
  ...layouts.flatMap((layout) =>
    savedAppearances.map((appearance) => scene(aboutPage, layout, appearance)),
  ),
  ...systemAppearances.map((appearance) => scene(aboutPage, wide, appearance)),
];

/** Other page templates alternate locale, viewport and appearance. */
const representativeScenes = [
  scene(guidePage("zh-CN"), compact, light),
  scene(
    featureDirectoryPage("en"),
    wide,
    appearances.find(({ name }) => name === "dark"),
  ),
  scene(articlePage("en"), compact, light),
  scene(
    documentPage("zh-CN"),
    wide,
    appearances.find(({ name }) => name === "dark"),
  ),
  ...["macintosh", "aseprite"].map((theme, index) =>
    scene(
      {
        name: `components-${theme}`,
        path: "/components/",
        ready: "#root[data-components-ready] main",
        regions: [{ name: "page", selectors: ["#components-startup", "#root"] }],
        componentsTheme: theme,
      },
      index === 0 ? wide : compact,
      index === 0 ? light : appearances.find(({ name }) => name === "dark"),
    ),
  ),
];

export const CPU_SLOWDOWN = 4;
export const READY_OBSERVATION_MILLISECONDS = 500;
export const MINIMUM_READY_FRAMES = 10;
export const STARTUP_TIMEOUT_MILLISECONDS = 60000;
/** Editor and About retain wide/compact coverage; editor also covers both locales. */
export const scenes = [...editorScenes, ...aboutScenes, ...representativeScenes];
