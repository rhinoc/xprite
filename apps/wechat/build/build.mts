import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appRoot = resolve(repositoryRoot, "apps/wechat");
const isProbe = process.argv.includes("--probe");
const watching = process.argv.includes("--watch");
const output = isProbe
  ? resolve(repositoryRoot, ".tmp/wechat-runtime-probe")
  : resolve(appRoot, "dist");
const require = createRequire(resolve(appRoot, "package.json"));
const webpack = require("webpack");
const MpPlugin = require("mp-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const scopes = JSON.parse(
  await readFile(resolve(repositoryRoot, "infra/package-import-scopes.json"), "utf8"),
);
const scopeAliases = {
  apply(compiler) {
    compiler.hooks.normalModuleFactory.tap("xprite-package-aliases", (factory) =>
      factory.hooks.beforeResolve.tap("xprite-package-aliases", (data) => {
        if (!data?.request.startsWith("$")) return;
        const issuer = data.contextInfo.issuer.split("?", 1)[0];
        const scope = scopes.find((entry) =>
          issuer.startsWith(resolve(repositoryRoot, entry.directory, entry.source) + "/"),
        );
        const prefix =
          scope && Object.keys(scope.aliases).find((entry) => data.request.startsWith(entry));
        if (prefix)
          data.request = resolve(
            repositoryRoot,
            scope.directory,
            scope.aliases[prefix],
            data.request.slice(prefix.length),
          );
      }),
    );
  },
};
const project = JSON.parse(await readFile(resolve(appRoot, "project.config.json"), "utf8"));
const fonts = await Promise.all(
  [
    ["PixelArtBitmap", "packages/ui/assets/fonts/aseprite/aseprite.woff2"],
    ["FusionPixelZhHans", "packages/ui/assets/fonts/fusion-pixel/fusion-pixel-10px-zh-hans.woff2"],
  ].map(async ([family, filename]) => ({
    family,
    source: `data:font/woff2;base64,${(await readFile(resolve(repositoryRoot, filename))).toString("base64")}`,
  })),
);
const options = {
  mode: "production",
  entry: {
    index: isProbe
      ? resolve(repositoryRoot, "scripts/wechat/probes/runtime.mjs")
      : resolve(appRoot, "src/bootstrap.mjs"),
  },
  output: {
    path: resolve(output, "common"),
    filename: "[name].js",
    library: "createApp",
    libraryExport: "default",
    libraryTarget: "window",
    publicPath: "/common/",
  },
  target: "web",
  resolve: {
    byDependency: { esm: { fullySpecified: false } },
    alias: {
      "@xprite/wechat-app/runtime/canvas$": resolve(appRoot, "src/adapters/runtime/canvas.mjs"),
      "@xprite/wechat-app/runtime/geometry$": resolve(appRoot, "src/adapters/runtime/geometry.mjs"),
      "@xprite/wechat-app/runtime/fonts$": resolve(appRoot, "src/adapters/runtime/fonts.mjs"),
      "@xprite/wechat-app/runtime/environment$": resolve(
        appRoot,
        "src/adapters/runtime/environment.mjs",
      ),
      "@xprite/ui$": resolve(repositoryRoot, "packages/ui/src/index.ts"),
      "@xprite/ui/assets$": resolve(repositoryRoot, "packages/ui/src/assets.ts"),
      "@xprite/ui/utils$": resolve(repositoryRoot, "packages/ui/src/utils.ts"),
      "@xprite/ui/canvas$": resolve(repositoryRoot, "packages/ui/src/canvas.ts"),
      "@xprite/ui/popover$": resolve(repositoryRoot, "packages/ui/src/popover.ts"),
      "@xprite/ui/cursor$": resolve(repositoryRoot, "packages/ui/src/cursor.ts"),
      "@xprite/editor-app/embedded-runtime$": resolve(
        repositoryRoot,
        "apps/editor/src/embedded-runtime.ts",
      ),
      "@xprite/editor-ui$": require.resolve("@xprite/editor-ui"),
      "@xprite/editor-ui/timeline$": require.resolve("@xprite/editor-ui/timeline"),
      "@xprite/editor-ui/appearance$": require.resolve("@xprite/editor-ui/appearance"),
      [resolve(repositoryRoot, "apps/editor/src/adapters/platform/browser-editor-host") + "$"]:
        resolve(appRoot, "src/adapters/platform/inactive-browser-host.ts"),
      react$: resolve(appRoot, "src/adapters/runtime/react.mjs"),
      "xprite-real-react$": require.resolve("react"),
    },
    extensions: [".mjs", ".js", ".ts", ".tsx", ".json"],
    modules: [
      resolve(appRoot, "node_modules"),
      resolve(repositoryRoot, "node_modules"),
      "node_modules",
    ],
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve("esbuild-loader"),
            options: { target: "es2020", jsx: "automatic" },
          },
          { loader: resolve(repositoryRoot, "scripts/wechat/source-loader.cjs") },
        ],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: require.resolve("css-loader"),
            options: { modules: { auto: true, namedExport: false }, esModule: true },
          },
        ],
      },
      { resourceQuery: /raw/, type: "asset/source" },
      {
        test: /\.(ase|aseprite)$/,
        type: "asset/inline",
        generator: { dataUrl: { mimetype: "application/x-aseprite" } },
      },
      {
        test: /\.(png|webp|svg|woff2|gpl)$/,
        resourceQuery: { not: [/raw/] },
        type: "asset/resource",
        generator: { filename: "assets/[name].[contenthash][ext]" },
      },
    ],
  },
  optimization: { runtimeChunk: false, splitChunks: false, minimize: false },
  plugins: [
    scopeAliases,
    new MiniCssExtractPlugin({ filename: "[name].wxss", runtime: false }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new webpack.DefinePlugin({
      __XPRITE_PROBE_FONTS__: JSON.stringify(fonts),
      __XPRITE_WECHAT_FONTS__: JSON.stringify(fonts),
      __XPRITE_ITCH__: "false",
      __XPRITE_VERSION__: JSON.stringify("0.1.0"),
      __XPRITE_RELEASE__: JSON.stringify("wechat-local"),
      ImageData: "window.ImageData",
      Image: "window.Image",
      Event: "window.Event",
      HTMLCanvasElement: "window.HTMLCanvasElement",
      ResizeObserver: "window.ResizeObserver",
      DOMRect: "window.DOMRect",
      getComputedStyle: "window.getComputedStyle",
      Blob: "window.Blob",
      File: "window.File",
      TextEncoder: "window.TextEncoder",
      TextDecoder: "window.TextDecoder",
      URL: "window.URL",
      URLSearchParams: "window.URLSearchParams",
      structuredClone: "window.structuredClone",
      queueMicrotask: "window.queueMicrotask",
      globalThis: "window",
      "import.meta.env": JSON.stringify({
        DEV: true,
        PROD: false,
        BASE_URL: "/common/",
        VITE_EMBEDDED_HOST: "true",
      }),
    }),
    new MpPlugin({
      origin: "https://xprite.cc",
      entry: "/",
      router: { index: ["/", "/home", "/editor"] },
      global: { windowScroll: false },
      app: {
        navigationBarTitleText: isProbe ? "Xprite runtime probe" : "Xprite",
        pageOrientation: "auto",
      },
      projectConfig: {
        ...project,
        projectname: isProbe ? "xprite-runtime-probe" : "xprite-wechat",
        miniprogramRoot: "./",
        setting: { ...project.setting, es6: false, enhance: false, compileHotReLoad: false },
      },
      generate: { autoBuildNpm: false, renderVersion: "2.2.29", elementVersion: "2.2.23" },
    }),
  ],
};

