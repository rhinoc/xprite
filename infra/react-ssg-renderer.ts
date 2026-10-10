import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build, type Plugin } from "esbuild";
import { bundleAsync } from "lightningcss";

import { ssgScopedName } from "./react-ssg-style-names.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const aliases: Record<string, string> = {
  "@xprite/growth-content/language": "apps/growth/content/site/language.ts",
  "@xprite/growth-content/navigation": "apps/growth/content/site/navigation.ts",
  "@xprite/site-shell/telemetry": "packages/site-shell/src/managers/ports/telemetry.ts",
  "@xprite/site-shell/startup": "packages/site-shell/src/startup.ts",
  "@xprite/site-shell": "packages/site-shell/src/index.ts",
  "@xprite/growth-content/tools": "apps/growth/content/tools/index.ts",
  "@xprite/ui/pattern-data": "packages/ui/assets/patterns/macintosh/catalog.json",
  "@xprite/ui": "packages/ui/src/index.ts",
  "@xprite/ui/": "packages/ui/src/",
  "@xprite/editor-ui/": "packages/editor-ui/src/",
  "@xprite/editor-ui": "packages/editor-ui/src/index.ts",
  "@xprite/editor-core/": "packages/editor-core/src/",
  "@xprite/editor-core": "packages/editor-core/src/index.ts",
  "@xprite/bedrock/": "packages/bedrock/",
};
const scopes = JSON.parse(
  readFileSync(resolve(ROOT, "infra/package-import-scopes.json"), "utf8"),
) as { directory: string; source: string; aliases: Record<string, string> }[];
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
};

export interface SsgAsset {
  bytes: Buffer;
  type: string;
}

export async function createReactSsgRenderer<T>(options: {
  entry: string;
  assetPrefix: string;
  cacheDirectory: string;
}) {
  const assets = new Map<string, SsgAsset>();
  const css = new Map<string, string>();
  const assetRoot = resolve(ROOT, "apps/growth/public");
  const assetManifest = resolve(assetRoot, "package.json");
  const assetExports = JSON.parse(readFileSync(assetManifest, "utf8")).exports as Record<
    string,
    string
  >;
  const files = new Set<string>([assetManifest]);
  const resolveSource = (source: string, importer: string) => {
    const clean = source.split("?", 1)[0];
    if (clean.startsWith("@xprite/site-assets/")) {
      const key = `./${clean.slice("@xprite/site-assets/".length)}`;
      const target = assetExports[key];
      if (!target) throw new Error(`Site asset is not exported: ${key}`);
      return resolve(assetRoot, target);
    }
    if (clean.startsWith("$")) {
      const scope = scopes.find(({ directory, source }) =>
        importer.startsWith(`${resolve(ROOT, directory, source)}/`),
      );
      if (!scope) throw new Error(`No package scope for ${importer}`);
      const prefix = Object.keys(scope.aliases).find((prefix) => clean.startsWith(prefix));
      if (!prefix) throw new Error(`No alias for ${source}`);
      return resolve(ROOT, scope.directory, scope.aliases[prefix], clean.slice(prefix.length));
    }
    const prefix = Object.keys(aliases)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => (prefix.endsWith("/") ? clean.startsWith(prefix) : clean === prefix));
    return prefix
      ? resolve(ROOT, aliases[prefix], prefix.endsWith("/") ? clean.slice(prefix.length) : "")
      : resolve(dirname(importer), clean);
  };
  const assetUrl = (filename: string) => {
    const bytes = readFileSync(filename);
    files.add(filename);
    const extension = extname(filename);
    const name = `${createHash("sha256").update(bytes).digest("hex")}${extension}`;
    assets.set(name, { bytes, type: contentTypes[extension] ?? "application/octet-stream" });
    return `${options.assetPrefix}${name}`;
  };
  const plugin: Plugin = {
    name: "react-ssg",
    setup(context) {
      context.onResolve({ filter: /^(?:\$|@xprite\/)|\?url$/ }, async (args) => {
        const source = resolveSource(args.path, args.importer);
        return context.resolve(source, { kind: args.kind, resolveDir: dirname(args.importer) });
      });
      context.onLoad({ filter: /\.(?:png|gif|svg|webp|woff2|jpg)$/ }, (args) => ({
        contents: `export default ${JSON.stringify(assetUrl(args.path))};`,
        loader: "js",
      }));
      context.onLoad({ filter: /\.css$/ }, async (args) => {
        files.add(args.path);
        const prefix = ssgScopedName("", args.path);
        const result = await bundleAsync({
          filename: args.path,
          cssModules: { pattern: `${prefix}[local]` },
          analyzeDependencies: true,
          minify: true,
          resolver: {
            read(filename) {
              files.add(filename);
              // Custom-property URLs must be absolute before Lightning CSS analyzes var() use sites.
              return readFileSync(filename, "utf8").replace(
                /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
                (match, _quote, resource: string) =>
                  /^(?:https?:|data:|\/|#)/.test(resource)
                    ? match
                    : `url(${JSON.stringify(assetUrl(resolveSource(resource, filename)))})`,
              );
            },
            resolve: resolveSource,
          },
        });
        let stylesheet = result.code.toString();
        for (const dependency of result.dependencies ?? []) {
          if (dependency.type === "file") {
            files.add(dependency.filePath);
            continue;
          }
          if (dependency.type !== "url")
            throw new Error(`Unsupported CSS dependency in ${args.path}`);
          const url = /^(?:https?:|data:|\/)/.test(dependency.url)
            ? dependency.url
            : assetUrl(resolveSource(dependency.url, dependency.loc.filePath));
          stylesheet = stylesheet.replaceAll(dependency.placeholder, url);
        }
        css.set(args.path, stylesheet);
        const classes = Object.fromEntries(
          Object.entries(result.exports ?? {}).map(([name, value]) => [name, value.name]),
        );
        return { contents: `export default ${JSON.stringify(classes)};`, loader: "js" };
      });
    },
  };
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [resolve(ROOT, options.entry)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    define: { "import.meta.env.DEV": JSON.stringify(process.env.NODE_ENV !== "production") },
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [plugin],
    metafile: true,
    logLevel: "silent",
  });
  for (const file of Object.keys(result.metafile!.inputs)) files.add(resolve(ROOT, file));
  // Preserve ESM dependency evaluation order, including each owner's stylesheet.
  // Discovery order can otherwise let a base skin override an app's layout class.
  const orderedCss: string[] = [];
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of result.metafile!.inputs[file]?.imports ?? [])
      if (!dependency.external) visit(dependency.path);
    const stylesheet = css.get(resolve(ROOT, file));
    if (stylesheet) orderedCss.push(stylesheet);
  };
  visit(options.entry);
  const output = result.outputFiles[0].contents;
  const cacheRoot = resolve(ROOT, options.cacheDirectory);
  await mkdir(cacheRoot, { recursive: true });
  const cacheFile = resolve(cacheRoot, `${createHash("sha256").update(output).digest("hex")}.mjs`);
  if (!existsSync(cacheFile)) await writeFile(cacheFile, output);
  const renderer = (await import(pathToFileURL(cacheFile).href)) as T;
  return { renderer, css: orderedCss.join("\n"), assets, files };
}
