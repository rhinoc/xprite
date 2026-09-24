import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("feature-shortcuts [feature-7-12]", () => {
  it("feature-shortcuts behavior", async () => {
    /** Product keyboard contracts for implemented feature7–12 commands and core dispatch. */

    const catalog = JSON.parse(
      await readFile("apps/editor/assets/commands/libresprite-keyboard-shortcuts.json", "utf8"),
    );
    const menuCatalog = JSON.parse(
      await readFile("apps/editor/assets/commands/libresprite-main-menu.json", "utf8"),
    );
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      resolveShortcut,
      executeEditorCommand: run,
      canExecuteEditorAction: can,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const bindings = [
      ["ExportSpriteSheet", "Ctrl+E", { key: "e", ctrl: true }, "export-sheet"],
      ["ImportSpriteSheet", "Ctrl+I", { key: "i", ctrl: true }, "import-sheet"],
      ["RepeatLastExport", "Ctrl+Shift+X", { key: "x", ctrl: true, shift: true }, "repeat-export"],
      ["HueSaturation", "Ctrl+U", { key: "u", ctrl: true }, "effect-hue-saturation"],
      ["ReplaceColor", "Shift+R", { key: "r", shift: true }, "effect-replace-color"],
      ["Outline", "Shift+O", { key: "o", shift: true }, "effect-outline"],
      ["ShowOnionSkin", "F3", { key: "F3" }, "toggle-onion"],
      ["TogglePreview", "F7", { key: "F7" }, "toggle-preview"],
      ["PlayPreviewAnimation", "Shift+Enter", { key: "Enter", shift: true }, "play-preview"],
      ["ReverseFrames", "Alt+I", { key: "i", alt: true }, "reverse-frames"],
      ["SnapToGrid", "Shift+S", { key: "s", shift: true }, "snap-grid"],
    ];
    function* menuItems(nodes) {
      for (const node of nodes) {
        if (node.kind === "item") yield node;
        if (node.children) yield* menuItems(node.children);
      }
    }
    const menuBindings = [...menuItems(menuCatalog.menus)];
    for (const [id, shortcut, input, type] of bindings) {
      const catalogMatch = catalog.commands.some(
        (row) => row.id === id && row.shortcut === shortcut && row.context === "Any",
      );
      const menuMatch = menuBindings.some((row) => row.command === id && row.shortcut === shortcut);
      assert(catalogMatch || menuMatch, `${id} product binding ${shortcut}`);
      assert.deepEqual(resolveShortcut(input), { type });
      assert.deepEqual(
        resolveShortcut({ ...input, key: input.key.toUpperCase() }),
        { type },
        "case-independent DOM key",
      );
      assert.equal(
        resolveShortcut({ ...input, editingText: true }),
        null,
        `${id}: editable control isolation`,
      );
      if (shortcut.startsWith("Ctrl+")) {
        assert.deepEqual(resolveShortcut({ ...input, ctrl: false, meta: true }), { type });
        assert.equal(
          resolveShortcut({ ...input, ctrl: false, meta: true, editingText: true }),
          null,
        );
      }
    }
    const negative = [
      { key: "e", ctrl: true, alt: true },
      { key: "e", ctrl: true, shift: true },
      { key: "i", ctrl: true, alt: true },
      { key: "u", ctrl: true, alt: true },
      { key: "x", ctrl: true, shift: true, alt: true },
      { key: "r", shift: true, alt: true },
      { key: "o", shift: true, alt: true },
      { key: "F3", shift: true },
      { key: "F3", alt: true },
      { key: "F7", ctrl: true },
      { key: "F7", shift: true },
      { key: "Enter", shift: true, ctrl: true },
      { key: "i", alt: true, shift: true },
      { key: "s", shift: true, alt: true },
    ];
    for (const input of negative)
      assert.equal(
        resolveShortcut(input),
        null,
        `unsupported modifier combination ${JSON.stringify(input)}`,
      );
    assert.deepEqual(resolveShortcut({ key: "r" }), {
      type: "tool",
      tool: "blur",
      tools: ["blur", "jumble"],
    });
    assert.deepEqual(resolveShortcut({ key: "r", ctrl: true }), { type: "redo" });
    assert.deepEqual(resolveShortcut({ key: "i", ctrl: true, shift: true }), {
      type: "invert-selection",
    });
    assert.deepEqual(resolveShortcut({ key: "s", ctrl: true, shift: true }), { type: "save-as" });
    assert.deepEqual(resolveShortcut({ key: "Enter" }), { type: "commit" });
    const image = () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) }),
      e = new RasterEditor(image()),
      documentContext = { scene: "document", viewport: { width: 200, height: 150 } },
      homeContext = { ...documentContext, scene: "home" };
    const requests = bindings.filter(
      ([, , , type]) => !["toggle-onion", "snap-grid", "reverse-frames"].includes(type),
    );
    for (const [, , input, type] of requests) {
      const before = e.getSnapshot();
      assert.deepEqual(run(e, resolveShortcut(input), documentContext), {
        kind: "request",
        action: type,
      });
      assert.equal(
        e.getSnapshot(),
        before,
        `${type} routes adapter request without editing pixels`,
      );
    }
    for (const [input, field] of [
      [{ key: "F3" }, "onion"],
      [{ key: "s", shift: true }, "snap"],
    ]) {
      const command = resolveShortcut(input),
        before = e.getSnapshot(),
        beforeFlag = field === "onion" ? !!before.view.onionSkin?.active : !!before.view.snapToGrid;
      assert.deepEqual(run(e, command, documentContext), { kind: "handled" });
      let state = e.getSnapshot();
      assert.equal(
        field === "onion" ? state.view.onionSkin.active : state.view.snapToGrid,
        !beforeFlag,
      );
      assert.equal(state.dirty, false);
      assert.equal(state.canUndo, false);
      run(e, command, documentContext);
      state = e.getSnapshot();
      assert.equal(
        field === "onion" ? state.view.onionSkin.active : state.view.snapToGrid,
        beforeFlag,
      );
    }
    assert.equal(
      can("reverse-frames", e.getSnapshot(), "document"),
      false,
      "Reverse Frames requires an enabled frame range",
    );
    e.timeline.setTimelineRange({ kind: "frames", frames: [0], layers: [0] });
    assert.equal(
      can("reverse-frames", e.getSnapshot(), "document"),
      false,
      "Reverse Frames requires at least two selected frames",
    );
    e.timeline.setTimelineRange(undefined);
    e.timeline.setFrameDuration(70);
    e.timeline.addFrame();
    e.timeline.setFrameDuration(80);
    e.timeline.addFrame();
    e.timeline.setFrameDuration(90);
    e.timeline.setTimelineRange({ kind: "frames", frames: [0, 1, 2], layers: [0] });
    e.history.markSaved();
    assert.equal(can("reverse-frames", e.getSnapshot(), "document"), true);
    assert.deepEqual(run(e, resolveShortcut({ key: "i", alt: true }), documentContext), {
      kind: "handled",
    });
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [90, 80, 70],
    );
    assert(e.getSnapshot().dirty);
    e.history.undo();
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [70, 80, 90],
    );
    assert.equal(e.getSnapshot().dirty, false, "Reverse Frames is one undoable transaction");
    // Home can retain a playing document instance: unavailable feature commands
    // must not stop playback, alter viewport settings, mutate content or open dialogs.
    e.timeline.setPlaying(true);
    assert.equal(e.getSnapshot().playing, true);
    for (const [, , input, type] of bindings) {
      const before = e.getSnapshot();
      assert.equal(can(type, before, "home"), false, type);
      assert.deepEqual(run(e, resolveShortcut(input), homeContext), { kind: "unavailable" });
      assert.equal(
        e.getSnapshot(),
        before,
        `${type}: Home leaves retained playing document untouched`,
      );
    }
    const empty = new RasterEditor(null);
    for (const [, , input, type] of bindings) {
      const before = empty.getSnapshot();
      assert.equal(can(type, before, "document"), false);
      assert.deepEqual(run(empty, resolveShortcut(input), documentContext), {
        kind: "unavailable",
      });
      assert.equal(empty.getSnapshot(), before);
    }
    console.log(
      `PASS ${bindings.length} product shortcut bindings (+Cmd aliases), ${negative.length} modifier negatives, text/Home/no-document isolation, adapter routes, real onion/snap toggles and undoable range reversal`,
    );
  }, 60_000);
});

