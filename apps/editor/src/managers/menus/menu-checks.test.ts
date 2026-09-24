import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("menu-checks", () => {
  it("menu-checks behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/managers/menus/menu-checks.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { unsupportedMenuCheck: check } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    for (const name of ["ShowExtras", "ShowSelectionEdges", "ShowTileNumbers"])
      assert.deepEqual(check(name), { checked: true, checkType: "checkbox" });
    assert.equal(
      check("ShowSlices"),
      undefined,
      "ShowSlices now uses the document view preference",
    );
    assert.deepEqual(check("ShowPixelGrid"), { checked: false, checkType: "checkbox" });
    for (const axis of ["none", "both", "x", "y"])
      assert.deepEqual(check("TiledMode", { axis }), {
        checked: axis === "none",
        checkType: "radio",
      });
    assert.equal(check("TiledMode", { axis: "unknown" }), undefined);
    assert.equal(check("ShowGrid"), undefined);
    assert.equal(check("toString"), undefined);

    for (const name of [
      "SnapToGrid",
      "ShowOnionSkin",
      "ShowBrushPreviewInPreview",
      "SymmetryMode",
      "TogglePreview",
      "ToggleWorkspaceLayout",
    ])
      assert.equal(check(name).checked, false);
    assert.equal(
      check("ToggleOtherLayersOpacity", { preview: "true", checkedIfZero: "true" }).checked,
      false,
    );
    assert.equal(
      check("ToggleOtherLayersOpacity", { preview: "false", checkedIfZero: "true" }),
      undefined,
    );
    for (const name of ["AdvancedMode", "FullscreenMode", "FullscreenPreview"])
      assert.equal(check(name), undefined);

    console.log(
      "Unsupported menu modes retain verified Aseprite check defaults without callbacks; tiled parameter distinctions and unknown commands pass.",
    );
  }, 60_000);
});
