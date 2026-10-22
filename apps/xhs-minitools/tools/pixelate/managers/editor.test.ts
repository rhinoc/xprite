import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { MiniToolEditor } from "$/tools/pixelate/managers/editor";
import type { MiniToolPort } from "$/tools/pixelate/managers/ports";
import { DEFAULT_SPLIT } from "$/tools/pixelate/managers/split-geometry";
import { defaultPixelationSettings, PixelationAlgorithm } from "@xprite/editor-core/import-export";
import type { PixelationManager, PixelationSnapshot } from "@xprite/tools-app/pixelation";

const photo = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) };

/** Just enough of the pixelation manager for the editor: one opened photo, no conversion. */
function fakePixelation(name: string) {
  let listener = () => {};
  let snapshot = {
    source: photo,
    result: null,
    identity: 1,
    name,
    loading: false,
    downloading: false,
    algorithm: PixelationAlgorithm.Auto,
    grid: null,
    settings: defaultPixelationSettings(photo),
  } as unknown as PixelationSnapshot;
  const manager = {
    subscribe(next: () => void) {
      listener = next;
      return () => {};
    },
    getSnapshot: () => snapshot,
    restore() {},
    changeSettings() {},
    changeAlgorithm: async () => {},
    open(next: string) {
      snapshot = { ...snapshot, identity: snapshot.identity + 1, name: next };
      listener();
    },
  };
  return manager;
}

function editorFor(name: string) {
  const pixelation = fakePixelation(name);
  const editor = new MiniToolEditor(
    pixelation as unknown as PixelationManager,
    {} as unknown as MiniToolPort,
  );
  return { editor, pixelation };
}

describe("mini tool editor", () => {
  it("shows the divider by default and undoes hiding it", () => {
    const { editor } = editorFor("photo.png");
    assert.equal(DEFAULT_SPLIT.divider, true);
    assert.equal(editor.getSnapshot().split.divider, true);
    editor.changeSplit({ divider: false });
    assert.equal(editor.getSnapshot().split.divider, false);
    editor.undo();
    assert.equal(editor.getSnapshot().split.divider, true);
  });

  it("titles a photo with its file name without the extension", () => {
    const { editor, pixelation } = editorFor("girl-with-a-pearl-earring.jpeg");
    assert.equal(editor.getSnapshot().title, "girl-with-a-pearl-earring");
    pixelation.open("IMG_0042.HEIC.png");
    assert.equal(editor.getSnapshot().title, "IMG_0042.HEIC");
  });

  it("records a typed title as one undo step", () => {
    const { editor } = editorFor("cat.png");
    editor.beginGesture();
    for (const draft of ["M", "My", "My cat"]) editor.previewTitle(draft);
    editor.endGesture();
    assert.equal(editor.getSnapshot().title, "My cat");
    assert.equal(editor.getSnapshot().canUndo, true);
    editor.undo();
    assert.equal(editor.getSnapshot().title, "cat");
    assert.equal(editor.getSnapshot().canUndo, false);
  });

  it("skips the undo step when a title edit changes nothing", () => {
    const { editor } = editorFor("cat.png");
    editor.beginGesture();
    editor.previewTitle("cat");
    editor.endGesture();
    assert.equal(editor.getSnapshot().canUndo, false);
    editor.changeTitle("cat");
    assert.equal(editor.getSnapshot().canUndo, false);
  });

  it("goes back to the file name and keeps titles short", () => {
    const { editor } = editorFor("cat.png");
    editor.changeTitle("x".repeat(100));
    assert.equal(editor.getSnapshot().title.length, 40);
    editor.changeTitle(editor.defaultTitle());
    assert.equal(editor.getSnapshot().title, "cat");
    editor.changeTitle("Mittens");
    editor.reset();
    assert.equal(editor.getSnapshot().title, "cat");
    editor.undo();
    assert.equal(editor.getSnapshot().title, "Mittens");
  });
});
