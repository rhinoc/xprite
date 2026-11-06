import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

/**
 * Lets `new URL("<package specifier>", import.meta.url)` reference files inside installed
 * packages. Vite only rewrites `new URL` when its first argument is relative; this plugin
 * resolves bare specifiers through the normal module resolution and rewrites the call to the
 * equivalent relative URL, so the built-in asset and worker pipelines handle it unchanged.
 *
 * Example: `new Worker(new URL("@xprite/pixelate/wasm/ac-rl.js", import.meta.url))`.
 */
const PACKAGE_URL_PATTERN =
  /\bnew\s+URL\s*\(\s*(['"])((?:@[\w.-]+\/)?[a-zA-Z][\w.-]*(?:\/[\w./-]+)?)\1\s*,\s*import\.meta\.url\s*(?:,\s*)?\)/g;

/** A specifier that is not relative, absolute, or scheme-qualified is a package specifier. */
function isPackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return false;
  if (/^[a-zA-Z][\w.+-]*:/.test(specifier)) return false;
  return specifier.includes("/") || specifier.startsWith("@");
}

function toRelativeUrl(importerPath: string, targetPath: string): string {
  let relativePath = relative(dirname(importerPath), targetPath).split(sep).join("/");
  if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;
  return relativePath;
}

export function importMetaPackageUrl(): Plugin {
  return {
    name: "xprite-import-meta-package-url",
    enforce: "pre",
    async transform(code, id) {
      if (!PACKAGE_URL_PATTERN.test(code)) return null;
      PACKAGE_URL_PATTERN.lastIndex = 0;
      const importerPath = isAbsolute(id) ? id : resolve(id);
      const replacements: { start: number; end: number; specifier: string; quote: string }[] = [];
      for (const match of code.matchAll(PACKAGE_URL_PATTERN)) {
        if (!isPackageSpecifier(match[2])) continue;
        replacements.push({
          start: match.index!,
          end: match.index! + match[0].length,
          specifier: match[2],
          quote: match[1],
        });
      }
      if (!replacements.length) return null;

      let rewritten = code;
      for (let i = replacements.length - 1; i >= 0; i--) {
        const { start, end, specifier, quote } = replacements[i];
        const resolved = await this.resolve(specifier, importerPath, { skipSelf: true });
        if (!resolved) {
          throw new Error(
            `Cannot resolve package URL "${specifier}" imported from "${importerPath}"`,
          );
        }
        const resolvedPath = resolved.id.split(/[?#]/, 1)[0];
        const targetPath = resolvedPath.startsWith("file:")
          ? fileURLToPath(resolvedPath)
          : resolvedPath;
        const relativeUrl = toRelativeUrl(importerPath, targetPath);
        const original = rewritten.slice(start, end);
        rewritten =
          rewritten.slice(0, start) +
          original.replace(`${quote}${specifier}${quote}`, JSON.stringify(relativeUrl)) +
          rewritten.slice(end);
      }
      return { code: rewritten, map: null };
    },
  };
}
