import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["apps/editor/src/components/shell/menu-catalog.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { mapMenuCatalog } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);
const catalog = JSON.parse(
  fs.readFileSync("apps/editor/assets/commands/libresprite-main-menu.json", "utf8"),
);
const calls = [];
const bindings = {
  recentFiles: [
    { id: "cat", name: "Untitled.png" },
    { id: "brush", name: "Brush.png" },
  ],
  openRecent: (id) => calls.push(`recent:${id}`),
  resolve: (node) =>
    node.command === "NewFile" && !Object.keys(node.params ?? {}).length
      ? { onSelect: () => calls.push("new") }
      : node.command === "ShowGrid"
        ? { onSelect: () => calls.push("grid"), checked: true, checkType: "checkbox" }
        : node.command === "SetLoopSection"
          ? { onSelect: () => calls.push("loop") }
          : undefined,
};
const menus = mapMenuCatalog(catalog.menus, bindings);
assert.deepEqual(
  menus.map((menu) => menu.label),
  ["File", "Edit", "Sprite", "Layer", "Frame", "Select", "View"],
);
assert.equal(menus[4].mnemonicIndex, 1);
assert.equal(menus[5].mnemonicIndex, 5);
const file = menus[0].items;
assert.deepEqual(
  file.map((item) => item.label),
  [
    "New...",
    "Open...",
    "Open Recent",
    "Save",
    "Save As...",
    "Export As...",
    "Close",
    "Close All",
    "Import Sprite Sheet",
    "Export Sprite Sheet",
    "Export Tileset",
    "Repeat Last Export",
    "Exit",
  ],
);
assert.deepEqual(
  file.filter((item) => item.separator).map((item) => item.label),
  ["Save", "Import Sprite Sheet", "Exit"],
);
for (const [label, shortcut] of [
  ["New...", "Ctrl+N"],
  ["Open...", "Ctrl+O"],
  ["Save", "Ctrl+S"],
  ["Save As...", "Ctrl+Shift+S"],
  ["Export As...", "Ctrl+Alt+Shift+S"],
  ["Close", "Ctrl+W"],
  ["Close All", "Ctrl+Shift+W"],
  ["Import Sprite Sheet", "Ctrl+I"],
  ["Export Sprite Sheet", "Ctrl+E"],
  ["Repeat Last Export", "Ctrl+Shift+X"],
  ["Exit", "Ctrl+Q"],
])
  assert.equal(file.find((item) => item.label === label).shortcut, shortcut, label);
file[0].onSelect();
assert.equal(file[0].disabled, undefined);
assert.equal(file[1].disabled, true);
assert.equal(file[1].onSelect, undefined);
const recent = file.find((item) => item.label === "Open Recent");
assert.equal(recent.disabled, false);
assert.deepEqual(
  recent.children.map((item) => item.label),
  ["Reopen Closed File", "Untitled.png", "Brush.png", "Clear Recent Files"],
);
assert.deepEqual(
  recent.children.filter((item) => item.separator).map((item) => item.label),
  ["Untitled.png", "Clear Recent Files"],
);
recent.children[1].onSelect();
recent.children[2].onSelect();
assert.equal(recent.children[0].disabled, true);
assert.equal(recent.children[3].disabled, true);
const show = menus[6].items.find((item) => item.label === "Show");
const grid = show.children.find((item) => item.label === "Grid");
assert.equal(grid.shortcut, "Ctrl+'");
assert.equal(grid.checked, true);
assert.equal(grid.checkType, "checkbox");
grid.onSelect();
assert.equal(show.children.find((item) => item.label === "Selection Edges").disabled, true);
const loop = menus[6].items.find((item) => item.label === "Set Loop Section");
assert.equal(loop.disabled, undefined);
loop.onSelect();
assert.deepEqual(calls, ["new", "recent:cat", "recent:brush", "grid", "loop"]);
const removedCommands = new Set([
  "OpenScriptFolder",
  "Debugger",
  "ColorCurve",
  "ConvolutionMatrix",
  "Despeckle",
  "LoadMask",
  "SaveMask",
  "DuplicateView",
  "ToggleWorkspaceLayout",
  "RunCommand",
  "ShowExtras",
  "ToggleOtherLayersOpacity",
  "ShowBrushPreviewInPreview",
  "AdvancedMode",
  "FullscreenMode",
  "FullscreenPreview",
  "Refresh",
  "OpenBrowser",
  "Launch",
  "About",
]);
function* walk(nodes) {
  for (const node of nodes) {
    if (node.kind === "item") yield node;
    if (node.children) yield* walk(node.children);
  }
}
const allItems = [...walk(catalog.menus)];
assert.ok(allItems.every((item) => !removedCommands.has(item.command)));
assert.equal(
  allItems.some((item) => item.command === "NewBrush"),
  true,
  "Keep the GPL-shared row even though this product leaves it disabled",
);
const shape = JSON.stringify(catalog);
mapMenuCatalog(catalog.menus, bindings);
assert.equal(JSON.stringify(catalog), shape, "Mapping must not mutate the product catalog");
console.log(
  "Product menu catalog: GPL-compatible structure, action callbacks, shortcuts, recents and disabled EULA-only rows verified.",
);
