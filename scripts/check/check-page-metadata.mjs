// Fails when a public page's <title> or meta description is missing, duplicated or
// outside the search snippet limits in infra/page-metadata.ts, or when its JSON-LD does not
// parse or a FAQPage disagrees with the visible FAQ (infra/structured-data.ts). Reads built
// HTML, so it builds the growth and tools apps first unless --no-build reuses their dist output.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPageMetadata,
  formatMetadataIssue,
  readPageMetadata,
} from "../../infra/page-metadata.ts";
import { checkStructuredData, formatStructuredDataIssue } from "../../infra/structured-data.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const SKIPPED_FILES = new Set(["404.html"]);
// scripts/deploy/assemble-site.mjs rewrites robots on these pages, so they are
// indexed in production whatever their app's own HTML says.
const ASSEMBLED_PAGES = new Set([
  "/",
  "/tools/viewer/",
  "/tools/gif-to-sprite-sheet/",
  "/tools/animal-crossing-qr/",
  "/tools/pixelate/",
]);
// Each source maps one app's HTML onto its public path prefix in .tmp/site.
const SOURCES = [
  { name: "growth", root: "apps/growth/dist", prefix: "/", built: true },
  { name: "tools", root: "apps/tools/dist", prefix: "/tools/", built: true },
  // Vite leaves the editor and components heads as written, so read the sources.
  { name: "editor", file: "apps/editor/index.html", page: "/" },
  { name: "components", file: "apps/components/index.html", page: "/components/" },
];

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "assets" ? [] : htmlFiles(path);
    return entry.name.endsWith(".html") && !SKIPPED_FILES.has(entry.name) ? [path] : [];
  });
}

function pagePath(prefix, root, file) {
  const path = relative(root, file).split(sep).join("/");
  return `${prefix}${path.replace(/(^|\/)index\.html$/, "$1")}`;
}

function build() {
  console.log("Page metadata: building growth and tools…");
  for (const script of ["build:growth", "build:tools"]) {
    const result = spawnSync(packageManager, ["run", script], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    });
    if (result.status !== 0) {
      process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
      console.error(`Page metadata check could not run ${script}.`);
      process.exit(result.status ?? 1);
    }
  }
}

function collectPages() {
  const pages = [];
  const documents = [];
  for (const source of SOURCES) {
    if (source.file) {
      const html = readFileSync(resolve(repositoryRoot, source.file), "utf8");
      const indexable = ASSEMBLED_PAGES.has(source.page) || undefined;
      pages.push(readPageMetadata(html, source.page, { indexable }));
      continue;
    }
    const root = resolve(repositoryRoot, source.root);
    if (!existsSync(root)) throw Error(`${source.root} is missing; build ${source.name} first.`);
    for (const file of htmlFiles(root)) {
      const page = pagePath(source.prefix, root, file);
      const indexable = ASSEMBLED_PAGES.has(page) || undefined;
      const html = readFileSync(file, "utf8");
      pages.push(readPageMetadata(html, page, { indexable }));
      documents.push({ page, html });
    }
  }
  return { pages, documents };
}

if (!process.argv.includes("--no-build")) build();
const started = performance.now();
const { pages, documents } = collectPages();
const issues = checkPageMetadata(pages);
const structuredData = checkStructuredData(documents);
const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");
for (const issue of [...errors, ...warnings]) {
  (issue.severity === "error" ? console.error : console.warn)(formatMetadataIssue(issue));
}
const indexed = pages.filter((page) => page.indexable).length;
const elapsed = Math.round(performance.now() - started);
console.log(
  `Page metadata: ${indexed} indexable pages, ${errors.length} errors, ${warnings.length} warnings (${elapsed} ms).`,
);
for (const issue of structuredData.issues) console.error(formatStructuredDataIssue(issue));
console.log(
  `Structured data: ${structuredData.blocks} JSON-LD blocks, ${structuredData.faqPages} FAQPage (${structuredData.questions} questions), ${structuredData.issues.length} errors.`,
);
if (errors.length) {
  console.error("Fix titles and descriptions per apps/growth/AGENTS.md (Search metadata).");
  process.exitCode = 1;
}
if (structuredData.issues.length) {
  console.error("Fix JSON-LD per apps/growth/AGENTS.md (Search metadata).");
  process.exitCode = 1;
}
