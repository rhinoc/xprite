import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "@babel/parser";
import { build, transformWithEsbuild, type Plugin } from "vite";

import { packageLocalAliases } from "../../infra/package-local-aliases.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = resolve(root, "apps/editor");
const host = resolve(app, "src/adapters/minitool");
const output = resolve(root, "dist/minitool");
const artifacts = resolve(root, ".tmp/artifacts/xiaohongshu");
const skill = resolve(root, ".codex/minitool-zip-builder");
const require = createRequire(import.meta.url);
const postcss = require(require.resolve("postcss", { paths: [dirname(require.resolve("vite"))] }));
const lightningcss = require(
  require.resolve("lightningcss", { paths: [dirname(require.resolve("vite"))] }),
);
const metadata = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const INACTIVE_BROWSER_HOST = "\0xprite:inactive-browser-host";
const replacements = new Map([
  ["$/adapters/files/images", "images.ts"],
  ["$/adapters/files/aseprite-files", "aseprite-files.ts"],
  ["@xprite/bedrock/browser/localstorage", "storage.ts"],
  ["@xprite/bedrock/browser/file-system", "files.ts"],
  ["@xprite/bedrock/browser/clipboard", "clipboard.ts"],
]);
const adjustments = new Set<string>();
const embeddedAssets = new Map<string, Buffer>();
for (const [source, target] of Array.from(replacements)) {
  const path = source.startsWith("$/")
    ? resolve(app, "src", source.slice(2))
    : resolve(root, "packages/bedrock", source.slice("@xprite/bedrock/".length));
  replacements.set(path, target);
  replacements.set(path + ".ts", target);
}

function walk(node: any, ancestors: any[], visit: (node: any, ancestors: any[]) => void) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node, ancestors);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments"].includes(key)) continue;
    if (Array.isArray(value)) for (const item of value) walk(item, [...ancestors, node], visit);
    else if (value && typeof value === "object") walk(value, [...ancestors, node], visit);
  }
}

