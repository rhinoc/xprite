import { spawn } from "node:child_process";
import { appendFile, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import galleryRoutes from "../../apps/gallery/build/generated-routes.json" with { type: "json" };
import { siteServingConfiguration } from "../../apps/growth/build/routing/site-configuration.ts";
import { SITE_PAGES, SitePageKind } from "../../apps/growth/content/site/pages.ts";
import { GIF_SHEET_TOOL, TOOLS_HOME, TOOLS } from "../../apps/growth/content/tools/index.ts";

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
  "menu-icon.svg",
  "favicon.ico",
  "favicon-32.png",
  "favicon-16.png",
  "icon-192.png",
  ...SOCIAL_IMAGE_PATHS.map((path) => path.slice(1)),
];
const REQUIRED_SITE_PAGES = [
  "gallery/index.html",
  ...SITE_PAGES.map(({ path }) => `${path.slice(1)}index.html`),
  "404.html",
];

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
      if (page.startsWith("gallery/") && !url.pathname.startsWith("/gallery/"))
        throw new Error(`Gallery entry assets must use the /gallery/ base: ${resource}.`);
      await readFile(join(outputDirectory, decodeURIComponent(url.pathname)));
    }
  }
  await Promise.all(REQUIRED_DISCOVERY_FILES.map((file) => readFile(join(outputDirectory, file))));
  if (environment === "production") await readFile(join(outputDirectory, "sitemap.xml"));
  await verifyStaticFiles(outputDirectory);
  await rm(deploymentDirectory, { recursive: true, force: true });
  await mkdir(dirname(deploymentDirectory), { recursive: true });
  await cp(outputDirectory, deploymentDirectory, { recursive: true });
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
      ...galleryRoutes
        .filter((path) => path !== "/gallery/")
        .flatMap((path) => [
          { source: path, destination: "/gallery/index.html" },
          { source: `${path}/`, destination: "/gallery/index.html" },
        ]),
    ],
    ...(configuration.redirects ? { redirects: configuration.redirects } : {}),
  };
  if (environment === "preview") {
    await writeFile(join(deploymentDirectory, "robots.txt"), "User-agent: *\nAllow: /\n");
    await rm(join(deploymentDirectory, "sitemap.xml"), { force: true });
  }
  await writeFile(
    join(deploymentDirectory, "edgeone.json"),
    `${JSON.stringify(servingConfiguration, null, 2)}\n`,
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

async function verifyPageEntryAssets(html, pageUrl, label, verifiedAssets = new Set()) {
  const scripts = Array.from(html.matchAll(MODULE_ENTRY_PATTERN), (match) => match[1]);
  if (!scripts.length) throw new Error(`${label} HTML has no JavaScript module entry.`);
  const resources = [
    ...scripts.map((path) => ({ path, contentType: "javascript" })),
    ...Array.from(html.matchAll(STYLESHEET_PATTERN), (match) => ({
      path: match[1],
      contentType: "text/css",
    })),
  ];
  for (const resource of resources) {
    const assetUrl = new URL(resource.path, pageUrl);
    if (assetUrl.origin !== pageUrl.origin)
      throw new Error(`${label} entry assets must be hosted with the deployment.`);
    // Preserve the signed preview URL parameters when fetching another path.
    for (const [key, value] of pageUrl.searchParams) assetUrl.searchParams.set(key, value);
    if (verifiedAssets.has(assetUrl.href)) continue;
    const asset = await fetch(assetUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const available =
      asset.ok && (asset.headers.get("content-type") ?? "").includes(resource.contentType);
    await asset.body?.cancel();
    if (!available)
      throw new Error(
        `${label} entry asset is unavailable: ${resource.path} (HTTP ${asset.status}).`,
      );
    verifiedAssets.add(assetUrl.href);
  }
}

function hasPageLanguage(html, language) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] === language;
}

