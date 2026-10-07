export const MINIMUM_SIMILARITY = 1;
export const PIXELMATCH_THRESHOLD = 0;
export const layouts = [
  { name: "wide", width: 1440, height: 900 },
  { name: "compact", width: 390, height: 844 },
];
export const pages = [
  { name: "tools", path: "/tools/", rootId: "tools-root" },
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
