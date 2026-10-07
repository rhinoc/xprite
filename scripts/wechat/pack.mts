import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build, context, type Plugin } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = resolve(root, "apps/wechat");
const output = resolve(app, "dist");
const watch = process.argv.includes("--watch");
const GENERATED_SOURCE_SUFFIXES = new Set([".json", ".wxml", ".wxss"]);
const paletteFile = resolve(root, "apps/editor/assets/palette-presets/libresprite/pico-8.gpl");
const palette = (await readFile(paletteFile, "utf8")).split(/\r?\n/).flatMap((line) => {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)(?:\s|$)/.exec(line);
  return match ? [[Number(match[1]), Number(match[2]), Number(match[3]), 255]] : [];
});
if (!palette.length || palette.some((color) => color.some((value) => value < 0 || value > 255)))
  throw new Error("The shared PICO-8 palette is invalid.");

const scopes = JSON.parse(
  await readFile(resolve(root, "infra/package-import-scopes.json"), "utf8"),
) as { directory: string; source: string; aliases: Record<string, string> }[];
function contains(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

const localAliases: Plugin = {
  name: "wechat-package-aliases",
  setup(builder) {
    builder.onResolve({ filter: /^\$\// }, async ({ path, importer, kind }) => {
      const scope = scopes.find((entry) =>
        contains(resolve(root, entry.directory, entry.source), importer),
      );
      if (!scope) throw new Error(`Missing package scope for ${importer}`);
      const aliasRoot = resolve(root, scope.directory, scope.aliases["$/"]);
      const target = resolve(aliasRoot, path.slice("$/".length));
      if (!contains(aliasRoot, target))
        throw new Error(`Package import escapes its scope: ${path}`);
      return builder.resolve(target, { resolveDir: root, kind });
    });
    builder.onResolve({ filter: /^@xprite\/bedrock\/browser(?:\/|$)/ }, ({ path }) => {
      throw new Error(`Browser dependency cannot run in WeChat: ${path}`);
    });
    builder.onResolve({ filter: /^node:/ }, ({ path }) => {
      throw new Error(`Node dependency cannot run in WeChat: ${path}`);
    });
  },
};

async function copyNativeSources(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await copyNativeSources(path)));
    else if (Array.from(GENERATED_SOURCE_SUFFIXES).some((suffix) => path.endsWith(suffix))) {
      const target = resolve(output, relative(resolve(app, "src"), path));
      await mkdir(dirname(target), { recursive: true });
      await cp(path, target);
      files.push(path);
    }
  }
  return files;
}

const nativeSources: Plugin = {
  name: "wechat-native-sources",
  setup(builder) {
    builder.onLoad({ filter: /native-source-watch\.js$/ }, async () => ({
      contents: "",
      loader: "js",
      watchFiles: await copyNativeSources(resolve(app, "src")),
    }));
    builder.onEnd(async (result) => {
      if (result.errors.length) return;
      await Promise.all([
        cp(resolve(root, "LICENSE"), resolve(output, "LICENSE")),
        cp(resolve(root, "ATTRIBUTION.md"), resolve(output, "ATTRIBUTION.md")),
        cp(resolve(root, "LICENSES"), resolve(output, "LICENSES"), { recursive: true }),
      ]);
      const { version } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
      await writeFile(
        resolve(output, "release.json"),
        JSON.stringify({ distribution: "wechat", version }, null, 2) + "\n",
      );
      console.log(`WeChat project ready: ${app} (generated files: ${output})`);
    });
  },
};

// The directory is dedicated to this app; website outputs and source files are never touched.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const nativeWatchEntry = resolve(root, ".tmp/wechat/native-source-watch.js");
await mkdir(dirname(nativeWatchEntry), { recursive: true });
await writeFile(nativeWatchEntry, "");
const options = {
  absWorkingDir: root,
  entryPoints: {
    app: resolve(app, "src/app.ts"),
    "pages/editor/index": resolve(app, "src/pages/editor/index.ts"),
    "native-source-watch": nativeWatchEntry,
  },
  outdir: output,
  bundle: true,
  format: "cjs" as const,
  platform: "neutral" as const,
  mainFields: ["module", "main"],
  conditions: ["import", "default"],
  target: "es2020",
  define: { __XPRITE_WECHAT_PALETTE__: JSON.stringify(palette) },
  minify: !watch,
  sourcemap: watch ? ("inline" as const) : (false as const),
  legalComments: "inline" as const,
  plugins: [localAliases, nativeSources],
  logLevel: "info" as const,
};
if (watch) {
  const session = await context(options);
  await session.watch();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void session.dispose().then(() => process.exit(0));
    });
} else await build(options);
