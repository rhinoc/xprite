import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { siteServingConfiguration } from "../../apps/growth/build/routing/site-configuration.ts";
import { applyEditorSearchMetadata } from "../../apps/growth/build/seo/index.ts";
import { SITE_PAGES, SitePageKind } from "../../apps/growth/content/site/pages.ts";
import { mergeSiteOutputs } from "../../infra/site-assembly.ts";
import { checkAssetVersions } from "../check/check-asset-versions.mjs";
import { toolPages } from "./tool-pages.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const editorOutput = resolve(repositoryRoot, "apps/editor/dist");
const growthOutput = resolve(repositoryRoot, "apps/growth/dist");
const componentsOutput = resolve(repositoryRoot, "apps/components/dist");
const toolsOutput = resolve(repositoryRoot, "apps/tools/dist");
const siteOutput = resolve(repositoryRoot, ".tmp/site");
const INDEX_FILENAME = "index.html";
const indexable = process.env.EDGEONE_ENV !== "preview";
const project = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));

// Require all independently built entry points before replacing the combined artifact.
const [editorHtml, tools] = await Promise.all([
  readFile(resolve(editorOutput, INDEX_FILENAME), "utf8"),
  toolPages(toolsOutput, project.version, indexable),
  readFile(resolve(componentsOutput, INDEX_FILENAME), "utf8"),
  ...SITE_PAGES.filter((page) =>
    [
      SitePageKind.Showcase,
      SitePageKind.Guide,
      SitePageKind.Article,
      SitePageKind.Document,
    ].includes(page.kind),
  ).map(({ path }) => readFile(resolve(growthOutput, `.${path}`, INDEX_FILENAME), "utf8")),
]);

await rm(siteOutput, { recursive: true, force: true });
await mkdir(siteOutput, { recursive: true });
// Fails before copying when two apps would write different bytes to one path.
await mergeSiteOutputs(siteOutput, [
  { label: "editor", directory: editorOutput },
  { label: "growth", directory: growthOutput },
  { label: "tools", directory: toolsOutput, prefix: "tools" },
  { label: "components", directory: componentsOutput, prefix: "components" },
]);
await writeFile(
  resolve(siteOutput, INDEX_FILENAME),
  applyEditorSearchMetadata(editorHtml, project.version, indexable),
);
// English tool pages replace the tools app's copies; localized pages get their own folders.
for (const { path, html } of tools) {
  await mkdir(resolve(siteOutput, `.${path}`), { recursive: true });
  await writeFile(resolve(siteOutput, `.${path}`, INDEX_FILENAME), html);
}

const configuration = JSON.parse(await readFile(resolve(repositoryRoot, "edgeone.json"), "utf8"));
await writeFile(
  resolve(siteOutput, "edgeone.json"),
  `${JSON.stringify(siteServingConfiguration(configuration), null, 2)}\n`,
);

// Each app versions its own stable-name assets; the combined site must have none left.
await checkAssetVersions(siteOutput);

console.log("Independent editor, growth, tools, and components outputs assembled in .tmp/site.");
