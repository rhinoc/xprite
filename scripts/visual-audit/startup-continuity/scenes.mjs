import { appearances, layouts } from "../tools-startup/scenes.mjs";

const localized = (path, language) => (language === "en" ? path : `/${language}${path}`);
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
  path: localized("/about/", language),
  language,
  ready: "[data-showcase-desktop]",
  regions: [pageRegion, { name: "main", selectors: ["main"] }],
});
const guidePage = (language) => ({
  name: `help-${language}`,
  path: localized("/help/", language),
  language,
  ready: publicReady,
  regions: [...articleRegions, { name: "contents", selectors: ['[data-public-island="index"]'] }],
});
const featureDirectoryPage = (language) => ({
  name: `features-${language}`,
  path: localized("/about/features/", language),
  language,
  ready: publicReady,
  regions: publicRegions,
});
const articlePage = (language) => ({
  name: `article-${language}`,
  path: localized("/compare/aseprite-online/", language),
  language,
  ready: publicReady,
  regions: articleRegions,
});
const documentPage = (language) => ({
  name: `document-${language}`,
  path: localized("/privacy/", language),
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

/** Japanese and Korean check the editor once, wide and light. */
editorScenes.push(...["ja", "ko"].map((language) => scene(editorPage(language), wide, light)));

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
  scene(showcasePage("ja"), wide, light),
  scene(guidePage("ko"), compact, light),
  scene(
    articlePage("ja"),
    compact,
    appearances.find(({ name }) => name === "dark"),
  ),
  scene(documentPage("ko"), wide, light),
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
