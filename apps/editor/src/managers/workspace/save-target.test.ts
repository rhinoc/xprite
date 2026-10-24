import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { SaveTarget, shouldOpenSaveAsDialog } from "$/managers/workspace/save-target";

describe("shouldOpenSaveAsDialog", () => {
  it("opens Save As for Save when preference unset and File Manager is available", () => {
    assert.equal(shouldOpenSaveAsDialog("save", null, true), true);
  });

  it("does not open Save As for Save when preference unset but File Manager is unavailable", () => {
    assert.equal(shouldOpenSaveAsDialog("save", null, false), false);
  });

  it("does not open Save As for Save once a destination preference exists", () => {
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.Browser, true), false);
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.FileSystem, true), false);
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.Browser, false), false);
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.FileSystem, false), false);
  });

  it("always opens Save As for Save As, regardless of preference or picker support", () => {
    assert.equal(shouldOpenSaveAsDialog("save-as", null, true), true);
    assert.equal(shouldOpenSaveAsDialog("save-as", null, false), true);
    assert.equal(shouldOpenSaveAsDialog("save-as", SaveTarget.Browser, true), true);
    assert.equal(shouldOpenSaveAsDialog("save-as", SaveTarget.FileSystem, false), true);
  });
});
