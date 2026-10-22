import { spawn } from "node:child_process";
import { appendFile, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import componentRoutes from "../../apps/components/build/generated-routes.json" with { type: "json" };
import { readOfflineManifest } from "../../apps/editor/build/offline-manifest.ts";
import { siteServingConfiguration } from "../../apps/growth/build/routing/site-configuration.ts";
import { GUIDE_PAGES } from "../../apps/growth/content/help/pages.ts";
import { SHOWCASE_PAGES } from "../../apps/growth/content/showcase/pages.ts";
import { SITE_PAGES, SitePageKind } from "../../apps/growth/content/site/pages.ts";
import {
  BEADS_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  TOOLS,
} from "../../apps/growth/content/tools/index.ts";
import { assertEdgeOneRuleLimits, compactServingRules } from "../../infra/edgeone-serving-rules.ts";
import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from "../../infra/indexnow.ts";
import {
  EDGEONE_MAX_EDGE_FUNCTION_BYTES,
  PREVIOUS_RELEASES_KEPT,
  assertEdgeOneUploadLimits,
  assetArchiveName,
  carryOverPreviousAssets,
  writeAssetArchive,
} from "../../infra/previous-release-assets.ts";
import { verifyEditorOffline } from "../build/editor-offline.mjs";
import { checkAssetVersions } from "../check/check-asset-versions.mjs";
import { previousAssetsDirectory, releaseAssetsDirectory } from "./previous-assets.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const configuration = siteServingConfiguration(
  JSON.parse(await readFile(join(repositoryRoot, "edgeone.json"), "utf8")),
);
const outputDirectory = resolve(repositoryRoot, configuration.outputDirectory);
const deploymentDirectory = join(repositoryRoot, ".tmp/deploy/editor");
const resultPath = join(repositoryRoot, ".tmp/deploy/result.json");
const MAX_CAPTURE_CHARACTERS = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const VERIFY_ATTEMPTS = 3;
const VERIFY_RETRY_MS = 3_000;
// Verification requests in flight at once. Each check is unchanged; only the order is concurrent.
const VERIFY_CONCURRENCY = Number(process.env.XPRITE_VERIFY_CONCURRENCY) || 8;
const SUPPORTED_ENVIRONMENTS = new Set(["production", "preview"]);
const SUPPORTED_AREAS = new Set(["global", "overseas"]);
const SUPPORTED_REGIONS = new Set(["US", "EU"]);
const PUBLIC_PAGE_LANGUAGES = ["en", "zh-CN"];
const MODULE_ENTRY_PATTERN =
  /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const STYLESHEET_PATTERN =
  /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
const SOCIAL_IMAGE_PATHS = ["/social-preview.png"];
const REQUIRED_DISCOVERY_FILES = [
  "robots.txt",
  "llms.txt",
  INDEXNOW_KEY_FILE,
  "menu-icon.svg",
  "favicon.ico",
  "favicon-32.png",
  "favicon-16.png",
  "icon-192.png",
  ...SOCIAL_IMAGE_PATHS.map((path) => path.slice(1)),
];
const REQUIRED_SITE_PAGES = [
  "components/index.html",
  ...SITE_PAGES.map(({ path }) => `${path.slice(1)}index.html`),
  "404.html",
];

/** Previous public addresses under /gallery/ open the current /components/ pages. */
function previousComponentAddressRedirects() {
  return componentRoutes
    .filter((path) => path !== "/components/")
    .flatMap((path) => {
      const legacy = path.replace(
        /^\/components\/(icons$)?/,
        (_, icons) => `/gallery/${icons ?? "components/"}`,
      );
      return [legacy, `${legacy}/`].map((source) => ({
        source,
        destination: path,
        statusCode: 301,
      }));
    });
}

function environmentValue(name) {
  return process.env[name]?.trim() ?? "";
}

function deploymentSettings() {
  const environment = environmentValue("EDGEONE_ENV");
  const area = environmentValue("EDGEONE_AREA");
  const name = environmentValue("EDGEONE_PROJECT_NAME") || configuration.name;
  if (!SUPPORTED_ENVIRONMENTS.has(environment))
    throw new Error("Set EDGEONE_ENV to production or preview.");
  if (!SUPPORTED_AREAS.has(area)) throw new Error("Set EDGEONE_AREA to global or overseas.");
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error("EDGEONE_PROJECT_NAME must use lowercase letters, numbers and hyphens.");
  return { environment, area, name };
}

