const CONTENT_REVIEW_DATE = "2026-10-04";

export interface PublicArticle {
  collection: keyof typeof ARTICLE_COLLECTIONS;
  slug: string;
  path: string;
  title: string;
  description: string;
  summary: string;
  topic: string;
  dateModified: string;
}

export const ARTICLE_COLLECTIONS = {
  compare: {
    collection: "compare",
    path: "/compare/",
    label: "Compare",
    title: "Compare Pixel Art Editors | Xprite",
    headline: "Find an editor for the way you draw",
    description:
      "Choose a pixel art editor for your browser or iPad. Compare Aseprite, Piskel, Xprite, and tablet apps by animation, file formats, and input.",
  },
  learn: {
    collection: "learn",
    path: "/learn/",
    label: "File guides",
    title: "Aseprite File Guides: Free PNG and GIF Export | Xprite",
    headline: "Turn a sprite project into a file you can share",
    description:
      "Open an Aseprite project in your browser and export a PNG frame or GIF animation for free. Check transparency, timing, and file-size limits.",
  },
} as const;

export const ARTICLES: readonly PublicArticle[] = [
  {
    collection: "compare",
    slug: "aseprite-online",
    path: "/compare/aseprite-online/",
    title: "Aseprite Online: Open and Edit an Existing Sprite",
    description:
      "Open an existing Aseprite sprite in your browser. Compare Xprite, Novaboard, Manabit, and Pixelorama by import, editing, and the file you need afterward.",
    summary:
      "Choose a browser tool by the sprite you have and the editable project, image, or animation you need afterward.",
    topic: "Browser editing",
    dateModified: CONTENT_REVIEW_DATE,
  },
  {
    collection: "compare",
    slug: "aseprite-on-ipad",
    path: "/compare/aseprite-on-ipad/",
    title: "Aseprite on iPad: Choose a Tool for Your Desktop Project",
    description:
      "Looking for Aseprite on iPad? Compare native pixel art apps and browser editors by Apple Pencil input, animation, and .aseprite project compatibility.",
    summary:
      "Compare native iPad apps and browser workflows for Pencil input, animation, and moving projects between devices.",
    topic: "iPad and touch",
    dateModified: CONTENT_REVIEW_DATE,
  },
  {
    collection: "compare",
    slug: "piskel-alternatives",
    path: "/compare/piskel-alternatives/",
    title: "Piskel Alternatives: Choose for Animation, Files, or Touch",
    description:
      "Compare Piskel alternatives for browser pixel art, sprite animation, offline work, and Aseprite files. Choose by workflow rather than a feature count.",
    summary:
      "Choose a next editor based on the files you use, the animation you make, and whether you need browser or desktop work.",
    topic: "Editor alternatives",
    dateModified: CONTENT_REVIEW_DATE,
  },
  {
    collection: "learn",
    slug: "aseprite-to-gif",
    path: "/learn/aseprite-to-gif/",
    title: "Aseprite to GIF: Export Sprite Animations Online Free",
    description:
      "Convert an Aseprite animation to GIF free in your browser. Choose a tag, check frame timing and transparency, and download without uploading your project.",
    summary:
      "Export a whole animation or one tag; understand GIF color, transparency, timing, and memory limits before sharing.",
    topic: "Animation export",
    dateModified: "2026-10-05",
  },
  {
    collection: "learn",
    slug: "aseprite-to-png",
    path: "/learn/aseprite-to-png/",
    title: "Aseprite to PNG: Export a Transparent Sprite Frame Free",
    description:
      "Convert an Aseprite file to a transparent PNG frame free online. Pick a frame and visible layers, keep original dimensions, and download locally.",
    summary:
      "Extract one transparent frame from a layered sprite without installing a desktop editor or changing the original project.",
    topic: "Transparent images",
    dateModified: "2026-10-05",
  },
];

export const ARTICLE_PATHS: readonly string[] = [
  ...Object.values(ARTICLE_COLLECTIONS).map((collection) => collection.path),
  ...ARTICLES.map((article) => article.path),
];

export const ARTICLE_REDIRECTS: Readonly<Record<string, string>> = Object.fromEntries(
  ARTICLE_PATHS.flatMap((path) => [
    [path.slice(0, -1), path],
    [`${path}index.html`, path],
  ]),
);
