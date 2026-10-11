export const MINIMUM_SIMILARITY = 1;
export const PIXELMATCH_THRESHOLD = 0;
export const layouts = [
  { name: "wide", width: 1440, height: 900 },
  { name: "compact", width: 390, height: 844 },
];
export const pages = [
  { name: "features", path: "/about/features/", publicPage: true },
  { name: "viewer", path: "/tools/viewer/", rootId: "viewer-root" },
  { name: "gif-sheet", path: "/tools/gif-to-sprite-sheet/", rootId: "gif-sheet-root" },
  { name: "animal-crossing", path: "/tools/animal-crossing-qr/", rootId: "animal-crossing-root" },
];
export const appearances = [
  { name: "light", saved: "light", system: "dark", resolved: "light" },
  { name: "dark", saved: "dark", system: "light", resolved: "dark" },
  { name: "system-light", saved: "system", system: "light", resolved: "light" },
  { name: "system-dark", saved: "system", system: "dark", resolved: "dark" },
];

const selectedCoverage = [
  { language: "zh-CN", layout: layouts[0], appearance: appearances[0] },
  { language: "en", layout: layouts[1], appearance: appearances[1] },
  { language: "zh-CN", layout: layouts[0], appearance: appearances[1] },
  { language: "en", layout: layouts[1], appearance: appearances[0] },
];

export const scenes = pages.map((page, index) => {
  const coverage = selectedCoverage[index];
  const languagePath =
    coverage.language === "en"
      ? page.path
      : page.publicPage
        ? `/zh-CN${page.path}`
        : `${page.path}?lang=zh-CN`;
  return {
    id: `${page.name}-${coverage.language}-${coverage.layout.name}-${coverage.appearance.name}`,
    page: { ...page, language: coverage.language, path: languagePath },
    layout: coverage.layout,
    appearance: coverage.appearance,
  };
});