function validateConfiguration() {
  const settings = deploymentSettings();
  if (!environmentValue("EDGEONE_API_TOKEN"))
    throw new Error("Configure the EDGEONE_API_TOKEN GitHub secret before deployment.");
  const token = environmentValue("VITE_POSTHOG_PROJECT_TOKEN");
  const region = environmentValue("VITE_POSTHOG_REGION");
  if (!SUPPORTED_REGIONS.has(region)) throw new Error("Set VITE_POSTHOG_REGION to US or EU.");
  if (settings.environment === "production" && !/^phc_[A-Za-z0-9_-]+$/.test(token))
    throw new Error("Configure the public VITE_POSTHOG_PROJECT_TOKEN for production analytics.");
  if (settings.environment === "preview" && token)
    throw new Error("Preview builds must leave VITE_POSTHOG_PROJECT_TOKEN empty.");
  const apiKey = environmentValue("POSTHOG_CLI_API_KEY");
  const projectId = environmentValue("POSTHOG_CLI_PROJECT_ID");
  if (Boolean(apiKey) !== Boolean(projectId) || (projectId && !/^\d+$/.test(projectId)))
    throw new Error(
      "Source maps require both POSTHOG_CLI_API_KEY and a numeric POSTHOG_CLI_PROJECT_ID.",
    );
  console.log(
    `Deployment configuration ready: ${settings.name}, ${settings.environment}, ${settings.area}.`,
  );
}

async function verifyStaticFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (await lstat(path)).isSymbolicLink())
      throw new Error("Deployment artifacts must not contain symbolic links.");
    if (entry.name.startsWith(".") || entry.name.endsWith(".map") || entry.name === "node_modules")
      throw new Error(`Unexpected private/build file in static output: ${entry.name}`);
    if (entry.isDirectory()) await verifyStaticFiles(path);
  }
}

const MEBIBYTE = 1024 * 1024;

function megabytes(bytes) {
  return `${(bytes / MEBIBYTE).toFixed(1)} MiB`;
}

async function appendSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
}

/**
 * Archive this build's content-hashed files for later deployments, then add the archived files
 * of the last PREVIOUS_RELEASES_KEPT production releases (downloaded by
 * `deploy:previous-assets fetch`) so open tabs of those releases can still load their chunks.
 */
async function carryOverPreviousReleases(release) {
  const ref = environmentValue("DEPLOY_REF") || release.slice(0, 12);
  await rm(releaseAssetsDirectory, { recursive: true, force: true });
  // Archive the build output, never the deployment directory: carried files are not re-archived.
  const archive = await writeAssetArchive(
    outputDirectory,
    join(releaseAssetsDirectory, assetArchiveName(ref)),
    { ref, release },
  );
  const report = await carryOverPreviousAssets(deploymentDirectory, previousAssetsDirectory, {
    currentRelease: release,
    currentRef: ref,
  });
  // The service worker precaches only the files its sealed manifest lists. Carried files must
  // stay out of it, and the manifest must still describe the bytes being published.
  const { entries } = await readOfflineManifest(deploymentDirectory);
  const precached = new Set(entries.map(({ url }) => decodeURIComponent(url)));
  const precachedCarried = report.carried.filter((path) => precached.has(path));
  if (precachedCarried.length)
    throw new Error(`Carried files must not be precached: ${precachedCarried.join(", ")}.`);
  await verifyEditorOffline(deploymentDirectory, "the deployment with previous release files");
  const archiveBytes = archive.files.reduce((total, { size }) => total + size, 0);
  const lines = [
    `Archived ${archive.files.length} content-hashed files (${megabytes(archiveBytes)}) of ${ref}.`,
    report.releases.length
      ? `Carried ${report.carried.length} files (${megabytes(report.carriedBytes)}) from ${report.releases.length} of up to ${PREVIOUS_RELEASES_KEPT} previous releases:`
      : "No previous release archives; nothing carried over.",
    ...report.releases.map(
      ({ ref: previous, added, addedBytes, identical, kept }) =>
        `  ${previous}: ${added} added (${megabytes(addedBytes)}), ${identical} unchanged` +
        (kept.length ? `, ${kept.length} kept from the newer build (different bytes)` : ""),
    ),
  ];
  console.log(lines.join("\n"));
  await appendSummary(`${lines.map((line) => line.trim()).join("\n\n")}\n\n`);
}

