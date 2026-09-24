#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
/** Captures only a fresh, isolated Aseprite process's own NSView tree. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import {
  resolveAsepriteExecutable,
  resolveAsepriteSource,
  resolveSkiaRoot,
} from "../../base/reference-paths.mjs";
import { defaultArtwork } from "../../fixtures/editor/default-artwork.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const options = {
  prefix: ".tmp/aseprite-pixel-cat-menubar",
  fixture: defaultArtwork.sourcePath,
  projectFixture: null,
  frame: null,
  zoom: 1,
  zoomFocus: "center-sprite",
  app: resolveAsepriteExecutable(),
  source: resolveAsepriteSource(),
  colorbar: 76,
  timeline: 74.9,
  theme: "light",
  menubar: "visible",
  scope: "window",
  palette: "source",
  layer: "regular",
  state: "baseline",
  tool: "pencil",
  inventory: false,
  capabilities: "full",
  homeLayout: "full",
  shortcutPlatform: "aseprite",
  normalization: "bilinear",
  skia: resolveSkiaRoot(),
  timeout: 45000,
  force: false,
};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--help") {
    console.log(
      "node scripts/visual-audit/aseprite/capture-own-window.mjs [--prefix PATH] [--fixture PNG | --project-fixture ASEPRITE] [--frame ONE_BASED_FRAME] [--app EXECUTABLE] [--source SOURCE_ROOT] [--colorbar 76] [--timeline 74.9] [--theme light|dark] [--menubar visible|hidden] [--scope window|client] [--palette source|image] [--layer regular|background|preserve] [--tool TOOL_ID] [--inventory] [--capabilities full|basic] [--home-layout full|no-news|no-news-no-folders] [--shortcut-platform aseprite|windows] [--normalization bilinear|nearest] [--skia SKIA_ROOT] [--state baseline|layer-properties|frame-properties|color-popup-foreground|color-popup-hsv|insert-text|new-sprite|preferences|grid|layer-edges|home|file-menu|file-export-menu|view-menu|view-show-menu|selection-handles|close-dirty] [--timeout 45000] [--force]",
    );
    process.exit(0);
  }
  if (arg === "--force") {
    options.force = true;
    continue;
  }
  if (arg === "--inventory") {
    options.inventory = true;
    continue;
  }
  const key =
    arg === "--zoom-focus"
      ? "zoomFocus"
      : arg === "--home-layout"
        ? "homeLayout"
        : arg === "--shortcut-platform"
          ? "shortcutPlatform"
          : arg === "--project-fixture"
            ? "projectFixture"
            : arg.slice(2);
  if (!arg.startsWith("--") || !(key in options) || !process.argv[i + 1])
    throw new Error(`Unknown or incomplete option: ${arg}`);
  options[key] = ["colorbar", "timeline", "timeout", "zoom"].includes(key)
    ? Number(process.argv[++i])
    : process.argv[++i];
}
if (!["center-sprite", "anchor-center"].includes(options.zoomFocus))
  throw Error("Invalid zoom focus");
if (process.platform !== "darwin") throw new Error("Own NSWindow capture requires macOS.");
if (
  !(
    options.colorbar >= 50 &&
    options.colorbar <= 300 &&
    options.timeline > 0 &&
    options.timeline < 100 &&
    options.timeout >= 5000 &&
    options.timeout <= 300000
  )
)
  throw new Error("Invalid dock geometry or timeout.");
if (
  ![
    "baseline",
    "tilemap-tiles",
    "tilemap-selected",
    "tilemap-flipped",
    "new-tilemap-dialog",
    "layer-properties",
    "frame-properties",
    "color-popup-foreground",
    "color-popup-hsv",
    "color-hover-main",
    "color-hover-hue",
    "color-hover-alpha",
    "insert-text",
    "new-sprite",
    "preferences",
    "grid",
    "layer-edges",
    "home",
    "file-menu",
    "file-export-menu",
    "view-menu",
    "view-show-menu",
    "selection-handles",
    "close-dirty",
    "sprite-size",
    "canvas-size",
    "layer-mode",
    "group-properties",
    "preferences-experimental",
    "selection-expand",
    "selection-contract",
    "selection-border",
    "color-range",
    "grid-settings",
    "replace-color",
    "hue-saturation",
    "brightness-contrast",
    "invert-color",
    "outline",
    "export-sheet",
    "import-sheet",
    "export-file",
    "preview",
    "timeline-settings",
    "export-sheet-sprite",
    "export-sheet-borders",
    "export-sheet-output",
    "export-sheet-output-expanded",
    "gif-options",
    "symmetry",
    "tiled",
    "onion",
    "ink-shading",
    "dynamics-gradient",
    "palette-presets",
  ].includes(options.state)
)
  throw new Error("Unsupported capture state.");
const supportedTools = [
  "pencil",
  "rectangular_marquee",
  "lasso",
  "move",
  "eyedropper",
  "zoom",
  "paint_bucket",
  "eraser",
  "line",
  "rectangle",
  "contour",
  "blur",
  "text",
  "elliptical_marquee",
  "polygonal_lasso",
  "magic_wand",
  "filled_rectangle",
  "ellipse",
  "filled_ellipse",
  "curve",
  "polygon",
  "filled_polygon",
  "gradient",
];
if (!supportedTools.includes(options.tool))
  throw new Error(`Unsupported tool. Choose ${supportedTools.join(", ")}.`);
if (!["visible", "hidden"].includes(options.menubar))
  throw new Error("--menubar must be visible or hidden.");
if (!["light", "dark"].includes(options.theme)) throw new Error("--theme must be light or dark.");
if (!["window", "client"].includes(options.scope))
  throw new Error("--scope must be window or client.");
if (!["source", "image"].includes(options.palette))
  throw new Error("--palette must be source or image.");
if (!["regular", "background", "preserve"].includes(options.layer))
  throw new Error("--layer must be regular, background, or preserve.");
if (options.projectFixture) {
  options.projectFixture = path.resolve(options.projectFixture);
  if (options.palette !== "source" || options.layer !== "preserve")
    throw new Error(
      "Project mode requires --palette source and --layer preserve to retain authored data.",
    );
  if (
    options.frame !== null &&
    (!Number.isInteger(Number(options.frame)) || Number(options.frame) < 1)
  )
    throw new Error("--frame must be a positive one-based frame number.");
}
if (!["full", "basic", "features1-6"].includes(options.capabilities))
  throw new Error("--capabilities must be full or basic.");
if (options.capabilities !== "full" && options.scope !== "client")
  throw new Error("Basic capability fixture requires declared client geometry.");
if (options.capabilities !== "full") options.inventory = true;
if (!["full", "no-news", "no-news-no-folders"].includes(options.homeLayout))
  throw new Error("--home-layout must be full, no-news, or no-news-no-folders.");
if (options.homeLayout !== "full" && options.state !== "home")
  throw new Error("No-news customization requires Home state.");
if (options.homeLayout !== "full") options.inventory = true;
if (!["bilinear", "nearest"].includes(options.normalization))
  throw new Error("--normalization must be bilinear or nearest.");
if (!["aseprite", "windows"].includes(options.shortcutPlatform))
  throw new Error("--shortcut-platform must be aseprite or windows.");
if (options.shortcutPlatform === "windows") options.inventory = true;
if (
  [
    "new-tilemap-dialog",
    "layer-properties",
    "frame-properties",
    "file-export-menu",
    "preferences",
    "view-menu",
    "view-show-menu",
    "selection-handles",
    "close-dirty",
    "sprite-size",
    "canvas-size",
    "layer-mode",
    "group-properties",
    "preferences-experimental",
    "selection-expand",
    "selection-contract",
    "selection-border",
    "color-range",
    "grid-settings",
    "replace-color",
    "hue-saturation",
    "brightness-contrast",
    "invert-color",
    "outline",
    "export-sheet",
    "import-sheet",
    "export-file",
    "preview",
    "timeline-settings",
    "export-sheet-sprite",
    "export-sheet-borders",
    "export-sheet-output",
    "export-sheet-output-expanded",
    "gif-options",
    "symmetry",
    "tiled",
    "onion",
    "ink-shading",
    "dynamics-gradient",
  ].includes(options.state)
)
  options.inventory = true;
if (
  options.tool === "text" ||
  [
    "sprite-size",
    "canvas-size",
    "layer-mode",
    "group-properties",
    "preferences-experimental",
    "selection-expand",
    "selection-contract",
    "selection-border",
    "color-range",
  ].includes(options.state)
)
  options.inventory = true;
const absolute = (p) => path.resolve(root, p);
const portablePathPrefixes = [
  [path.resolve(options.source), ".refs/aseprite"],
  [path.resolve(options.skia), ".refs/skia-arm64"],
  [path.resolve(root, ".refs/aseprite"), ".refs/aseprite"],
  [path.resolve(root, ".refs/libresprite"), ".refs/libresprite"],
  [os.tmpdir(), "$TMPDIR"],
  [path.resolve(root), "."],
].sort(([left], [right]) => right.length - left.length);
const portableMetadata = (value) => {
  if (typeof value === "string")
    return portablePathPrefixes
      .reduce((result, [prefix, replacement]) => result.split(prefix).join(replacement), value)
      .replace(
        new RegExp(
          `${String.fromCharCode(47)}Users${String.fromCharCode(47)}[^/]+${String.fromCharCode(47)}Downloads`,
          "g",
        ),
        "$REFERENCE_FIXTURES",
      )
      .replace(
        new RegExp(
          `${String.fromCharCode(47)}Applications${String.fromCharCode(47)}[^/]+\\.app`,
          "g",
        ),
        ".refs/aseprite/build/bin/Aseprite.app",
      );
  if (Array.isArray(value)) return value.map(portableMetadata);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [portableMetadata(key), portableMetadata(entry)]),
    );
  return value;
};
const prefix = absolute(options.prefix);
const outputs = Object.fromEntries(
  ["window", "client", "reference", "provenance", "log"].map((key) => [
    key,
    `${prefix}-${key}.${key === "provenance" ? "json" : key === "log" ? "txt" : "png"}`,
  ]),
);
await fs.mkdir(path.dirname(prefix), { recursive: true });
for (const output of Object.values(outputs)) {
  if (
    !options.force &&
    (await fs.access(output).then(
      () => true,
      () => false,
    ))
  )
    throw new Error(
      `Preserving existing output ${output}; use a new --prefix or explicit --force.`,
    );
}
const hash = async (file) =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
const themePackagePath = path.resolve(
  path.dirname(options.app),
  "../Resources/data/extensions/aseprite-theme/package.json",
);
const themePackage = JSON.parse(await fs.readFile(themePackagePath, "utf8"));
const themeContribution = themePackage.contributes?.themes?.find(
  (theme) => theme.variant?.toLowerCase() === options.theme,
);
if (!themeContribution?.id)
  throw new Error(`Installed theme package does not declare ${options.theme}.`);
const installedThemeDir = path.resolve(path.dirname(themePackagePath), themeContribution.path);
const themeProvenance = {
  variant: options.theme,
  selected: themeContribution.id,
  packagePath: themePackagePath,
  packageSha256: await hash(themePackagePath),
  themeXmlSha256: await hash(path.join(installedThemeDir, "theme.xml")),
  sheetSha256: await hash(path.join(installedThemeDir, "sheet.png")),
};
const scratchRoot = path.join(root, ".tmp");
await fs.mkdir(scratchRoot, { recursive: true });
const runDir = await fs.mkdtemp(path.join(scratchRoot, "aseprite-own-window-"));
const profileDir = path.join(runDir, "profile");
await fs.mkdir(profileDir);
let shortcutOverride = null;
if (options.shortcutPlatform === "windows") {
  const gui = path.resolve(path.dirname(options.app), "../Resources/data/gui.xml");
  const output = path.join(profileDir, "user.aseprite-keys");
  const generator = `import sys,copy,xml.etree.ElementTree as ET
source=ET.parse(sys.argv[1]).getroot().find('keyboard/commands')
root=ET.Element('keyboard', {'version':'1'}); commands=ET.SubElement(root,'commands')
removed=[]; added=[]
for key in source.findall('key'):
    command=key.get('command','').strip()
    if not command: continue
    mac=key.get('mac',key.get('shortcut')); win=key.get('win',key.get('shortcut'))
    for shortcut,remove,dest in [(mac,True,removed),(win,False,added)]:
        if not shortcut: continue
        attrs={'command':command,'shortcut':shortcut}
        if 'context' in key.attrib: attrs['context']=key.get('context')
        if remove: attrs['removed']='true'
        elem=ET.Element('key',attrs)
        for param in key.findall('param'): elem.append(copy.deepcopy(param))
        dest.append(elem)
for key in removed+added: commands.append(key)
ET.indent(root); ET.ElementTree(root).write(sys.argv[2],encoding='utf-8',xml_declaration=True)
print(str(len(removed))+','+str(len(added)))`;
  const counts = execFileSync("python3", ["-c", generator, gui, output], { encoding: "utf8" })
    .trim()
    .split(",")
    .map(Number);
  shortcutOverride = {
    platform: "windows",
    source: gui,
    sourceSha256: await hash(gui),
    path: output,
    sha256: await hash(output),
    removedCommandBindings: counts[0],
    addedCommandBindings: counts[1],
    toolsUntouched: true,
    xml: await fs.readFile(output, "utf8"),
  };
}

const lua = path.join(runDir, "capture.lua");
const fixturePath = options.projectFixture ?? path.resolve(options.fixture);
const fixtureName =
  fixturePath === path.resolve(defaultArtwork.sourcePath)
    ? defaultArtwork.name
    : path.basename(fixturePath);
const fixture = path.join(runDir, fixtureName);
const module = path.join(runDir, "aseprite-window-capture.dylib");
await fs.copyFile(absolute("scripts/visual-audit/aseprite/reference-capture.lua"), lua);
await fs.copyFile(fixturePath, fixture);
const inputFixtureSha256 = await hash(fixture);
const inputPixels = options.projectFixture ? null : PNG.sync.read(await fs.readFile(fixture));
const inputPixelsSha256 = inputPixels
  ? crypto.createHash("sha256").update(inputPixels.data).digest("hex")
  : null;
let paletteColors = [];
if (options.palette === "image" && inputPixels) {
  const colors = new Map();
  for (let i = 0; i < inputPixels.data.length; i += 4) {
    const color = [...inputPixels.data.subarray(i, i + 4)];
    colors.set(color.join(","), color);
    if (colors.size > 256)
      throw new Error(
        "Image palette mode requires at most256 exact RGBA colors; quantization is deliberately not implicit.",
      );
  }
  paletteColors = [...colors.values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
  );
}

execFileSync(
  "clang++",
  [
    "-dynamiclib",
    "-framework",
    "Cocoa",
    "-o",
    module,
    absolute("scripts/visual-audit/aseprite/window-capture.mm"),
  ],
  { stdio: "pipe" },
);
let inventoryModule = null,
  inventoryBuild = null;
if (options.inventory) {
  inventoryModule = path.join(runDir, "aseprite-widget-inventory.dylib");
  const dependencyPath = path.join(runDir, "aseprite-widget-inventory.d");
  const includePaths = [
    path.join(options.source, "src"),
    path.join(options.source, "src/observable"),
    path.join(options.source, "laf"),
    path.join(options.source, "apps/editor/observable"),
    path.join(options.source, "build/laf"),
    path.join(options.source, "build/src/app"),
    options.skia,
  ];
  const compileArgs = [
    "-std=c++17",
    "-DNDEBUG",
    "-DOBSERVABLE_FAST_LIST",
    "-DLAF_SKIA=1",
    "-DLAF_MACOS=1",
    "-dynamiclib",
    "-undefined",
    "dynamic_lookup",
    "-framework",
    "Foundation",
    "-MMD",
    "-MF",
    dependencyPath,
    ...includePaths.flatMap((dir) => ["-I", dir]),
    absolute("scripts/visual-audit/aseprite/widget-inventory.mm"),
    "-o",
    inventoryModule,
  ];
  execFileSync("clang++", compileArgs, { stdio: "pipe" });
  const dependencies = (await fs.readFile(dependencyPath, "utf8"))
    .replaceAll(String.fromCharCode(92, 10), " ")
    .split(": ")
    .slice(1)
    .join(": ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  inventoryBuild = {
    operation:
      options.capabilities === "basic" ? "public-setEnabled-capability-fixture" : "read-only",
    compiler: execFileSync("clang++", ["--version"], { encoding: "utf8" }).split("\n")[0],
    compileArgs,
    moduleSha256: await hash(inventoryModule),
    dependencyHashes: Object.fromEntries(
      await Promise.all(dependencies.map(async (file) => [file, await hash(file)])),
    ),
  };
}

const accessKey = crypto.createHash("sha1").update(lua).digest("hex");
const ini = `[GfxMode]\nMaximized = true\nFrame = 0 0 0 0\n\n[general]\nscreen_scale = 2\nui_scale = 1\nshow_menu_bar = ${options.menubar === "visible" ? "true" : "false"}\nshow_full_path = false\nvisible_timeline = true\nworkspace_layout = _default_\ntimeline_layer_panel_width = 100\n\n[color_bar]\nbox_size = 11\nfg_color = rgb{255,255,255,255}\nbg_color = rgb{0,0,0,255}\nselector = 4\n\n[theme]\nselected = ${themeContribution.id}\n\n[MiniEditor]\nEnabled = false\n\n[layout:main_window]\ncolor_bar_splitter = ${options.colorbar}\ntimeline_splitter = ${options.timeline}\n\n[script_access]\n${accessKey} = 22\n`;
await fs.writeFile(path.join(profileDir, "aseprite.ini"), ini);
const rawWindow = path.join(runDir, "window.png"),
  rawClient = path.join(runDir, "client.png");
const args = [
  "--script-param",
  `zoomFocus=${options.zoomFocus}`,
  "--script-param",
  `zoom=${options.zoom}`,
  "--script-param",
  `homeLayout=${options.homeLayout}`,
  "--script-param",
  `capabilities=${options.capabilities}`,
  "--script-param",
  `layer=${options.layer}`,
  "--script-param",
  `scope=${options.scope}`,
  "--script-param",
  `palette=${paletteColors.map((color) => color.join(",")).join(";")}`,
  "--script-param",
  `tool=${options.tool}`,
  "--script-param",
  `state=${options.state}`,
  "--script-param",
  `output=${rawClient}`,
  "--script-param",
  `fixture=${fixture}`,
  "--script-param",
  `module=${module}`,
  "--script",
  lua,
];
if (options.frame !== null)
  args.splice(args.length - 2, 0, "--script-param", `frame=${Number(options.frame)}`);
if (inventoryModule)
  args.splice(args.length - 2, 0, "--script-param", `inventoryModule=${inventoryModule}`);
const startedAt = new Date().toISOString();
const child = spawn(options.app, args, {
  env: {
    ...process.env,
    ASEPRITE_USER_FOLDER: profileDir,
    ASEPRITE_REFERENCE_WINDOW_OUTPUT: rawWindow,
    ASEPRITE_REFERENCE_DOCUMENT_NAME: fixtureName,
    ASEPRITE_REFERENCE_SCOPE: options.scope,
    ASEPRITE_REFERENCE_TOOL: options.tool,
    ASEPRITE_REFERENCE_CAPABILITIES: options.capabilities,
    ASEPRITE_REFERENCE_HOME_LAYOUT: options.homeLayout,
    ASEPRITE_REFERENCE_STATE: options.state,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "",
  timedOut = false;
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
console.log(JSON.stringify({ pid: child.pid, runDir, profileDir, startedAt }));
// Only the exact child handle is signalled. Never match names or enumerate user processes.
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
}, options.timeout);
const armKill = setTimeout(() => {
  if (timedOut && child.exitCode === null) child.kill("SIGKILL");
}, options.timeout + 3000);
const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
}).finally(() => {
  clearTimeout(timer);
  clearTimeout(armKill);
});
await fs.writeFile(outputs.log, log);
if (timedOut || result.code !== 0)
  throw new Error(
    `Capture child failed: ${JSON.stringify({ ...result, timedOut, log: outputs.log, runDir })}`,
  );
const windowPng = PNG.sync.read(await fs.readFile(rawWindow)),
  clientPng = PNG.sync.read(await fs.readFile(rawClient));
if (
  windowPng.width !== 3840 ||
  windowPng.height !== 2100 ||
  clientPng.width !== 960 ||
  clientPng.height !== (options.scope === "client" ? 525 : 509)
)
  throw new Error(
    `Unexpected display geometry: window ${windowPng.width}x${windowPng.height}, client ${clientPng.width}x${clientPng.height}. Raw files preserved in ${runDir}; do not interpret or resize an incompatible capture.`,
  );
const preparedFixtureSha256 = await hash(fixture);
let preparedPixelsSha256 = null;
if (inputPixels) {
  const preparedPixels = PNG.sync.read(await fs.readFile(fixture));
  preparedPixelsSha256 = crypto.createHash("sha256").update(preparedPixels.data).digest("hex");
  if (
    preparedPixels.width !== inputPixels.width ||
    preparedPixels.height !== inputPixels.height ||
    preparedPixelsSha256 !== inputPixelsSha256
  )
    throw new Error("Palette setup changed fixture pixels; capture rejected.");
} else if (preparedFixtureSha256 !== inputFixtureSha256)
  throw new Error("Project fixture changed during isolated capture setup; capture rejected.");
await fs.copyFile(rawWindow, outputs.window);
await fs.copyFile(rawClient, outputs.client);
execFileSync("python3", [
  "-c",
  'from PIL import Image; import sys; im=Image.open(sys.argv[1]); mode=Image.Resampling.NEAREST if sys.argv[3]=="nearest" else Image.Resampling.BILINEAR; im.resize((1405,768),mode).save(sys.argv[2])',
  outputs.window,
  outputs.reference,
  options.normalization,
]);
const sourceFiles = [
  "src/app/ui/main_window.cpp",
  "src/app/ui/editor/editor.cpp",
  "src/app/ui/toolbar.cpp",
  "src/app/commands/screenshot.cpp",
  "src/app/script/security.h",
  "src/app/resource_finder.cpp",
];
const sourceHashes = {};
for (const relative of sourceFiles)
  sourceHashes[relative] = await hash(path.join(options.source, relative));
let sourceRevision = null;
try {
  sourceRevision = execFileSync("git", ["-C", options.source, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {}
const scan = (axis, fixed, start, end) => {
  const runs = [];
  let last = "";
  for (let i = start; i < end; i++) {
    const x = axis === "x" ? i : fixed,
      y = axis === "y" ? i : fixed;
    const color = [
      ...clientPng.data.subarray((y * clientPng.width + x) * 4, (y * clientPng.width + x) * 4 + 3),
    ];
    const key = color.join(",");
    if (key !== last) {
      runs.push({ at: i, rgb: color });
      last = key;
    }
  }
  return runs;
};
const inventoryLine = log.split("\n").find((line) => line.startsWith("ASEPRITE_WIDGET_INVENTORY:"));
const widgetInventory = inventoryLine
  ? JSON.parse(inventoryLine.slice("ASEPRITE_WIDGET_INVENTORY:".length))
  : null;
if (options.inventory && !widgetInventory)
  throw new Error("Read-only widget inventory missing; capture not certified.");
const portableWidgetInventory = portableMetadata(widgetInventory);
if (widgetInventory)
  await fs.writeFile(
    `${prefix}-widgets.json`,
    JSON.stringify(portableWidgetInventory, null, 2) + "\n",
  );
const metadataLine = log
  .split("\n")
  .find((line) => line.startsWith("ASEPRITE_WINDOW_VIEW_METADATA:"));
const ownWindowMetadata = metadataLine
  ? JSON.parse(metadataLine.slice("ASEPRITE_WINDOW_VIEW_METADATA:".length))
  : null;
const provenance = portableMetadata({
  shortcutOverride,
  widgetInventory: portableWidgetInventory
    ? {
        path: `${prefix}-widgets.json`,
        sha256: await hash(`${prefix}-widgets.json`),
        widgetCount: portableWidgetInventory.widgetCount,
        changes: portableWidgetInventory.changes,
        visibilityChanges: portableWidgetInventory.visibilityChanges,
        menuNavigation: portableWidgetInventory.menuNavigation,
        homeLayoutChanges: portableWidgetInventory.homeLayoutChanges,
        recentFolders: portableWidgetInventory.recentFolders,
        build: inventoryBuild,
      }
    : null,
  referenceScope:
    options.scope === "client"
      ? "Own temporary NSWindow borderless contentView at1920x1050points; OS decorations removed before sizing/capture, no image crop"
      : "macOS own-window capture; Windows-style browser chrome requires a separately declared shared client comparison",
  menubar: options.menubar,
  state: {
    zoom: options.zoom,
    zoomFocus: options.zoomFocus,
    termination: [
      "color-range",
      "replace-color",
      "hue-saturation",
      "brightness-contrast",
      "invert-color",
      "outline",
      "gif-options",
    ].includes(options.state)
      ? "own child exit immediately after successful PNG writes; avoids closing a document locked by the Aseprite modal ContextReader"
      : "Aseprite's app.exit",
    selectionAnimation:
      options.state === "selection-handles"
        ? {
            phase: 0,
            policy:
              "first selection created; public Manager dispatchMessages flushes paint without timer polling; captured in one Lua event callback before timer dispatch",
          }
        : null,
    name: options.state,
    tool: options.tool,
    capabilities: options.capabilities,
    exportChildCapabilities: options.state === "file-export-menu" ? options.capabilities : null,
    homeLayout: options.homeLayout,
    shortcutPlatform: options.shortcutPlatform,
    layer: options.layer,
    frame: options.frame === null ? null : Number(options.frame),
    colorPopupPinned: options.state.startsWith("color-popup-"),
  },
  ownWindowMetadata,
  captureMethod:
    "Isolated Aseprite own-process NSView cacheDisplayInRect + Aseprite Screenshot command",
  startedAt,
  completedAt: new Date().toISOString(),
  pid: child.pid,
  exit: result,
  runDir,
  profileDir,
  executable: options.app,
  executableSha256: await hash(options.app),
  sourceRoot: options.source,
  sourceRevision,
  sourceHashes,
  fixture: fixturePath,
  fixtureSha256: inputFixtureSha256,
  fixturePixelsSha256: inputPixelsSha256,
  preparedFixtureSha256,
  preparedPixelsSha256,
  layerPreparation: {
    mode: options.layer,
    publicCommand:
      options.layer === "regular"
        ? "LayerFromBackground if needed, activeLayer.name=Layer, saveAs isolated fixture copy"
        : options.layer === "preserve"
          ? "No layer conversion, rename, visibility, lock, or save preparation; opened project copied byte-for-byte"
          : "Assert Aseprite background fixture; retain background semantics",
    validation:
      "Lua validates the requested layer mode before capture; project mode preserves the authored layer graph.",
  },
  palette: {
    mode: options.palette,
    colors: paletteColors,
    preparation:
      options.palette === "image"
        ? "Public ChangePixelFormat rgb, Palette/setPalette, saveAs isolated copy; exact decoded RGBA invariant checked"
        : "Original fixture palette",
  },
  scripts: Object.fromEntries(
    await Promise.all(
      [
        "scripts/visual-audit/aseprite/reference-capture.lua",
        "scripts/visual-audit/aseprite/window-capture.mm",
        "scripts/visual-audit/aseprite/capture-own-window.mjs",
        "scripts/fixtures/editor/default-artwork.mjs",
      ].map(async (file) => [file, await hash(absolute(file))]),
    ),
  ),
  theme: themeProvenance,
  profileSeed: ini,
  profileAfter: await fs.readFile(path.join(profileDir, "aseprite.ini"), "utf8"),
  window: { width: windowPng.width, height: windowPng.height },
  client: { width: clientPng.width, height: clientPng.height },
  normalization: {
    width: 1405,
    height: 768,
    algorithm: options.normalization === "nearest" ? "Pillow NEAREST" : "Pillow BILINEAR",
    input:
      options.scope === "client"
        ? "lossless own contentView PNG at explicit1920x1050points"
        : "lossless full own-window PNG",
    colorProfile: "Preserves input ICC metadata; no manual sample conversion",
  },
  outputs: Object.fromEntries(
    await Promise.all(
      ["window", "client", "reference"].map(async (key) => [
        key,
        { path: outputs[key], sha256: await hash(outputs[key]) },
      ]),
    ),
  ),
  measurements: {
    editorLeft: scan("x", 150, 75, 90),
    editorRight: scan("x", 150, 929, 943),
    editorTop: scan("y", 120, 32, 42),
    editorBottom: scan("y", 120, 363, 403),
    checkerPhase: scan("y", 250, 38, 95),
  },
  limitations: [
    "macOS titlebar active/inactive state is captured as rendered, not overridden.",
    "Unsupported browser controls require matched disabled-state evidence separately.",
    "Changing display resolution or scale fails the geometry contract.",
    "No OS screen-capture API, user process control, reference-image rendering, or user profile access.",
  ],
});
await fs.writeFile(outputs.provenance, JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ outputs, measurements: provenance.measurements }, null, 2));