async function finishOutput() {
  const runtimePackages = [
    ["miniprogram-render", require.resolve("miniprogram-render/package.json")],
    ["miniprogram-element", require.resolve("miniprogram-element/package.json")],
  ];
  for (const [dependency, metadataPath] of runtimePackages) {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    await cp(
      resolve(dirname(metadataPath), metadata.miniprogram),
      resolve(output, "miniprogram_npm", dependency),
      { recursive: true },
    );
  }
  const lifecyclePath = resolve(output, "pages/base.js");
  const lifecycleSource = await readFile(lifecyclePath, "utf8");
  if (!lifecycleSource.includes("onUnload() {"))
    throw new Error("The pinned Kbone lifecycle template changed; review native reload handling.");
  await writeFile(
    lifecyclePath,
    lifecycleSource.replace(
      "onUnload() {",
      "onUnload() {\n                if (!this.document || !this.window) return;",
    ),
  );
  // Font bytes are already registered with wx.loadFontFace for both native and view scopes.
  // Remove the unsupported duplicate local-path declarations, retaining the exact same font.
  const stylesheetPath = resolve(output, "common/index.wxss");
  const stylesheet = postcss.parse(await readFile(stylesheetPath, "utf8"));
  const attributeRules: {
    className: string;
    attribute: string;
    operator?: string;
    value?: string;
  }[] = [];
  stylesheet.walkRules((rule) => {
    rule.selector = selectorParser((root) =>
      root.walkAttributes((attribute) => {
        const className = `xprite-attribute-${attributeRules.length}`;
        attributeRules.push({
          className,
          attribute: attribute.attribute,
          operator: attribute.operator,
          value: attribute.value,
        });
        attribute.replaceWith(selectorParser.className({ value: className }));
      }),
    ).processSync(rule.selector);
    rule.selector = rule.selector.replace(/>\s*:/g, "> .xprite-node:");
    const parsed = selectorParser().astSync(rule.selector);
    let selectors = Array.from(parsed.nodes);
    let expanding = true;
    while (expanding) {
      expanding = false;
      selectors = selectors.flatMap((selector) => {
        let selected;
        selector.walkPseudos((pseudo) => {
          if (!selected && (pseudo.value === ":where" || pseudo.value === ":is")) selected = pseudo;
        });
        if (!selected) return [selector];
        expanding = true;
        const replacements = selected.nodes.map((alternative) =>
          alternative.nodes.map((node) => node.clone()),
        );
        return replacements.map((nodes) => {
          const copy = selector.clone();
          let target;
          copy.walkPseudos((pseudo) => {
            if (!target && (pseudo.value === ":where" || pseudo.value === ":is")) target = pseudo;
          });
          target.replaceWith(...nodes);
          return copy;
        });
      });
    }
    rule.selector = selectors.map((selector) => selector.toString()).join(",");
  });
  const containers = new Set<string>();
  const containerRules: { selectors: string[]; className: string; mode: string; width: number }[] =
    [];
  stylesheet.walkDecls("container-type", (declaration) => {
    if (declaration.parent.type === "rule")
      for (const selector of declaration.parent.selectors) containers.add(selector);
    declaration.remove();
  });
  stylesheet.walkAtRules("container", (atRule) => {
    const condition = /^\((max|min)-width:\s*([\d.]+)px\)$/.exec(atRule.params);
    if (!condition)
      throw new Error(`Implement the container condition before compiling: ${atRule.params}`);
    const className = `xprite-container-${containerRules.length}`;
    const selectors: string[] = [];
    atRule.walkRules((rule) => {
      selectors.push(...rule.selectors);
      rule.selectors = rule.selectors.map((selector) => `${selector}.${className}`);
    });
    containerRules.push({ selectors, className, mode: condition[1], width: Number(condition[2]) });
    atRule.replaceWith(...atRule.nodes);
  });
  await writeFile(
    resolve(output, "common/native-container-rules.json"),
    JSON.stringify({
      containers: Array.from(containers),
      rules: containerRules,
      attributes: attributeRules,
    }),
  );
  stylesheet.walkAtRules("font-face", (rule) => {
    let family = "";
    rule.walkDecls("font-family", (declaration) => {
      family = declaration.value.replace(/["']/g, "");
    });
    if (!fonts.some((font) => font.family === family))
      throw new Error(`Register the native font before transforming its stylesheet: ${family}`);
    rule.remove();
  });
  await writeFile(stylesheetPath, stylesheet.toString());
  await writeFile(
    resolve(output, "INVESTIGATION.txt"),
    "Developer-only runtime investigation. This is not the editor or evidence of feature/UI parity.\n",
  );
  console.log(`${isProbe ? "Native runtime probe" : "Shared editor application"} ready: ${output}`);
}
const compiler = webpack(options);
function buildFailure(error, stats) {
  if (error) return error;
  if (
    !stats ||
    stats.hasErrors() ||
    stats.compilation.warnings.some((warning) =>
      /Module not found|Can't resolve/.test(warning.message),
    )
  )
    return new Error(
      stats?.toString({ all: false, errors: true, warnings: true }) ?? "WeChat build failed",
    );
  return null;
}
await mkdir(output, { recursive: true });
if (watching) {
  let queue = Promise.resolve();
  const watcher = compiler.watch({}, (error, stats) => {
    const failure = buildFailure(error, stats);
    if (failure) {
      console.error(failure);
      return;
    }
    queue = queue.then(finishOutput).catch((error) => console.error(error));
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => watcher.close(() => compiler.close(() => process.exit(0))));
} else {
  await new Promise((resolveBuild, reject) =>
    compiler.run((error, stats) =>
      compiler.close((closeError) => {
        const failure = buildFailure(error ?? closeError, stats);
        if (failure) reject(failure);
        else resolveBuild();
      }),
    ),
  );
  await finishOutput();
}