/** EdgeOne project file count/size limits and the middleware's edge function size. */
async function assertUploadLimits() {
  const { files, bytes } = await assertEdgeOneUploadLimits(deploymentDirectory);
  const middleware = (await lstat(join(deploymentDirectory, "middleware.js"))).size;
  if (middleware > EDGEONE_MAX_EDGE_FUNCTION_BYTES)
    throw new Error(
      `middleware.js is ${middleware} bytes; EdgeOne edge functions accept at most ${EDGEONE_MAX_EDGE_FUNCTION_BYTES}.`,
    );
  console.log(
    `Upload: ${files} files, ${megabytes(bytes)}; middleware.js ${megabytes(middleware)}.`,
  );
}

async function prepareDeployment() {
  const { preparePublicRouting } = await import("./prepare-public-routing.mjs");
  const { environment } = deploymentSettings();
  const release = environmentValue("POSTHOG_RELEASE");
  if (!/^[a-f0-9]{40}$/.test(release))
    throw new Error("Set POSTHOG_RELEASE to the actual checked-out commit SHA before building.");
  const pages = await Promise.all(
    REQUIRED_SITE_PAGES.map((page) => readFile(join(outputDirectory, page), "utf8")),
  );
  for (const [index, html] of pages.entries()) {
    const page = REQUIRED_SITE_PAGES[index];
    if (html.includes("<!-- xprite-site-icons -->"))
      throw new Error(`Shared website icons were not rendered: ${page}.`);
    const resources = [
      ...Array.from(html.matchAll(MODULE_ENTRY_PATTERN), (match) => match[1]),
      ...Array.from(html.matchAll(STYLESHEET_PATTERN), (match) => match[1]),
    ];
    for (const resource of resources) {
      const url = new URL(resource, `https://xprite.cc/${page}`);
      if (url.origin !== "https://xprite.cc")
        throw new Error(`Page entry assets must belong to the website: ${page}.`);
      if (page.startsWith("components/") && !url.pathname.startsWith("/components/"))
        throw new Error(`Component docs entry assets must use the /components/ base: ${resource}.`);
      await readFile(join(outputDirectory, decodeURIComponent(url.pathname)));
    }
  }
  await Promise.all(REQUIRED_DISCOVERY_FILES.map((file) => readFile(join(outputDirectory, file))));
  if (environment === "production") await readFile(join(outputDirectory, "sitemap.xml"));
  await verifyStaticFiles(outputDirectory);
  await checkAssetVersions(outputDirectory);
  // sw.js SRI hashes must describe the bytes being published (source map injection rewrites JS).
  await verifyEditorOffline(outputDirectory, "the deployment output");
  await rm(deploymentDirectory, { recursive: true, force: true });
  await mkdir(dirname(deploymentDirectory), { recursive: true });
  await cp(outputDirectory, deploymentDirectory, { recursive: true });
  await carryOverPreviousReleases(release);
  // Upload only serving rules; omit build/install commands to keep this package prebuilt.
  const servingConfiguration = {
    $schema: configuration.$schema,
    headers: [
      ...configuration.headers,
      ...(environment === "preview"
        ? [{ source: "/*", headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] }]
        : []),
    ],
    caches: configuration.caches,
    rewrites: [
      ...(configuration.rewrites ?? []),
      ...componentRoutes
        .filter((path) => path !== "/components/")
        .flatMap((path) => [
          { source: path, destination: "/components/index.html" },
          { source: `${path}/`, destination: "/components/index.html" },
        ]),
    ],
    redirects: [...(configuration.redirects ?? []), ...previousComponentAddressRedirects()],
  };
  if (environment === "preview") {
    await writeFile(join(deploymentDirectory, "robots.txt"), "User-agent: *\nAllow: /\n");
    await rm(join(deploymentDirectory, "sitemap.xml"), { force: true });
  }
  // EdgeOne reads at most 100 redirects and 100 rewrites; later rules are silently ignored.
  const publishedFiles = (
    await readdir(deploymentDirectory, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .map((entry) => `/${join(entry.parentPath, entry.name).slice(deploymentDirectory.length + 1)}`);
  const uploadedConfiguration = compactServingRules(servingConfiguration, publishedFiles);
  assertEdgeOneRuleLimits(uploadedConfiguration);
  await writeFile(
    join(deploymentDirectory, "edgeone.json"),
    `${JSON.stringify(uploadedConfiguration, null, 2)}\n`,
  );
  await writeFile(
    join(deploymentDirectory, "release.json"),
    `${JSON.stringify(
      {
        release,
        ref: environmentValue("DEPLOY_REF"),
        environment,
      },
      null,
      2,
    )}\n`,
  );
  await preparePublicRouting(deploymentDirectory, servingConfiguration);
  await assertUploadLimits();
  console.log(
    "Static deployment and public-route middleware prepared in .tmp/deploy/editor (no env files).",
  );
}

async function runCli(args) {
  const cli = join(repositoryRoot, "node_modules/edgeone/edgeone-dist/cli.js");
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      // Makers discovers middleware relative to the working directory.
      cwd: deploymentDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = (output + chunk.toString()).slice(-MAX_CAPTURE_CHARACTERS);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`EdgeOne CLI exited with status ${code}.`));
      for (const line of output.trim().split("\n").reverse()) {
        try {
          const result = JSON.parse(line);
          if (result.status === "success") return resolveResult(result);
          if (result.status === "error") return reject(new Error("EdgeOne deployment failed."));
        } catch {
          // The CLI also emits progress lines before its final JSON result.
        }
      }
      reject(new Error("EdgeOne did not return a successful deployment result."));
    });
  });
}

