import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

async function moduleAt(path: string) {
  const { outputFiles } = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    jsx: "automatic",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
  );
}

describe("ux audit fixes", () => {
  it("Enter triggers the window default action only from fields, and field keys stay unclaimed", async () => {
    const { triggersDefaultAction } = await moduleAt(
      "packages/ui/src/components/window/interaction.tsx",
    );
    const { markFieldKey, isUnclaimedKey } = await moduleAt(
      "packages/ui/src/base/utils/field-key.ts",
    );
    const plain = { key: "Enter", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    const target = (owner: boolean) => ({ matches: () => owner });
    assert.equal(triggersDefaultAction(plain, target(false)), true);
    assert.equal(triggersDefaultAction(plain, null), true);
    assert.equal(triggersDefaultAction(plain, target(true)), false);
    assert.equal(triggersDefaultAction({ ...plain, ctrlKey: true }, target(false)), false);
    assert.equal(triggersDefaultAction({ ...plain, key: "a" }, target(false)), false);
    const event = { defaultPrevented: true };
    assert.equal(isUnclaimedKey(event), false);
    markFieldKey(event);
    assert.equal(isUnclaimedKey(event), true);
    assert.equal(isUnclaimedKey({ defaultPrevented: false }), true);
  });

  it("Flip without a selection flips the whole active cel", async () => {
    const { RasterEditor } = await moduleAt("packages/editor-core/src/index.ts");
    const { FlipOrientation } = await moduleAt(
      "packages/editor-core/src/image-editing/transform.ts",
    );
    const data = new Uint8ClampedArray(2 * 1 * 4);
    data.set([255, 0, 0, 255], 0);
    const editor = new RasterEditor({ width: 2, height: 1, data });
    assert.equal(editor.getSnapshot().document.selection, null);
    assert.equal(editor.imageEditing.flipCels(FlipOrientation.Horizontal), true);
    const flat = editor.canvas.composite().data;
    assert.deepEqual([...flat.slice(0, 4)], [0, 0, 0, 0]);
    assert.deepEqual([...flat.slice(4, 8)], [255, 0, 0, 255]);
    editor.history.undo();
    assert.deepEqual([...editor.canvas.composite().data.slice(0, 4)], [255, 0, 0, 255]);
  });

  it("pixel-perfect defaults to off like Aseprite pref.xml", async () => {
    const { RasterEditor } = await moduleAt("packages/editor-core/src/index.ts");
    const { DEFAULT_PIXEL_PERFECT } = await moduleAt(
      "packages/editor-core/src/drawing/settings-controller.ts",
    );
    assert.equal(DEFAULT_PIXEL_PERFECT, false);
    assert.equal(new RasterEditor().getSnapshot().settings.pixelPerfect, false);
  });

  it("F8 opens the fullscreen preview", async () => {
    const { resolveShortcut } = await moduleAt(
      "packages/editor-core/src/editor/commands/shortcuts.ts",
    );
    const cmd = resolveShortcut({ key: "F8", ctrl: false, shift: false, alt: false, meta: false });
    assert.deepEqual(cmd, { type: "fullscreen-preview" });
  });

  it("fullscreen preview keys follow cmd_fullscreen_preview.cpp", async () => {
    const {
      fullscreenPreviewKeyAction,
      fullscreenPreviewFrame,
      FullscreenPreviewKeyAction: A,
    } = await moduleAt("apps/editor/src/managers/timeline/fullscreen-preview.ts");
    assert.equal(fullscreenPreviewKeyAction("Home"), A.FirstFrame);
    assert.equal(fullscreenPreviewKeyAction("ArrowRight"), A.NextFrame);
    assert.equal(fullscreenPreviewKeyAction("Escape"), A.Close);
    assert.equal(fullscreenPreviewKeyAction("x"), A.Close);
    assert.equal(fullscreenPreviewFrame(A.NextFrame, 2, 3), 0);
    assert.equal(fullscreenPreviewFrame(A.PreviousFrame, 0, 3), 2);
    assert.equal(fullscreenPreviewFrame(A.LastFrame, 0, 3), 2);
    assert.equal(fullscreenPreviewFrame(A.FirstFrame, 2, 3), 0);
  });

  it("startup sprite sheet reuses the preloaded URL", async () => {
    const { startupSpriteSheetUrl } = await moduleAt(
      "apps/editor/src/components/shell/startup-sprite-sheet-url.ts",
    );
    const href = "https://x.test/startup-loading.webp?v=abc123";
    assert.equal(startupSpriteSheetUrl(["https://x.test/a.css", href], "/"), href);
    assert.equal(startupSpriteSheetUrl([], "/"), "/startup-loading.webp?v=xprite-2");
  });

  it("preloadableLazy loads once and shares the promise", async () => {
    const { preloadableLazy } = await moduleAt(
      "apps/editor/src/components/shared/preloadable-lazy/index.tsx",
    );
    let calls = 0;
    const lazyDialog = preloadableLazy(async () => {
      calls++;
      return { default: () => null };
    });
    await Promise.all([lazyDialog.preload(), lazyDialog.preload()]);
    assert.equal(calls, 1);
  });
});
