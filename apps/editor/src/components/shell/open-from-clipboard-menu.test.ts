import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { describe, it } from "vitest";

describe("File menu Open from Clipboard", () => {
  it("routes through OpenFile + fromClipboard (Import Options), not Paste as New Sprite", async () => {
    const catalog = JSON.parse(
      await readFile("apps/editor/assets/commands/libresprite-main-menu.json", "utf8"),
    );
    function* items(nodes) {
      for (const node of nodes) {
        if (node.kind === "item") yield node;
        if (node.children) yield* items(node.children);
      }
    }
    const file = catalog.menus.find((menu) => menu.label === "File");
    assert.ok(file, "File menu");
    const openFromClipboard = [...items(file.children)].find(
      (node) => node.label === "Open from Clipboard",
    );
    assert.ok(openFromClipboard, "File → Open from Clipboard");
    assert.equal(openFromClipboard.command, "OpenFile");
    assert.equal(openFromClipboard.params?.fromClipboard, "true");
    assert.equal(openFromClipboard.shortcut, undefined, "menu-only; no LibreSprite shortcut");

    const editPasteAsNewSprite = [...items(catalog.menus)].find(
      (node) => node.label === "Paste as New Sprite",
    );
    assert.ok(editPasteAsNewSprite);
    assert.equal(editPasteAsNewSprite.command, "NewFile");
    assert.equal(editPasteAsNewSprite.params?.fromClipboard, "true");

    const openIndex = file.children.findIndex(
      (node) => node.command === "OpenFile" && !node.params,
    );
    const clipboardIndex = file.children.findIndex((node) => node.label === "Open from Clipboard");
    assert.ok(openIndex >= 0 && clipboardIndex === openIndex + 1, "placed directly after Open…");
  });
});