const forEachConcurrently = (items, check) => Promise.all(items.map((item) => check(item)));
let verifySlots = VERIFY_CONCURRENCY;
const verifyWaiters = [];
/**
 * fetch() limited to VERIFY_CONCURRENCY requests in flight. The REQUEST_TIMEOUT_MS timeout starts
 * once a slot is free (not while queued) and also bounds reading the body.
 */
async function verifyFetch(url) {
  if (verifySlots > 0) verifySlots--;
  else await new Promise((resolve) => verifyWaiters.push(resolve));
  try {
    return await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } finally {
    const next = verifyWaiters.shift();
    if (next) next();
    else verifySlots++;
  }
}

async function verifyPageEntryAssets(html, pageUrl, label, verifiedAssets = new Map()) {
  const scripts = Array.from(html.matchAll(MODULE_ENTRY_PATTERN), (match) => match[1]);
  if (!scripts.length) throw new Error(`${label} HTML has no JavaScript module entry.`);
  const resources = [
    ...scripts.map((path) => ({ path, contentType: "javascript" })),
    ...Array.from(html.matchAll(STYLESHEET_PATTERN), (match) => ({
      path: match[1],
      contentType: "text/css",
    })),
  ];
  await Promise.all(
    resources.map(async (resource) => {
      const assetUrl = new URL(resource.path, pageUrl);
      if (assetUrl.origin !== pageUrl.origin)
        throw new Error(`${label} entry assets must be hosted with the deployment.`);
      // Preserve the signed preview URL parameters when fetching another path.
      for (const [key, value] of pageUrl.searchParams) assetUrl.searchParams.set(key, value);
      // Pages share entry assets: the first request for an asset is awaited by every page.
      if (!verifiedAssets.has(assetUrl.href))
        verifiedAssets.set(
          assetUrl.href,
          (async () => {
            const asset = await verifyFetch(assetUrl);
            const available =
              asset.ok && (asset.headers.get("content-type") ?? "").includes(resource.contentType);
            await asset.body?.cancel();
            return { available, status: asset.status };
          })(),
        );
      const { available, status } = await verifiedAssets.get(assetUrl.href);
      if (!available)
        throw new Error(`${label} entry asset is unavailable: ${resource.path} (HTTP ${status}).`);
    }),
  );
}

function hasPageLanguage(html, language) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] === language;
}

