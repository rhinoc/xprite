import assert from "node:assert/strict";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/ui/src/components/menu/policy.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { placeSubmenu, menuMnemonicMatch, menuMnemonicIndex, SUBMENU_OPEN_DELAY_MS } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);
// Physical-pixel translations of source choose_side GUI-scale-one examples.
assert.deepEqual(
  placeSubmenu(
    { x: 100, y: 60, width: 200, height: 250 },
    100,
    { width: 180, height: 200 },
    { width: 1000, height: 700 },
  ),
  { x: 298, y: 94, width: 180, height: 200 },
);
assert.deepEqual(
  placeSubmenu(
    { x: 800, y: 60, width: 180, height: 250 },
    100,
    { width: 220, height: 200 },
    { width: 1000, height: 700 },
  ),
  { x: 582, y: 94, width: 220, height: 200 },
);
assert.deepEqual(
  placeSubmenu(
    { x: 150, y: 280, width: 200, height: 100 },
    340,
    { width: 240, height: 200 },
    { width: 400, height: 400 },
  ),
  { x: 0, y: 200, width: 240, height: 200 },
);
assert.deepEqual(
  placeSubmenu(
    { x: 0, y: 0, width: 200, height: 200 },
    0,
    { width: 800, height: 800 },
    { width: 600, height: 600 },
  ),
  { x: 0, y: 0, width: 800, height: 800 },
);
assert.equal(SUBMENU_OPEN_DELAY_MS, 250);
const entries = [
  { label: "Open Recent", mnemonic: "r" },
  { label: "Redo", mnemonic: "r", disabled: true },
  { label: "Select", mnemonicIndex: 5 },
  { label: "Copy" },
];
assert.equal(menuMnemonicMatch(entries, "R"), 0);
assert.equal(menuMnemonicMatch(entries, "t"), 2);
assert.equal(menuMnemonicMatch(entries, "C"), -1);
assert.equal(menuMnemonicMatch([{ label: "Disabled", mnemonic: "d", disabled: true }], "d"), -1);
assert.equal(menuMnemonicIndex({ label: "Recent", mnemonic: "z" }), -1);

assert.equal(menuMnemonicIndex({ label: "Save As...", mnemonic: "a", mnemonicIndex: 5 }), 1);
assert.equal(menuMnemonicIndex({ label: "Selection Edges", mnemonic: "e", mnemonicIndex: 10 }), 1);
assert.equal(menuMnemonicIndex({ label: "Tile Numbers", mnemonicIndex: 0 }), 0);

console.log(
  "Aseprite menu policy: source placement, hover delay and mnemonic character/first-occurrence checks pass.",
);