async function verifyShowcasePages(url, environment) {
  for (const language of PUBLIC_PAGE_LANGUAGES) {
    const showcaseUrl = new URL(url);
    showcaseUrl.pathname = `/showcase/${language}/`;
    const page = await fetch(showcaseUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const html = await page.text();
    const label = `Showcase (${language})`;
    if (!page.ok || !hasPageLanguage(html, language) || !html.includes('id="root"'))
      throw new Error(`${label} page is unavailable or has an incorrect language.`);
    if (environment === "production") {
      const canonical = `https://xprite.cc/showcase/${language}/`;
      if (!html.includes(`rel="canonical" href="${canonical}"`))
        throw new Error(`${label} has an incorrect canonical URL.`);
      for (const alternateLanguage of PUBLIC_PAGE_LANGUAGES) {
        const alternate = `https://xprite.cc/showcase/${alternateLanguage}/`;
        if (!html.includes(`hreflang="${alternateLanguage}" href="${alternate}"`))
          throw new Error(`${label} is missing the ${alternateLanguage} language link.`);
      }
      if (!html.includes('hreflang="x-default" href="https://xprite.cc/showcase/en/"'))
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
  }
}

async function verifyApplicationPages(url, environment) {
  const verifiedAssets = new Set();
  const pages = [
    { path: "/editor", root: "root", indexable: false },
    { path: "/editor/", root: "root", indexable: false },
    { path: TOOLS_HOME.path, root: "tools-root", indexable: true },
    ...TOOLS.map((tool) => ({
      path: tool.path,
      root:
        tool.path === "/tools/viewer/"
          ? "viewer-root"
          : tool.path === GIF_SHEET_TOOL.path
            ? "gif-sheet-root"
            : "animal-crossing-root",
      indexable: true,
    })),
    ...galleryRoutes.flatMap((path) =>
      (path.endsWith("/") ? [path] : [path, `${path}/`]).map((path) => ({
        path,
        root: "root",
        indexable: false,
      })),
    ),
  ];
  for (const entry of pages) {
    const pageUrl = new URL(url);
    pageUrl.pathname = entry.path;
    const response = await fetch(pageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const html = await response.text();
    if (!response.ok || !html.includes(`id="${entry.root}"`))
      throw new Error(`Application page is unavailable: ${entry.path}.`);
    if (
      entry.path.startsWith("/gallery/") &&
      Array.from(html.matchAll(MODULE_ENTRY_PATTERN)).some(
        (match) => !new URL(match[1], pageUrl).pathname.startsWith("/gallery/"),
      )
    )
      throw new Error(`Gallery route returned another application's entry: ${entry.path}.`);
    await verifyPageEntryAssets(html, pageUrl, entry.path, verifiedAssets);
    if (entry.indexable) {
      if (
        environment === "production" &&
        !html.includes(`rel="canonical" href="https://xprite.cc${entry.path}"`)
      )
        throw new Error(`Application page has an incorrect canonical URL: ${entry.path}.`);
    }
    if (
      (environment === "preview" || entry.path.startsWith("/gallery/")) &&
      !html.includes('content="noindex, follow"')
    )
      throw new Error(`Application page must not be indexed: ${entry.path}.`);
  }
}

async function verifySearchDiscovery(url, environment) {
  const get = (path) => {
    const target = new URL(url);
    target.pathname = path;
    return fetch(target, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  };
  const robots = await get("/robots.txt");
  const robotsText = await robots.text();
  if (
    !robots.ok ||
    !robots.headers.get("content-type")?.includes("text/plain") ||
    !robotsText.includes("User-agent: *")
  )
    throw new Error("robots.txt must be a plain-text crawl policy, not an application fallback.");
  const llms = await get("/llms.txt");
  const llmsText = await llms.text();
  if (
    !llms.ok ||
    !llms.headers.get("content-type")?.includes("text/plain") ||
    !llmsText.startsWith("# Xprite\n") ||
    !llmsText.includes("https://xprite.cc/tools/viewer/") ||
    !llmsText.includes(`https://xprite.cc${GIF_SHEET_TOOL.path}`)
  )
    throw new Error("llms.txt must expose the public documentation index as plain text.");
  const sitemap = await get("/sitemap.xml");
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
  } else if (sitemap.status !== 404 || robotsText.includes("Sitemap:")) {
    throw new Error("Preview deployments must not publish or advertise a sitemap.");
  }
  for (const path of SOCIAL_IMAGE_PATHS) {
    const response = await get(path);
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png"))
      throw new Error(`Social image is unavailable: ${path}.`);
  }
}

async function verifyDeployment(result, expected) {
  const url = new URL(result.url);
  if (url.protocol !== "https:") throw new Error("EdgeOne must return an HTTPS deployment URL.");
  const releaseUrl = new URL(url);
  releaseUrl.pathname = "/release.json";
  releaseUrl.searchParams.set("release", expected.release);
  let lastError;
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Release verification returned HTTP ${response.status}.`);
      const actual = await response.json();
      if (actual.release !== expected.release || actual.environment !== expected.environment)
        throw new Error("The deployed release does not match the uploaded artifact.");
      const page = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!page.ok) throw new Error(`Editor returned HTTP ${page.status}.`);
      const html = await page.text();
      await verifyPageEntryAssets(html, url, "Editor");
      for (const language of PUBLIC_PAGE_LANGUAGES) {
        const guideUrl = new URL(url);
        guideUrl.pathname = `/help/${language}/`;
        const guide = await fetch(guideUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const guideHtml = await guide.text();
        if (!guide.ok || !hasPageLanguage(guideHtml, language))
          throw new Error(`Public guide is unavailable: ${language}.`);
        const canonical = `https://xprite.cc/help/${language}/`;
        if (
          expected.environment === "production" &&
          !guideHtml.includes(`rel="canonical" href="${canonical}"`)
        )
          throw new Error(`Public guide has an incorrect canonical URL: ${language}.`);
        if (expected.environment === "preview" && !guideHtml.includes('content="noindex, follow"'))
          throw new Error(`Preview guide must not be indexed: ${language}.`);
      }
      await verifyShowcasePages(url, expected.environment);
      await verifyApplicationPages(url, expected.environment);
      await verifySearchDiscovery(url, expected.environment);
      for (const { path, language } of SITE_PAGES.filter(
        (page) => page.kind === SitePageKind.Article,
      )) {
        const comparisonUrl = new URL(url);
        comparisonUrl.pathname = path;
        const comparison = await fetch(comparisonUrl, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
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
      }
      for (const { path, language } of SITE_PAGES.filter(
        (page) => page.kind === SitePageKind.Placeholder,
      )) {
        const pageUrl = new URL(path, url);
        const page = await fetch(pageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const html = await page.text();
        if (
          !page.ok ||
          !hasPageLanguage(html, language) ||
          !html.includes("<h1") ||
          !html.includes('content="noindex, follow"')
        )
          throw new Error(`Reserved page is unavailable or must not be indexed: ${path}.`);
      }
      const missingUrl = new URL(url);
      missingUrl.pathname = `/deployment-not-found-${expected.release}`;
      const missing = await fetch(missingUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (missing.status !== 404 || !(await missing.text()).includes('id="error-title"'))
        throw new Error("Unknown paths must return the custom page with HTTP 404.");
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
      `Deployed **${settings.name}** (${settings.environment}).\n\nCommit: \`${expected.release}\`.\n\n[Open deployment](${url})\n\nRelease metadata, editor and localized showcase entry assets, public guides, comparison pages, all tool and gallery entry assets, gallery subroutes and custom HTTP 404 verified. PostHog ingestion still requires browser/network verification.\n`,
    );
  }
  console.log(
    "Deployed release, editor, localized showcase, all tools, gallery subroutes and their entry assets, public pages and custom HTTP 404 verified.",
  );
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
    default:
      throw new Error("Use validate, prepare or publish.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