async function verifyShowcasePages(url, environment) {
  await forEachConcurrently(PUBLIC_PAGE_LANGUAGES, async (language) => {
    const showcaseUrl = new URL(url);
    showcaseUrl.pathname = SHOWCASE_PAGES[language].path;
    const page = await verifyFetch(showcaseUrl);
    const html = await page.text();
    const label = `About page (${language})`;
    if (!page.ok || !hasPageLanguage(html, language) || !html.includes('id="root"'))
      throw new Error(`${label} page is unavailable or has an incorrect language.`);
    if (environment === "production") {
      const canonical = `https://xprite.cc${SHOWCASE_PAGES[language].path}`;
      if (!html.includes(`rel="canonical" href="${canonical}"`))
        throw new Error(`${label} has an incorrect canonical URL.`);
      for (const alternateLanguage of PUBLIC_PAGE_LANGUAGES) {
        const alternate = `https://xprite.cc${SHOWCASE_PAGES[alternateLanguage].path}`;
        if (!html.includes(`hreflang="${alternateLanguage}" href="${alternate}"`))
          throw new Error(`${label} is missing the ${alternateLanguage} language link.`);
      }
      if (!html.includes(`hreflang="x-default" href="https://xprite.cc${SHOWCASE_PAGES.en.path}"`))
        throw new Error(`${label} is missing the default language link.`);
      if (!html.includes('content="index, follow"'))
        throw new Error(`${label} must be indexable in production.`);
    } else if (
      !html.includes('content="noindex, follow"') ||
      /<link\b[^>]*\brel=["']canonical["']/i.test(html)
    ) {
      throw new Error(`${label} preview must not be indexed or have a canonical URL.`);
    }
    await verifyPageEntryAssets(html, showcaseUrl, label);
  });
}

async function verifyApplicationPages(url, environment) {
  const verifiedAssets = new Map();
  const pages = [
    { path: "/editor", root: "root", indexable: false },
    { path: "/editor/", root: "root", indexable: false },
    ...TOOLS.map((tool) => ({
      path: tool.path,
      root:
        tool.path === "/tools/viewer/"
          ? "viewer-root"
          : tool.path === GIF_SHEET_TOOL.path
            ? "gif-sheet-root"
            : tool.path === PIXELATE_TOOL.path
              ? "pixelation-root"
              : tool.path === BEADS_TOOL.path
                ? "beads-root"
                : "animal-crossing-root",
      indexable: true,
    })),
    ...componentRoutes.flatMap((path) =>
      (path.endsWith("/") ? [path] : [path, `${path}/`]).map((path) => ({
        path,
        root: "root",
        indexable: false,
      })),
    ),
  ];
  await forEachConcurrently(pages, async (entry) => {
    const pageUrl = new URL(url);
    pageUrl.pathname = entry.path;
    const response = await verifyFetch(pageUrl);
    const html = await response.text();
    if (!response.ok || !html.includes(`id="${entry.root}"`))
      throw new Error(`Application page is unavailable: ${entry.path}.`);
    if (
      entry.path.startsWith("/components/") &&
      Array.from(html.matchAll(MODULE_ENTRY_PATTERN)).some(
        (match) => !new URL(match[1], pageUrl).pathname.startsWith("/components/"),
      )
    )
      throw new Error(`Component docs route returned another application's entry: ${entry.path}.`);
    await verifyPageEntryAssets(html, pageUrl, entry.path, verifiedAssets);
    if (entry.indexable) {
      if (
        environment === "production" &&
        !html.includes(`rel="canonical" href="https://xprite.cc${entry.path}"`)
      )
        throw new Error(`Application page has an incorrect canonical URL: ${entry.path}.`);
    }
    if (
      (environment === "preview" || entry.path.startsWith("/components/")) &&
      !html.includes('content="noindex, follow"')
    )
      throw new Error(`Application page must not be indexed: ${entry.path}.`);
  });
}

async function verifySearchDiscovery(url, environment) {
  const get = (path) => {
    const target = new URL(url);
    target.pathname = path;
    return verifyFetch(target);
  };
  const [robots, llms, sitemap, indexNowKey] = await Promise.all(
    ["/robots.txt", "/llms.txt", "/sitemap.xml", `/${INDEXNOW_KEY_FILE}`].map(get),
  );
  const robotsText = await robots.text();
  if (
    !robots.ok ||
    !robots.headers.get("content-type")?.includes("text/plain") ||
    !robotsText.includes("User-agent: *")
  )
    throw new Error("robots.txt must be a plain-text crawl policy, not an application fallback.");
  const llmsText = await llms.text();
  if (
    !llms.ok ||
    !llms.headers.get("content-type")?.includes("text/plain") ||
    !llmsText.startsWith("# Xprite\n") ||
    !llmsText.includes("https://xprite.cc/tools/viewer/") ||
    !llmsText.includes(`https://xprite.cc${GIF_SHEET_TOOL.path}`)
  )
    throw new Error("llms.txt must expose the public documentation index as plain text.");
  if (
    !indexNowKey.ok ||
    !indexNowKey.headers.get("content-type")?.includes("text/plain") ||
    (await indexNowKey.text()).trim() !== INDEXNOW_KEY
  )
    throw new Error("The public IndexNow key file must be served as plain text at the site root.");
  if (environment === "production") {
    const xml = await sitemap.text();
    if (
      !robotsText.includes("Sitemap: https://xprite.cc/sitemap.xml") ||
      !sitemap.ok ||
      !sitemap.headers.get("content-type")?.includes("xml") ||
      !xml.includes("<urlset")
    )
      throw new Error("Production must serve and advertise an XML sitemap.");
    for (const { path } of SITE_PAGES.filter((page) => page.indexable))
      if (!xml.includes(`<loc>https://xprite.cc${path}</loc>`))
        throw new Error(`The canonical page is missing from the sitemap: ${path}.`);
    for (const { path } of SITE_PAGES.filter((page) => !page.indexable))
      if (xml.includes(`<loc>https://xprite.cc${path}</loc>`))
        throw new Error(`An unfinished page must not appear in the sitemap: ${path}.`);
  } else {
    await sitemap.body?.cancel();
    if (sitemap.status !== 404 || robotsText.includes("Sitemap:"))
      throw new Error("Preview deployments must not publish or advertise a sitemap.");
  }
  await forEachConcurrently(SOCIAL_IMAGE_PATHS, async (path) => {
    const response = await get(path);
    await response.body?.cancel();
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png"))
      throw new Error(`Social image is unavailable: ${path}.`);
  });
}

async function verifyDeployment(result, expected) {
  const url = new URL(result.url);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new Error("EdgeOne must return an HTTPS deployment URL.");
  const releaseUrl = new URL(url);
  releaseUrl.pathname = "/release.json";
  releaseUrl.searchParams.set("release", expected.release);
  let lastError;
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
    try {
      const response = await verifyFetch(releaseUrl);
      if (!response.ok) throw new Error(`Release verification returned HTTP ${response.status}.`);
      const actual = await response.json();
      if (actual.release !== expected.release || actual.environment !== expected.environment)
        throw new Error("The deployed release does not match the uploaded artifact.");
      const page = await verifyFetch(url);
      if (!page.ok) throw new Error(`Editor returned HTTP ${page.status}.`);
      const html = await page.text();
      const verifyGuide = async (language) => {
        const guideUrl = new URL(url);
        guideUrl.pathname = GUIDE_PAGES[language].path;
        const guide = await verifyFetch(guideUrl);
        const guideHtml = await guide.text();
        if (!guide.ok || !hasPageLanguage(guideHtml, language))
          throw new Error(`Public guide is unavailable: ${language}.`);
        const canonical = `https://xprite.cc${GUIDE_PAGES[language].path}`;
        if (
          expected.environment === "production" &&
          !guideHtml.includes(`rel="canonical" href="${canonical}"`)
        )
          throw new Error(`Public guide has an incorrect canonical URL: ${language}.`);
        if (expected.environment === "preview" && !guideHtml.includes('content="noindex, follow"'))
          throw new Error(`Preview guide must not be indexed: ${language}.`);
      };
      const verifyArticle = async ({ path, language }) => {
        const comparisonUrl = new URL(url);
        comparisonUrl.pathname = path;
        const comparison = await verifyFetch(comparisonUrl);
        const articleHtml = await comparison.text();
        const metadata =
          expected.environment === "production"
            ? `rel="canonical" href="https://xprite.cc${path}"`
            : 'content="noindex, follow"';
        if (
          !comparison.ok ||
          !hasPageLanguage(articleHtml, language) ||
          !articleHtml.includes("<h1") ||
          !articleHtml.includes(metadata)
        )
          throw new Error(`Article page is unavailable or has incorrect metadata: ${path}.`);
      };
      const verifyDocument = async ({ path, language }) => {
        const pageUrl = new URL(path, url);
        const page = await verifyFetch(pageUrl);
        const html = await page.text();
        const metadata =
          expected.environment === "production"
            ? `rel="canonical" href="https://xprite.cc${path}"`
            : 'content="noindex, follow"';
        if (
          !page.ok ||
          !hasPageLanguage(html, language) ||
          !html.includes("<h1") ||
          !html.includes(metadata)
        )
          throw new Error(`Document page is unavailable or has incorrect metadata: ${path}.`);
      };
      const verifyMissingPage = async () => {
        const missingUrl = new URL(url);
        missingUrl.pathname = `/deployment-not-found-${expected.release}`;
        const missing = await verifyFetch(missingUrl);
        if (missing.status !== 404 || !(await missing.text()).includes('id="error-title"'))
          throw new Error("Unknown paths must return the custom page with HTTP 404.");
      };
      // Everything after the release check is independent: run it concurrently.
      await Promise.all([
        verifyPageEntryAssets(html, url, "Editor"),
        forEachConcurrently(PUBLIC_PAGE_LANGUAGES, verifyGuide),
        verifyShowcasePages(url, expected.environment),
        verifyApplicationPages(url, expected.environment),
        verifySearchDiscovery(url, expected.environment),
        forEachConcurrently(
          SITE_PAGES.filter((page) => page.kind === SitePageKind.Article),
          verifyArticle,
        ),
        forEachConcurrently(
          SITE_PAGES.filter((page) => page.kind === SitePageKind.Document),
          verifyDocument,
        ),
        verifyMissingPage(),
      ]);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < VERIFY_ATTEMPTS)
        await new Promise((done) => setTimeout(done, VERIFY_RETRY_MS));
    }
  }
  throw lastError;
}