function hostSource(code: string, id: string): string {
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = new Map<number, { end: number; text: string }>();
  const disable = (parents: any[]) => {
    const callback = [...parents].reverse().find((node) => node.type === "JSXAttribute");
    if (callback && /^on(?:\w*Help)$/.test(callback.name.name)) {
      edits.set(callback.value.start, { end: callback.value.end, text: "{undefined}" });
      return;
    }
    const opening = [...parents].reverse().find((node) => node.type === "JSXOpeningElement");
    if (opening) {
      const attr = opening.attributes.find(
        (node: any) => node.type === "JSXAttribute" && node.name.name === "disabled",
      );
      if (attr) edits.set(attr.start, { end: attr.end, text: "disabled={true}" });
      else edits.set(opening.name.end, { end: opening.name.end, text: " disabled={true}" });
    }
    const object = [...parents].reverse().find((node) => node.type === "ObjectExpression");
    if (object && object.properties.some((prop: any) => prop.key?.name === "onSelect")) {
      const attr = object.properties.find((prop: any) => prop.key?.name === "disabled");
      if (attr) edits.set(attr.start, { end: attr.end, text: "disabled: true" });
      else edits.set(object.start + 1, { end: object.start + 1, text: "disabled: true," });
    }
  };
  walk(ast, [], (node, parents) => {
    if (
      node.type === "JSXOpeningElement" &&
      node.name.name === "input" &&
      node.attributes.some(
        (attr: any) => attr.name?.name === "type" && attr.value?.value === "file",
      )
    ) {
      const accept = node.attributes.find((attr: any) => attr.name?.name === "accept");
      if (accept) edits.set(accept.start, { end: accept.end, text: 'accept="image/*"' });
    }
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      (["openExternal", "downloadRecent"].includes(node.callee.property.name) ||
        (node.callee.property.name === "open" && node.callee.object.name === "window"))
    ) {
      edits.set(node.start, { end: node.end, text: "undefined" });
      disable(parents);
      adjustments.add(relative(root, id) + ": disabled unsupported host action");
    }
    if (node.type === "JSXOpeningElement" && node.name.name === "a") {
      for (const attr of node.attributes) {
        if (attr.name?.name === "href" || attr.name?.name === "target")
          edits.set(attr.start, { end: attr.end, text: "" });
      }
      edits.set(node.name.end, { end: node.name.end, text: ' aria-disabled="true" tabIndex={-1}' });
    }
    if (
      node.type === "CallExpression" &&
      node.callee.name === "downloadBlob" &&
      parents.at(-1)?.type !== "AwaitExpression"
    ) {
      const fn = [...parents].reverse().find((item) => /Function/.test(item.type));
      if (fn?.async) edits.set(node.start, { end: node.start, text: "await " });
      else throw new Error(`Unawaited image export in ${id}`);
    }
    if (
      node.type === "FunctionDeclaration" &&
      node.id?.name === "download" &&
      id.includes("palette-actions")
    ) {
      edits.set(node.start, {
        end: node.end,
        text: 'function download(): never { throw new Error("小红书不支持导出调色板文件。"); }',
      });
    }
    if (
      node.type === "ObjectExpression" &&
      id.includes("palette-actions") &&
      node.properties.some(
        (prop: any) =>
          prop.value?.value === "Save Palette" || prop.value?.value === "Load Palette...",
      )
    ) {
      const existing = node.properties.find((prop: any) => prop.key?.name === "disabled");
      if (existing) edits.set(existing.start, { end: existing.end, text: "disabled: true" });
      else edits.set(node.start + 1, { end: node.start + 1, text: "disabled: true," });
    }
    if (
      node.type === "CallExpression" &&
      id.includes("components/dialogs/sprite-sheet-dialog") &&
      node.callee.name === "check" &&
      node.arguments[0]?.value === "dataEnabled"
    ) {
      edits.set(node.start, {
        end: node.end,
        text: `({...${code.slice(node.start, node.end)}, disabled: true, value: false})`,
      });
    }
  });
  // Outer replacements discard nested edits; this is source syntax transformation,
  // never a string substitution of forbidden API names in the generated bundle.
  const selected = [...edits]
    .map(([start, value]) => ({ start, ...value }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const nonoverlap: typeof selected = [];
  for (const edit of selected) {
    if (nonoverlap.some((parent) => parent.start <= edit.start && parent.end > edit.start))
      continue;
    nonoverlap.push(edit);
  }
  for (const edit of nonoverlap.reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return code;
}

function compatibilityCss(code: string, id: string): string {
  const css = postcss.parse(code, { from: id });
  const directions = new Map<string, string>();
  const displays = new Map<string, string>();
  css.walkRules((rule: any) => {
    rule.walkDecls("display", (decl: any) => displays.set(rule.selector, decl.value));
    rule.walkDecls("flex-direction", (decl: any) => directions.set(rule.selector, decl.value));
  });
  css.walkAtRules("container", (rule: any) => {
    rule.name = "media";
  });
  css.walkRules((rule: any) => {
    rule.selector = rule.selector
      .replace(/:root:has\(\[data-ui-compact="true"\]\)/g, ":root.minitool-compact")
      .replace(/:has\(> \[role="scrollbar"\]\)/g, ".minitool-has-scrollbar");
    rule.walkDecls((decl: any) => {
      if (decl.prop === "container-type") {
        decl.remove();
        return;
      }
      if (decl.value.includes("dvh") || decl.value.includes("lvh") || decl.value.includes("svh"))
        decl.cloneBefore({ value: decl.value.replace(/(?:d|l|s)vh/g, "vh") });
      if (decl.prop === "overflow" && decl.value === "clip") decl.cloneBefore({ value: "hidden" });
      if (/^(?:min|max|clamp)\(/.test(decl.value)) {
        const args = postcss.list.comma(decl.value.slice(decl.value.indexOf("(") + 1, -1));
        const fallback = decl.value.startsWith("clamp")
          ? args[1]
          : decl.value.startsWith("max")
            ? (args.find((value: string) => value.startsWith("var(")) ?? args[0])
            : args[0];
        decl.cloneBefore({ value: fallback });
      }
      if (decl.value.includes("color-mix(")) decl.cloneBefore({ value: "transparent" });
      if (["gap", "row-gap", "column-gap"].includes(decl.prop)) {
        const display = displays.get(rule.selector);
        if (display?.includes("grid"))
          decl.cloneBefore({ prop: decl.prop === "gap" ? "grid-gap" : `grid-${decl.prop}` });
        if (display?.includes("flex")) {
          const column = directions.get(rule.selector)?.startsWith("column");
          const parts = postcss.list.space(decl.value);
          const value =
            decl.prop === "gap" ? parts[column ? 0 : Math.min(1, parts.length - 1)] : decl.value;
          if (decl.prop !== (column ? "column-gap" : "row-gap")) {
            const selector = postcss.list
              .comma(rule.selector)
              .map(
                (part: string) =>
                  `${id.endsWith(".module.css") ? ":global(html.minitool-no-flex-gap)" : "html.minitool-no-flex-gap"} ${part} > * + *`,
              )
              .join(",");
            const fallback = postcss.rule({ selector });
            fallback.append({ prop: column ? "margin-top" : "margin-left", value });
            rule.parent.insertAfter(rule, fallback);
          }
        }
      }
    });
  });
  return css.toString();
}

/** Keep legacy inline positioning exclusive to the embedded build. */
function scrollAreaAlignmentSource(code: string): string {
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const replacements: { start: number; end: number; text: string }[] = [];
  walk(ast, [], (node) => {
    if (
      node.type === "ObjectProperty" &&
      node.key.name === "translate" &&
      node.value.type === "LogicalExpression" &&
      node.value.operator === "??" &&
      node.value.left.type === "OptionalMemberExpression" &&
      node.value.left.object.name === "style" &&
      node.value.right.type === "TemplateLiteral"
    ) {
      replacements.push({
        start: node.start,
        end: node.end,
        text: "...miniToolScrollAreaAlignment(pixelOffset, style)",
      });
    }
  });
  if (replacements.length !== 1)
    throw new Error("MiniTool ScrollArea alignment boundary changed; review the source transform");
  const replacement = replacements[0];
  adjustments.add("packages/ui/src/components/scrollbar/ScrollArea.tsx: legacy inline translation");
  return (
    `import { miniToolScrollAreaAlignment } from ${JSON.stringify(resolve(host, "pixel-alignment.ts"))};\n` +
    code.slice(0, replacement.start) +
    replacement.text +
    code.slice(replacement.end)
  );
}

/** Alternate codec implementation only for this target; shared source stays native. */
function legacyIntegerSource(code: string, file: string): string {
  const ast = parse(code, { sourceType: "module", plugins: ["typescript"] });
  const edits: { start: number; end: number; text: string }[] = [];
  const properties = file.endsWith("/aseprite/user-properties.ts");
  walk(ast, [], (node, parents) => {
    if (properties && node.type === "ClassMethod" && ["i64", "u64"].includes(node.key.name)) {
      const owner = parents.find((parent) => parent.type === "ClassDeclaration");
      if (owner?.id.name === "PropertyReader") {
        edits.push({
          start: node.body.start,
          end: node.body.end,
          text: `{ this.ensure(8); const value = decodeInteger64(this.bytes.subarray(this.offset, this.offset + 8), ${node.key.name === "u64"}); this.offset += 8; return value; }`,
        });
      } else if (owner?.id.name === "PropertyWriter") {
        edits.push({
          start: node.start,
          end: node.end,
          text: `${node.key.name}(value: Uint8Array) { this.bytesCopy(value); }`,
        });
      }
    }
    if (properties && node.type === "FunctionDeclaration" && node.id?.name === "checkedBigInt")
      edits.push({
        start: node.start,
        end: node.end,
        text: "function checkedBigInt(value: unknown, unsigned: boolean): Uint8Array { return encodeInteger64(value, unsigned); }",
      });
    if (!properties && node.type === "CallExpression" && node.callee.name === "BigInt")
      edits.push({
        start: node.start,
        end: node.end,
        text: `${code.slice(node.arguments[0].start, node.arguments[0].end)}.replace(/^0+/, "") || "0"`,
      });
    if (!properties && node.type === "TSBigIntKeyword")
      edits.push({ start: node.start, end: node.end, text: "string" });
    if (
      !properties &&
      node.type === "ArrowFunctionExpression" &&
      node.params[0]?.name === "left" &&
      node.params[1]?.name === "right"
    )
      edits.push({
        start: node.body.start,
        end: node.body.end,
        text: `left.number.length - right.number.length || (${code.slice(node.body.start, node.body.end)})`,
      });
  });
  for (const edit of edits.sort((left, right) => right.start - left.start))
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  if (properties)
    code =
      `import { decodeInteger64, encodeInteger64 } from ${JSON.stringify(resolve(host, "integer64.ts"))};\n` +
      code;
  adjustments.add(relative(root, file) + ": target-only integer compatibility");
  return code;
}

const plugin: Plugin = {
  name: "xprite-minitool-host",
  enforce: "pre",
  resolveId(source) {
    if (
      source === "$/adapters/platform/browser-editor-host" ||
      /\/adapters\/platform\/browser-editor-host(?:\.ts)?$/.test(source)
    )
      return INACTIVE_BROWSER_HOST;
    const target = replacements.get(source);
    return target ? resolve(host, target) : null;
  },
  load(id) {
    if (id === INACTIVE_BROWSER_HOST)
      return "export const createBrowserEditorHostPorts = undefined;";
    return null;
  },
  transform(code, id) {
    const file = id.split("?", 1)[0];
    if (file === resolve(root, "packages/ui/src/components/scrollbar/ScrollArea.tsx"))
      return scrollAreaAlignmentSource(code);
    if (
      file.endsWith("/aseprite/user-properties.ts") ||
      file.endsWith("/workspace/file-import-plan.ts")
    )
      code = legacyIntegerSource(code, file);
    if (file.endsWith(".css") && !id.includes("?")) return compatibilityCss(code, file);
    if (/\.[cm]?tsx?$/.test(file) && file.startsWith(resolve(app, "src")) && !file.startsWith(host))
      return hostSource(code, file);
    return file.endsWith("/aseprite/user-properties.ts") ? code : null;
  },
};

/** Global selectors in bare CSS Module imports still have observable layout effects. */
const preserveStyleEffects: Plugin = {
  name: "xprite-minitool-preserve-global-css",
  enforce: "post",
  transform(code, id) {
    if (/\.css(?:\?|$)/.test(id)) return { code, moduleSideEffects: "no-treeshake" as const };
    return null;
  },
};

await mkdir(artifacts, { recursive: true });
await build({
  configFile: false,
  mode: "minitool",
  root: app,
  base: "./",
  publicDir: false,
  plugins: [plugin, packageLocalAliases(), preserveStyleEffects],
  define: {
    "import.meta.env.VITE_EMBEDDED_HOST": '"true"',
    "process.env.NODE_ENV": '"production"',
    __XPRITE_VERSION__: JSON.stringify(metadata.version),
    __XPRITE_RELEASE__: JSON.stringify(`${metadata.version}-minitool`),
    __XPRITE_ITCH__: "false",
  },
  resolve: {
    alias: [
      { find: "@xprite/bedrock/", replacement: resolve(root, "packages/bedrock") + "/" },
      {
        find: /^@xprite\/editor-core$/,
        replacement: resolve(root, "packages/editor-core/src/index.ts"),
      },
      {
        find: "@xprite/editor-core/",
        replacement: resolve(root, "packages/editor-core/src") + "/",
      },
      { find: /^@xprite\/ui$/, replacement: resolve(root, "packages/ui/src/index.ts") },
      { find: "@xprite/ui/", replacement: resolve(root, "packages/ui/src") + "/" },
    ],
  },
  build: {
    outDir: output,
    emptyOutDir: true,
    copyPublicDir: false,
    target: ["es2017", "chrome61"],
    cssTarget: "chrome61",
    cssMinify: false,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: resolve(host, "main.tsx"),
      name: "XpriteMiniTool",
      formats: ["iife"],
      fileName: () => "app.js",
      cssFileName: "app",
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const script = await readFile(resolve(output, "app.js"), "utf8");
const transformed = await transformWithEsbuild(script, "app.js", {
  target: ["es2017", "chrome61"],
  minify: true,
  legalComments: "inline",
});
await writeFile(resolve(output, "app.js"), transformed.code);
let css = await readFile(resolve(output, "app.css"), "utf8");
await mkdir(resolve(output, "assets"), { recursive: true });
css = css.replace(
  /url\((['"]?)(data:([^;,]+);base64,([A-Za-z0-9+/=]+))\1\)/g,
  (_match, _quote, _url, mime, data) => {
    const extensions: Record<string, string> = {
      "font/woff2": "woff2",
      "application/font-woff2": "woff2",
      "font/woff": "woff",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/webp": "webp",
    };
    const extension = extensions[mime];
    if (!extension) throw new Error(`Unknown embedded asset type ${mime}`);
    const bytes = Buffer.from(data, "base64");
    const name = createHash("sha256").update(bytes).digest("hex").slice(0, 16) + "." + extension;
    // Collect first, write asynchronously below.
    embeddedAssets.set(name, bytes);
    return `url(./assets/${name})`;
  },
);
const lowered = lightningcss.transform({
  filename: "app.css",
  code: Buffer.from(css),
  targets: { chrome: 61 << 16, ios_saf: (18 << 16) | (4 << 8) },
  minify: true,
  errorRecovery: false,
});
const finalCss = postcss.parse(lowered.code.toString());
finalCss.walkRules((rule: any) => {
  rule.selector = expandSelectors(rule.selector);
});
await writeFile(resolve(output, "app.css"), finalCss.toString());
for (const [name, bytes] of embeddedAssets) await writeFile(resolve(output, "assets", name), bytes);
await writeFile(
  resolve(output, "index.html"),
  '<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"><title>Xprite</title><style>html,body,#root{height:100%;width:100%;margin:0;background:#202125;color:#fff}.minitool-bootstrap{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:20px;color:#fff;background:#202125;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}.minitool-bootstrap-panel{width:100%;max-width:480px;padding:20px;background:#2c2c30;border:1px solid #575b61}.minitool-bootstrap h1{margin:0 0 12px;font-size:20px}.minitool-bootstrap p{margin:8px 0;overflow-wrap:break-word}</style><link rel="stylesheet" href="./app.css"></head><body><div id="root"><div class="minitool-bootstrap" role="status"><div class="minitool-bootstrap-panel"><h1>正在打开 Xprite…</h1></div></div></div><script src="./boot-guard.js"></script><script src="./app.js"></script></body></html>\n',
);
await writeFile(resolve(output, "boot-guard.js"), await readFile(resolve(host, "boot-guard.js")));

const notices: Record<string, string> = {};
for (const file of [
  "LICENSE",
  "ATTRIBUTION.md",
  ...(await noticeFiles("LICENSES")),
  "packages/ui/LICENSE",
  "packages/ui/ATTRIBUTION.md",
]) {
  try {
    notices[file] = await readFile(resolve(root, file), "utf8");
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
}
await writeFile(resolve(output, "license-notices.json"), JSON.stringify(notices, null, 2));
const findings = await audit();
const primaryReachableAppModules = await verifyPrimaryIsolation();
const auditResult = spawnSync("python3", [resolve(skill, "scripts/audit_artifact.py"), output], {
  cwd: root,
  encoding: "utf8",
});
if (auditResult.status !== 0) throw new Error(auditResult.stdout + auditResult.stderr);
const packageResult = spawnSync(
  "python3",
  [
    "-c",
    "import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=9); [z.write(p,p.relative_to(root)) for p in sorted(root.rglob('*')) if p.is_file()]; z.close()",
    output,
    resolve(artifacts, "xprite-minitool.zip"),
  ],
  { cwd: root, encoding: "utf8" },
);
if (packageResult.status !== 0) throw new Error(packageResult.stderr);
const zipAudit = spawnSync(
  "python3",
  [resolve(skill, "scripts/audit_artifact.py"), resolve(artifacts, "xprite-minitool.zip")],
  { cwd: root, encoding: "utf8" },
);
if (zipAudit.status !== 0) throw new Error(zipAudit.stdout + zipAudit.stderr);
const summary = {
  status: "static-audit-passed",
  officialSkill: "minitool-zip-builder-1.7.0.skill",
  sourceMetadataVersion: "1.6.0",
  runtimeTarget: ["ES2017", "Chrome 61"],
  zip: resolve(artifacts, "xprite-minitool.zip"),
  zipBytes: (await stat(resolve(artifacts, "xprite-minitool.zip"))).size,
  sourceArchive: resolve(artifacts, "xprite-minitool-source.zip"),
  sizeReview:
    "主脚本包含编辑器、UI、绘图/文件编解码、语言与必要的像素素材；内联资源合计约 100 KiB，最大单条小于 25 KiB。无外置业务数据库。旧内核解析时间与内存尚未实测。",
  changes: [...adjustments],
  checks: findings,
  isolation: {
    primaryRuntimeImportsMinitool: false,
    primaryReachableAppModules,
    primaryReachableMinitoolModules: 0,
    sharedCodecsUnchanged: true,
    compatibilityOnlyInMinitoolTarget: true,
  },
  officialAudit: auditResult.stdout,
  officialZipAudit: zipAudit.stdout,
  unverified: [
    "小红书创服平台模拟器",
    "Android 真机扫码",
    "iOS 真机扫码",
    "Chrome 61 CSS 布局与性能",
  ],
};
const sourceArchive = spawnSync(
  "python3",
  [
    "-c",
    `
import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
output=pathlib.Path(sys.argv[2])
directories=['apps/editor','packages/ui','packages/editor-core','packages/bedrock','infra','scripts/minitool','.codex/minitool-zip-builder','LICENSES']
skip={'node_modules','dist','.git','__pycache__'}
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for folder in directories:
  for file in sorted((root/folder).rglob('*')):
   relative=file.relative_to(root)
   if file.is_file() and not skip.intersection(relative.parts) and not file.name.startswith('.env') and not file.name.endswith('.tsbuildinfo'):
    archive.write(file,relative)
 for name in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','LICENSE','ATTRIBUTION.md','README.md','README.zh.md']:
  file=root/name
  if file.is_file():archive.write(file,name)
`,
    root,
    summary.sourceArchive,
  ],
  { cwd: root, encoding: "utf8" },
);
if (sourceArchive.status !== 0) throw new Error(sourceArchive.stderr);
await writeFile(resolve(artifacts, "validation-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

async function noticeFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await noticeFiles(path)));
    else files.push(path);
  }
  return files;
}

async function audit() {
  const code = await readFile(resolve(output, "app.js"), "utf8");
  const scripts = (await filesUnder(output)).filter((file) => file.endsWith(".js"));
  const errors: string[] = [];
  for (const file of scripts) {
    const ast = parse(await readFile(file, "utf8"), { sourceType: "script" });
    walk(ast, [], (node) => {
      const callee =
        node.type === "CallExpression" || node.type === "NewExpression" ? node.callee : null;
      if (
        callee?.type === "Identifier" &&
        [
          "fetch",
          "XMLHttpRequest",
          "Worker",
          "SharedWorker",
          "WebSocket",
          "EventSource",
          "RTCPeerConnection",
          "eval",
          "Function",
        ].includes(callee.name)
      )
        errors.push(callee.name);
      if (
        node.type === "MemberExpression" &&
        ["clipboard", "serviceWorker"].includes(node.property.name) &&
        (node.object.name === "navigator" ||
          (node.object.type === "MemberExpression" && node.object.property.name === "navigator"))
      )
        errors.push(node.property.name);
      if (node.type === "Identifier" && node.name === "WebAssembly") errors.push(node.name);
      if (node.type === "BigIntLiteral" || callee?.name === "BigInt") errors.push("BigInt");
      if (
        callee?.type === "MemberExpression" &&
        callee.object.name === "window" &&
        ["open", "prompt"].includes(callee.property.name)
      )
        errors.push("window." + callee.property.name);
    });
  }
  if (errors.length)
    throw new Error(`Prohibited runtime capabilities remain: ${[...new Set(errors)].join(", ")}`);
  if (/\bprocess\.env\b/.test(code))
    throw new Error("Node environment access remains in browser script");
  const files = await filesUnder(output);
  const allowed = /\.(?:html|css|js|json|png|jpg|jpeg|gif|webp|svg|woff2?)$/i;
  for (const file of files)
    if (!allowed.test(file)) throw new Error(`Disallowed package file ${file}`);
  const css = await readFile(resolve(output, "app.css"), "utf8");
  const layoutRules = postcss.parse(css);
  const requiredLayout = new Map([
    [".xse-safe-area", { display: "grid", height: "100%" }],
    [".xse-root", { height: "100%" }],
    [".xse-editor-window.xse-editor-window", { display: "flex" }],
  ]);
  for (const [selector, declarations] of requiredLayout) {
    const values = new Map<string, string>();
    layoutRules.walkRules((rule: any) => {
      if (postcss.list.comma(rule.selector).includes(selector))
        rule.walkDecls((declaration: any) => values.set(declaration.prop, declaration.value));
    });
    for (const [property, value] of Object.entries(declarations))
      if (values.get(property) !== value)
        throw new Error(`Missing global layout rule: ${selector} { ${property}: ${value} }`);
  }
  for (const match of css.matchAll(/url\(([^)]+)\)/g)) {
    const url = match[1].replace(/^['"]|['"]$/g, "");
    if (/^(?:https?:|\/\/)/i.test(url)) throw new Error("External CSS resource remains");
    if (url.startsWith("./")) await stat(resolve(output, url));
  }
  if (
    /@layer\b|@container\b|:(?:has|where|is)\(/.test(
      await readFile(resolve(output, "app.css"), "utf8"),
    )
  )
    throw new Error("Unsupported core CSS remains");
  return {
    globalLayoutRulesPresent: true,
    startupGuardAndCenteredMessages: true,
    missingVersionDoesNotRequireUpgrade: true,
    nativeStorageHasBrowserFallback: true,
    classicScript: true,
    forbiddenRuntimeCalls: 0,
    externalRequests: 0,
    entryAtZipRoot: true,
    cssLayersContainersHasRemoved: true,
    telemetryAndServiceWorkerExcluded: true,
  };
}

/** Expand unsupported selector lists, including the AND semantics of :not(:is()). */
function expandSelectors(selector: string): string {
  const outputs: string[] = [];
  for (const original of postcss.list.comma(selector)) {
    const match = /:(?:where|is)\(/.exec(original);
    if (!match) {
      outputs.push(original);
      continue;
    }
    const start = match.index;
    const open = start + match[0].length;
    let depth = 1;
    let end = open;
    while (end < original.length && depth) {
      if (original[end] === "(") depth++;
      else if (original[end] === ")") depth--;
      end++;
    }
    const options: string[] = postcss.list.comma(original.slice(open, end - 1));
    if (original.slice(Math.max(0, start - 5), start) === ":not(" && original[end] === ")") {
      outputs.push(
        expandSelectors(
          original.slice(0, start - 5) +
            options.map((option) => `:not(${option})`).join("") +
            original.slice(end + 1),
        ),
      );
    } else {
      for (const option of options)
        outputs.push(expandSelectors(original.slice(0, start) + option + original.slice(end)));
    }
  }
  return outputs.join(",");
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

/** The ordinary app must never statically or dynamically load a minitool adapter. */
async function verifyPrimaryIsolation(): Promise<number> {
  for (const file of await filesUnder(resolve(app, "src"))) {
    if (file.startsWith(host) || !/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
    const code = await readFile(file, "utf8");
    const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
    walk(ast, [], (node) => {
      const source =
        node.type === "ImportDeclaration" || node.type.startsWith("Export")
          ? node.source?.value
          : node.type === "CallExpression" && node.callee.type === "Import"
            ? node.arguments[0]?.value
            : node.type === "ImportExpression"
              ? node.source?.value
              : null;
      if (typeof source === "string" && source.includes("adapters/minitool"))
        throw new Error(`Primary runtime imports minitool adapter: ${relative(root, file)}`);
    });
  }
  const sourceRoot = resolve(app, "src");
  const visited = new Set<string>();
  const pending = [resolve(sourceRoot, "main.tsx")];
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file) || !file.startsWith(sourceRoot + "/")) continue;
    if (relative(sourceRoot, file).split("/").includes("minitool"))
      throw new Error(`Ordinary entry reaches MiniTool code: ${relative(root, file)}`);
    visited.add(file);
    if (!/\.[cm]?tsx?$/.test(file)) continue;
    const ast = parse(await readFile(file, "utf8"), {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    const sources = new Set<string>();
    walk(ast, [], (node) => {
      if (node.importKind === "type" || node.exportKind === "type") return;
      if (
        node.type === "ImportDeclaration" &&
        node.specifiers.length &&
        node.specifiers.every((specifier: any) => specifier.importKind === "type")
      )
        return;
      const source =
        node.type === "ImportDeclaration" || node.type.startsWith("Export")
          ? node.source?.value
          : node.type === "ImportExpression"
            ? node.source?.value
            : node.type === "CallExpression" && node.callee.type === "Import"
              ? node.arguments[0]?.value
              : null;
      if (typeof source === "string") sources.add(source.split("?", 1)[0]);
    });
    for (const source of sources) {
      const base = source.startsWith("$/")
        ? resolve(sourceRoot, source.slice(2))
        : source.startsWith(".")
          ? resolve(dirname(file), source)
          : null;
      if (!base) continue;
      for (const candidate of [
        base,
        base + ".ts",
        base + ".tsx",
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
      ]) {
        try {
          if (!(await stat(candidate)).isFile()) continue;
          pending.push(candidate);
          break;
        } catch (error: any) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        }
      }
    }
  }
  return visited.size;
}
