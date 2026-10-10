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
const pages = [
  {
    name: "editor",
    path: "/",
    ready: "#root .xse-root",
    regions: [{ name: "page", selectors: ["#xse-startup", "#root"] }],
  },
  ...["en", "zh-CN"].map((language) => ({
    name: `showcase-${language}`,
    path: `/showcase/${language}/`,
    ready: "[data-showcase-desktop]",
    regions: [pageRegion, { name: "main", selectors: ["main"] }],
  })),
  ...["en", "zh-CN"].map((language) => ({
    name: `help-${language}`,
    path: `/help/${language}/`,
    ready: publicReady,
    regions: [...articleRegions, { name: "contents", selectors: ['[data-public-island="index"]'] }],
  })),
  { name: "learn", path: "/learn/", ready: publicReady, regions: publicRegions },
  { name: "compare", path: "/compare/", ready: publicReady, regions: publicRegions },
  {
    name: "article",
    path: "/compare/aseprite-online/",
    ready: publicReady,
    regions: articleRegions,
  },
  ...[
    ["tools", "/tools/", "tools-root"],
    ["viewer", "/tools/viewer/", "viewer-root"],
    ["gif-sheet", "/tools/gif-to-sprite-sheet/", "gif-sheet-root"],
    ["animal-crossing", "/tools/animal-crossing-qr/", "animal-crossing-root"],
  ].map(([name, path, rootId]) => ({
    name,
    path,
    ready: `#${rootId}[data-tool-ready]`,
    regions: [
      { name: "page", selectors: [`#${rootId}`] },
      { name: "navigation", selectors: [`#${rootId} header`] },
      { name: "main", selectors: [`#${rootId} main`] },
    ],
  })),
  ...["macintosh", "aseprite"].map((theme) => ({
    name: `gallery-${theme}`,
    path: "/gallery/",
    galleryTheme: theme,
    ready: "#root[data-gallery-ready] main",
    regions: [{ name: "page", selectors: ["#gallery-startup", "#root"] }],
  })),
];

export const CPU_SLOWDOWN = 4;
export const READY_OBSERVATION_MILLISECONDS = 500;
export const MINIMUM_READY_FRAMES = 10;
export const STARTUP_TIMEOUT_MILLISECONDS = 60000;
export const scenes = pages.flatMap((page) =>
  layouts.flatMap((layout) =>
    appearances.map((appearance) => ({
      id: `${page.name}-${layout.name}-${appearance.name}`,
      page,
      layout,
      appearance,
    })),
  ),
);
