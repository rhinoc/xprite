import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { SaveTarget, shouldOpenSaveAsDialog } from "$/managers/workspace/save-target";

describe("shouldOpenSaveAsDialog", () => {
  it("opens Save As for Save when no destination preference is configured", () => {
    assert.equal(shouldOpenSaveAsDialog("save", null), true);
  });

  it("does not open Save As for Save once a destination preference exists", () => {
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.Browser), false);
    assert.equal(shouldOpenSaveAsDialog("save", SaveTarget.FileSystem), false);
  });

  it("always opens Save As for Save As, regardless of preference", () => {
    assert.equal(shouldOpenSaveAsDialog("save-as", null), true);
    assert.equal(shouldOpenSaveAsDialog("save-as", SaveTarget.Browser), true);
    assert.equal(shouldOpenSaveAsDialog("save-as", SaveTarget.FileSystem), true);
  });
});
