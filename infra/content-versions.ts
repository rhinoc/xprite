/**
 * Content versions for files that keep a stable name in build output.
 *
 * Vite names bundled files after their content, so their URLs change on every release.
 * Files copied verbatim (public directories, generated theme stylesheets, fonts, icons,
 * manifests) keep the same URL across releases, and the CDN caches them at the edge.
 * A page from a new release can then load the previous release's file. Every app runs
 * `versionOutputDirectory` as its last build step so each such reference carries
 * `?v=<content hash>` of the exact bytes it was built with.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { Plugin } from "vite";

const CONTENT_VERSION_PARAMETER = "v";
const CONTENT_VERSION_LENGTH = 12;
const HASH_ALGORITHM = "sha256";
const HTML_EXTENSION = ".html";
const CSS_EXTENSION = ".css";
/** Asset types whose stale copies change how a page looks or runs. */
const VERSIONED_ASSET_PATTERN =
  /\.(?:css|js|mjs|woff2?|ttf|otf|json|webmanifest|wasm|png|svg|webp|avif|gif|jpe?g|ico)$/i;
/** Vite output (`name-Hash8.ext`) and generated asset stores (`<hex digest>.ext`). */
const CONTENT_ADDRESSED_PATTERN = /(?:-[A-Za-z0-9_-]{8,}|(?:^|\/)[0-9a-f]{32,})\.[A-Za-z0-9]+$/;
/** The service worker's URL is its identity; versioning it would install a second worker. */
const STABLE_IDENTITY_FILES = new Set(["sw.js"]);
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const HTML_REFERENCE = /(\s(?:href|src)\s*=\s*)(["'])([^"']*)\2/gi;
const CSS_REFERENCE = /(url\(\s*)(["']?)([^"')\s]+)\2(\s*\))|(@import\s+)(["'])([^"']+)\6/gi;

export function contentVersion(content: string | Uint8Array): string {
  return createHash(HASH_ALGORITHM).update(content).digest("hex").slice(0, CONTENT_VERSION_LENGTH);
}

export function isContentAddressed(pathname: string): boolean {
  return CONTENT_ADDRESSED_PATTERN.test(pathname);
}

interface Reference {
  pathname: string;
  query: string;
  hash: string;
}

function splitReference(value: string): Reference | undefined {
  if (!value || EXTERNAL_URL.test(value)) return undefined;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(value);
  if (!match || !match[1]) return undefined;
  return { pathname: match[1], query: match[2] ?? "", hash: match[3] ?? "" };
}

/** Whether a local reference needs a content version (decided on its path alone). */
export function needsContentVersion(pathname: string): boolean {
  const name = pathname.split("/").pop() ?? "";
  return (
    VERSIONED_ASSET_PATTERN.test(pathname) &&
    !isContentAddressed(pathname) &&
    !STABLE_IDENTITY_FILES.has(name)
  );
}

function hasContentVersion(value: string): boolean {
  const reference = splitReference(value);
  if (!reference) return true;
  return new URLSearchParams(reference.query).has(CONTENT_VERSION_PARAMETER);
}

function withVersion(reference: Reference, version: string): string {
  const parameters = new URLSearchParams(reference.query);
  parameters.set(CONTENT_VERSION_PARAMETER, version);
  return `${reference.pathname}?${parameters.toString()}${reference.hash}`;
}

/** Calls `visit` for each local asset reference; returns the rewritten source. */
function rewriteReferences(
  source: string,
  kind: "html" | "css",
  visit: (value: string) => string,
): string {
  const css = (text: string) =>
    text.replace(
      CSS_REFERENCE,
      (
        match,
        urlStart?: string,
        urlQuote?: string,
        urlValue?: string,
        urlEnd?: string,
        importStart?: string,
        importQuote?: string,
        importValue?: string,
      ) =>
        urlValue !== undefined
          ? `${urlStart}${urlQuote}${visit(urlValue)}${urlQuote}${urlEnd}`
          : importValue !== undefined
            ? `${importStart}${importQuote}${visit(importValue)}${importQuote}`
            : match,
    );
  if (kind === "css") return css(source);
  return source
    .replace(HTML_REFERENCE, (_match, start: string, quote: string, value: string) => {
      return `${start}${quote}${visit(value)}${quote}`;
    })
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, body, close) => {
      return `${open}${css(body)}${close}`;
    });
}

/**
 * Rewrites one HTML or CSS source. `versionOf` receives the referenced pathname and
 * returns the content version of the file it resolves to, or undefined to leave it.
 */
export function versionReferences(
  source: string,
  kind: "html" | "css",
  versionOf: (pathname: string) => string | undefined,
): string {
  return rewriteReferences(source, kind, (value) => {
    const reference = splitReference(value);
    if (!reference || !needsContentVersion(reference.pathname)) return value;
    const version = versionOf(reference.pathname);
    return version ? withVersion(reference, version) : value;
  });
}

async function outputFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

export interface ContentVersionOptions {
  /** Public URL prefix of the output root, such as "/" or "/tools/". Relative bases are ignored. */
  base?: string;
}

/** Resolve a reference to a file inside the output directory. */
function referencedFile(
  output: string,
  from: string,
  pathname: string,
  base: string,
): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  let filename: string;
  if (decoded.startsWith("/")) {
    if (base.startsWith("/") && base !== "/" && decoded.startsWith(base))
      filename = resolve(output, `./${decoded.slice(base.length)}`);
    else filename = resolve(output, `.${decoded}`);
  } else filename = resolve(dirname(from), decoded);
  return filename.startsWith(`${output}${sep}`) ? filename : undefined;
}

/**
 * Versions every stable-name asset reference in the HTML and CSS of a build output.
 * Stylesheets are rewritten before their own version is taken, so a stylesheet's
 * version also changes when a font or image it references changes.
 */
export async function versionOutputDirectory(
  outputDirectory: string,
  { base = "/" }: ContentVersionOptions = {},
): Promise<string[]> {
  const output = resolve(outputDirectory);
  const files = await outputFiles(output);
  const known = new Set(files);
  const versions = new Map<string, Promise<string | undefined>>();
  const rewritten: string[] = [];

  const rewrite = async (filename: string, kind: "html" | "css") => {
    const source = await readFile(filename, "utf8");
    const targets = new Map<string, string | undefined>();
    rewriteReferences(source, kind, (value) => {
      const reference = splitReference(value);
      if (reference && needsContentVersion(reference.pathname)) {
        const target = referencedFile(output, filename, reference.pathname, base);
        targets.set(reference.pathname, target && known.has(target) ? target : undefined);
      }
      return value;
    });
    const resolved = new Map<string, string | undefined>();
    for (const [pathname, target] of targets)
      resolved.set(pathname, target && target !== filename ? await versionOf(target) : undefined);
    const result = versionReferences(source, kind, (pathname) => resolved.get(pathname));
    if (result !== source) {
      await writeFile(filename, result);
      rewritten.push(relative(output, filename));
    }
    return result;
  };

  const versionOf = (filename: string): Promise<string | undefined> => {
    let version = versions.get(filename);
    if (!version) {
      version = filename.endsWith(CSS_EXTENSION)
        ? rewrite(filename, "css").then(contentVersion)
        : readFile(filename).then(contentVersion);
      versions.set(filename, version);
    }
    return version;
  };

  for (const filename of files.filter((file) => file.endsWith(CSS_EXTENSION)))
    await versionOf(filename);
  for (const filename of files.filter((file) => file.endsWith(HTML_EXTENSION)))
    await rewrite(filename, "html");
  return rewritten.sort();
}

/** Last build step for apps whose output Vite writes without later page generation. */
export function contentVersionedOutput(options: ContentVersionOptions = {}): Plugin {
  let output = "";
  let base = "/";
  let build = false;
  return {
    name: "xprite-content-versioned-output",
    configResolved(config) {
      build = config.command === "build";
      output = resolve(config.root, config.build.outDir);
      base = options.base ?? config.base;
    },
    closeBundle: {
      order: "post",
      sequential: true,
      async handler() {
        if (build) await versionOutputDirectory(output, { base });
      },
    },
  };
}

const SCRIPT_EXTENSIONS = /\.(?:js|mjs)$/;
/** Quoted local paths in scripts that the browser fetches as stylesheets, scripts or fonts. */
const SCRIPT_ASSET_REFERENCE =
  /(["'`])((?:\.{1,2})?\/[\w./%-]+\.(?:css|js|mjs|woff2?|ttf|otf))(\?[^"'`]*)?\1/g;

export interface UnversionedReference {
  file: string;
  reference: string;
}

/**
 * Lists references in a build output that point at a stable-name local file without a
 * content version. Deployment fails on any result; see `versionOutputDirectory`.
 */
export async function findUnversionedReferences(
  outputDirectory: string,
  { base = "/" }: ContentVersionOptions = {},
): Promise<UnversionedReference[]> {
  const output = resolve(outputDirectory);
  const files = await outputFiles(output);
  const known = new Set(files);
  const found: UnversionedReference[] = [];
  const check = (filename: string, value: string) => {
    const reference = splitReference(value);
    if (!reference || !needsContentVersion(reference.pathname) || hasContentVersion(value)) return;
    const target = referencedFile(output, filename, reference.pathname, base);
    if (target && known.has(target))
      found.push({ file: relative(output, filename), reference: value });
  };
  for (const filename of files) {
    const kind = filename.endsWith(HTML_EXTENSION)
      ? "html"
      : filename.endsWith(CSS_EXTENSION)
        ? "css"
        : SCRIPT_EXTENSIONS.test(filename)
          ? "script"
          : undefined;
    if (!kind || STABLE_IDENTITY_FILES.has(filename.split(sep).pop() ?? "")) continue;
    const source = await readFile(filename, "utf8");
    if (kind === "script") {
      for (const match of source.matchAll(SCRIPT_ASSET_REFERENCE))
        check(filename, `${match[2]}${match[3] ?? ""}`);
    } else
      rewriteReferences(source, kind, (value) => {
        check(filename, value);
        return value;
      });
  }
  return found.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.reference.localeCompare(right.reference),
  );
}