async function publishDeployment() {
  const settings = deploymentSettings();
  const token = environmentValue("EDGEONE_API_TOKEN");
  if (!token) throw new Error("Set EDGEONE_API_TOKEN before publishing.");
  const expected = JSON.parse(await readFile(join(deploymentDirectory, "release.json"), "utf8"));
  if (
    expected.environment !== settings.environment ||
    expected.release !== environmentValue("POSTHOG_RELEASE")
  )
    throw new Error("Prepare a matching artifact before publishing.");
  const result = await runCli([
    "makers",
    "deploy",
    deploymentDirectory,
    "--name",
    settings.name,
    "--token",
    token,
    "--env",
    settings.environment,
    "--area",
    settings.area,
    "--skip-ai-gateway-sync",
    "--json",
  ]);
  await writeFile(
    resultPath,
    `${JSON.stringify({ ...result, ...expected, verified: false }, null, 2)}\n`,
  );
  await verifyDeployment(result, expected);
  await writeFile(
    resultPath,
    `${JSON.stringify({ ...result, ...expected, verified: true }, null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `url=${new URL(result.url).href}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const url = new URL(result.url).href.replaceAll("(", "%28").replaceAll(")", "%29");
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Deployed **${settings.name}** (${settings.environment}).\n\nCommit: \`${expected.release}\`.\n\n[Open deployment](${url})\n\nRelease metadata, editor and localized about-page entry assets, public guides, articles and documents, all tool and component-docs entry assets, component-docs subroutes and custom HTTP 404 verified. PostHog ingestion still requires browser/network verification.\n`,
    );
  }
  console.log(
    "Deployed release, editor, localized about pages, all tools, component-docs subroutes and their entry assets, public pages and custom HTTP 404 verified.",
  );
}

/** Re-run the post-upload checks against a URL serving the prepared artifact. */
async function verifyPublishedDeployment(url) {
  if (!url) throw new Error("Pass the deployment URL to verify, for example https://xprite.cc.");
  const expected = JSON.parse(await readFile(join(deploymentDirectory, "release.json"), "utf8"));
  await verifyDeployment({ url }, expected);
  console.log(`Deployment at ${url} verified for release ${expected.release}.`);
}

try {
  switch (process.argv[2]) {
    case "validate":
      validateConfiguration();
      break;
    case "prepare":
      await prepareDeployment();
      break;
    case "publish":
      await publishDeployment();
      break;
    case "verify":
      await verifyPublishedDeployment(process.argv[3]);
      break;
    default:
      throw new Error("Use validate, prepare, publish or verify <url>.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
