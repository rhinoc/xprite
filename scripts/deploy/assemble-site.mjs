import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyEditorSearchMetadata,
  applyGifSheetSearchMetadata,
  applyAnimalCrossingSearchMetadata,
  applyViewerSearchMetadata,
  applyToolsHomeSearchMetadata,
} from "../../apps/growth/build/seo.ts";
import { ARTICLE_PATHS } from "../../apps/growth/content/articles/index.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const editorOutput = resolve(repositoryRoot, "apps/editor/dist");
const growthOutput = resolve(repositoryRoot, "apps/growth/dist");
const galleryOutput = resolve(repositoryRoot, "apps/gallery/dist");
const toolsOutput = resolve(repositoryRoot, "apps/tools/dist");
const siteOutput = resolve(repositoryRoot, ".tmp/site");
const INDEX_FILENAME = "index.html";
const indexable = process.env.EDGEONE_ENV !== "preview";
const project = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));

// Require all independently built entry points before replacing the combined artifact.
const [editorHtml, viewerHtml, gifSheetHtml, toolsHtml, animalCrossingHtml] = await Promise.all([
  readFile(resolve(editorOutput, INDEX_FILENAME), "utf8"),
  readFile(resolve(toolsOutput, "viewer", INDEX_FILENAME), "utf8"),
  readFile(resolve(toolsOutput, "gif-to-sprite-sheet", INDEX_FILENAME), "utf8"),
  readFile(resolve(toolsOutput, INDEX_FILENAME), "utf8"),
  readFile(resolve(toolsOutput, "animal-crossing-qr", INDEX_FILENAME), "utf8"),
  readFile(resolve(galleryOutput, INDEX_FILENAME), "utf8"),
  readFile(resolve(growthOutput, "showcase/en/index.html"), "utf8"),
  readFile(resolve(growthOutput, "showcase/zh-CN/index.html"), "utf8"),
  readFile(resolve(growthOutput, "help/en/index.html"), "utf8"),
  readFile(resolve(growthOutput, "help/zh-CN/index.html"), "utf8"),
  ...ARTICLE_PATHS.map((path) =>
    readFile(resolve(growthOutput, `.${path}`, INDEX_FILENAME), "utf8"),
  ),
]);

await rm(siteOutput, { recursive: true, force: true });
await mkdir(siteOutput, { recursive: true });
await cp(editorOutput, siteOutput, { recursive: true });
await cp(growthOutput, siteOutput, { recursive: true });
await cp(toolsOutput, resolve(siteOutput, "tools"), { recursive: true });
await cp(galleryOutput, resolve(siteOutput, "gallery"), { recursive: true });
await writeFile(
  resolve(siteOutput, INDEX_FILENAME),
  applyEditorSearchMetadata(editorHtml, project.version, indexable),
);
await writeFile(
  resolve(siteOutput, "tools", "viewer", INDEX_FILENAME),
  applyViewerSearchMetadata(viewerHtml, project.version, indexable),
);

await writeFile(
  resolve(siteOutput, "tools", "gif-to-sprite-sheet", INDEX_FILENAME),
  applyGifSheetSearchMetadata(gifSheetHtml, project.version, indexable),
);

await writeFile(
  resolve(siteOutput, "tools", INDEX_FILENAME),
  applyToolsHomeSearchMetadata(toolsHtml, indexable),
);

await writeFile(
  resolve(siteOutput, "tools", "animal-crossing-qr", INDEX_FILENAME),
  applyAnimalCrossingSearchMetadata(animalCrossingHtml, project.version, indexable),
);

console.log("Independent editor, growth, tools, and gallery outputs assembled in .tmp/site.");