describe("editor-command-context", () => {
  it("editor-command-context behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      resolveShortcut,
      executeEditorCommand: run,
      canExecuteEditorAction: can,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const e = new RasterEditor({
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(256),
    });
    e.drawing.settings.setSettings({
      foreground: [255, 0, 0, 255],
      font: {
        height: 1,
        lineHeight: 1,
        glyphs: {
          A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
        },
      },
    });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp();
    const ctx = { scene: "home", viewport: { width: 100, height: 100 } };
    for (const type of [
      "save",
      "save-as",
      "export",
      "undo",
      "redo",
      "deselect",
      "cancel",
      "commit",
      "zoom-in",
      "zoom-out",
      "swap-colors",
    ]) {
      const before = e.getSnapshot();
      assert.equal(run(e, { type }, ctx).kind, "unavailable", type);
      assert.equal(e.getSnapshot(), before, "Inactive document must not mutate");
    }
    for (const type of ["new", "open", "preferences"])
      assert.equal(run(e, { type }, ctx).kind, "request");
    assert.equal(
      run(e, { type: "reopen-closed-file" }, ctx).kind,
      "request",
      "Reopen Closed File is available from Home",
    );
    assert.equal(resolveShortcut({ key: "t", ctrl: true, shift: true }).type, "reopen-closed-file");
    assert.equal(can("insert-text", e.getSnapshot(), "home"), false);
    assert.equal(can("layer-lock", e.getSnapshot(), "home"), false);
    run(e, resolveShortcut({ key: "=" }), ctx);
    assert.equal(e.getSnapshot().settings.brush.size, 2);
    assert.equal(e.getSnapshot().view.zoom, 1);
    run(e, { type: "tool", tool: "eraser" }, ctx);
    assert.equal(e.getSnapshot().settings.tool, "eraser");
    run(e, { type: "toggle-grid" }, ctx);
    assert.equal(e.getSnapshot().defaultDocumentView.grid, true);
    assert.equal(e.getSnapshot().view.grid, false);
    run(e, { type: "toggle-pixel-grid" }, ctx);
    assert.equal(e.getSnapshot().defaultDocumentView.pixelGrid, true);
    assert.equal(e.getSnapshot().view.pixelGrid, false);
    const document = { ...ctx, scene: "document" };
    run(e, resolveShortcut({ key: "'", ctrl: true, shift: true }), document);
    assert.equal(e.getSnapshot().view.pixelGrid, true);
    run(e, resolveShortcut({ key: "3" }), document);
    assert.equal(e.getSnapshot().view.zoom, 4);
    assert.equal(run(e, resolveShortcut({ key: "s", ctrl: true }), document).kind, "request");
    assert.equal(
      can("save-as", e.getSnapshot(), "document"),
      true,
      "Save As is available for an active document in the browser editor",
    );
    assert.equal(can("undo", e.getSnapshot(), "document"), true);
    e.timeline.setLayerLocked(true);
    assert.equal(can("insert-text", e.getSnapshot(), "document"), false);
    assert.equal(can("layer-lock", e.getSnapshot(), "document"), true);
    e.timeline.setLayerLocked(false);
    e.timeline.setLayerVisible(false);
    assert.equal(can("insert-text", e.getSnapshot(), "document"), true);
    for (const [key, type] of [
      ["+", "brush-grow"],
      ["=", "brush-grow"],
      ["-", "brush-shrink"],
      ["[", "palette-previous"],
      ["]", "palette-next"],
    ])
      assert.equal(resolveShortcut({ key }).type, type);
    for (const mod of [{ ctrl: true }, { meta: true }]) {
      assert.equal(resolveShortcut({ key: "+", ...mod }).type, "zoom-in");
      assert.equal(resolveShortcut({ key: "=", shift: true, ...mod }).type, "zoom-in");
      assert.equal(resolveShortcut({ key: "-", ...mod }).type, "zoom-out");
    }
    for (const [key, zoom] of [
      ["`", 0.5],
      ["~", 0.5],
      ["1", 1],
      ["2", 2],
      ["3", 4],
      ["4", 8],
      ["5", 16],
      ["6", 32],
    ])
      assert.deepEqual(resolveShortcut({ key }), { type: "zoom-to", zoom });
    assert.equal(resolveShortcut({ key: "=", ctrl: true, alt: true }), null);
    console.log(
      "Core command context: Home protects retained documents, global preferences stay available, source shortcuts/zoom presets and layer editability pass.",
    );

    // Source MaskAll and plain Cancel mutate only selection/history, not pixels.
    const selected = new RasterEditor({
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(64),
    });
    const context = { scene: "document", viewport: { width: 40, height: 40 } };
    run(selected, resolveShortcut({ key: "a", ctrl: true }), context);
    assert.deepEqual(
      { ...selected.getSnapshot().document.selection, data: undefined },
      { x: 0, y: 0, width: 4, height: 4, data: undefined },
    );
    assert.equal(selected.getSnapshot().dirty, false);
    run(selected, { type: "cancel" }, context);
    assert.equal(selected.getSnapshot().document.selection, null);
    assert.equal(selected.getSnapshot().dirty, false);
    selected.history.undo();
    assert.ok(selected.getSnapshot().document.selection);
    // Clear removes selected pixels and default-source selection in one history unit.
    selected.document.loadImage({
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(64).fill(255),
    });
    run(selected, { type: "select-all" }, context);
    selected.history.markSaved();
    run(selected, resolveShortcut({ key: "Delete" }), context);
    assert.ok(selected.canvas.composite().data.every((value) => value === 0));
    assert.equal(selected.getSnapshot().document.selection, null);
    selected.history.undo();
    assert.ok(selected.canvas.composite().data.every((value) => value === 255));
    assert.ok(selected.getSnapshot().document.selection);
    assert.equal(selected.getSnapshot().dirty, false);
    const unchanged = selected.getSnapshot();
    assert.equal(
      run(selected, { type: "clear" }, { ...context, scene: "home" }).kind,
      "unavailable",
    );
    assert.equal(selected.getSnapshot(), unchanged);
    selected.timeline.setLayerLocked(true);
    assert.equal(can("clear", selected.getSnapshot(), "document"), false);
    selected.timeline.setLayerLocked(false);
    selected.timeline.setLayerVisible(false);
    assert.equal(can("clear", selected.getSnapshot(), "document"), false);
    selected.timeline.setLayerVisible(true);
    // Alt-arrow moves only bounds and remains a clean selection transaction.
    selected.history.markSaved();
    selected.drawing.settings.setSettings({ tool: "marquee" });
    const raster = selected.canvas.composite();
    run(selected, resolveShortcut({ key: "ArrowRight", alt: true }), context);
    assert.equal(selected.getSnapshot().document.selection.x, 1);
    assert.equal(selected.getSnapshot().dirty, false);
    assert.equal(selected.canvas.composite(), raster);
    selected.history.undo();
    assert.equal(selected.getSnapshot().document.selection.x, 0);
    // Text Undo/Redo can cancel even a first draft with no history.
    const writing = new RasterEditor({
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(64),
    });
    writing.drawing.settings.setSettings({
      font: {
        height: 1,
        lineHeight: 1,
        glyphs: {
          A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
        },
      },
    });
    writing.drawing.text.beginInlineText({ x: 0, y: 0, width: 4, height: 1 });
    writing.drawing.text.updateInlineText({ text: "A" });
    assert.equal(can("undo", writing.getSnapshot(), "document"), true);
    run(writing, { type: "undo" }, context);
    assert.equal(writing.getSnapshot().inlineText, null);
    assert.equal(writing.getSnapshot().dirty, false);
    writing.drawing.text.beginInlineText({ x: 0, y: 0, width: 4, height: 1 });
    writing.drawing.text.updateInlineText({ text: "A" });
    assert.equal(can("redo", writing.getSnapshot(), "document"), true);
    run(writing, { type: "redo" }, context);
    assert.equal(writing.getSnapshot().inlineText, null);
    console.log(
      "Basic selection commands: Select All, Escape deselection, Clear/history, Home/locked eligibility, Alt-arrow bounds and text Undo/Redo cancellation pass.",
    );
  }, 60_000);
});
