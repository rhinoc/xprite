import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { build, transform } from "esbuild";
import { describe, it } from "vitest";

import { AsepriteInk, UINT8_MAX } from "$/index";

describe("tool-settings", () => {
  it("tool-settings behavior", async () => {
    const source = (
      await readFile(
        new URL(
          "../../../../apps/editor/src/managers/preferences/tool-ink-settings.ts",
          import.meta.url,
        ),
        "utf8",
      )
    )
      .replace(
        /^import \{ AsepriteInk \} from "@xprite\/editor-core";\r?\n/m,
        `const AsepriteInk = ${JSON.stringify(AsepriteInk)};\n`,
      )
      .replace(
        /^import \{ UINT8_MAX \} from "@xprite\/editor-core";\r?\n/m,
        `const UINT8_MAX = ${UINT8_MAX};\n`,
      );
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    const { updateToolInkSettings: update } = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    );
    const tools = ["pencil", "line", "eraser"];
    const original = {
      pencil: { ink: "alpha-compositing", opacity: 128 },
      line: { ink: "simple", opacity: 255 },
    };
    const changed = update(original, tools, "pencil", { ink: "lock-alpha" }, false);
    assert.deepEqual(changed.pencil, { ink: "lock-alpha", opacity: 128 });
    assert.deepEqual(changed.line, original.line);
    assert.deepEqual(original.pencil, { ink: "alpha-compositing", opacity: 128 });
    const shared = update(changed, tools, "pencil", changed.pencil, true);
    for (const tool of tools) assert.deepEqual(shared[tool], changed.pencil);
    const separate = update(shared, tools, "line", { opacity: 50 }, false);
    assert.equal(separate.pencil.opacity, 128);
    assert.equal(separate.line.opacity, 50);
    assert.equal(update({}, tools, "pencil", { opacity: -1 }, false).pencil.opacity, 0);
    assert.equal(update({}, tools, "pencil", { opacity: 256 }, false).pencil.opacity, 255);
    assert.equal(update({}, tools, "pencil", { opacity: 127.5 }, false).pencil.opacity, 128);
    const toolData = JSON.parse(
      await readFile(new URL("./data/tool-capabilities.json", import.meta.url), "utf8"),
    );
    const { tools: capabilities } = toolData;
    assert.equal(toolData.schemaVersion, 3);
    assert.equal(Object.keys(capabilities).length, 26);
    assert.deepEqual(Object.keys(capabilities.marquee), ["behavior", "settings", "controls"]);
    assert.equal("inkClasses" in toolData, false);
    assert.equal("provenance" in toolData, false);
    assert.equal(capabilities.pencil.settings.hasInk, true);
    assert.equal(capabilities.pencil.controls.opacity, false);
    for (const tool of ["eraser", "blur"]) {
      assert.equal(capabilities[tool].settings.hasInk, false);
      assert.equal(capabilities[tool].controls.opacity, true);
    }
    assert.equal(capabilities.eraser.settings.defaultBrushSize, 8);
    assert.equal(capabilities.blur.settings.defaultBrushSize, 16);
    assert.equal(capabilities.bucket.settings.hasInk, true);
    assert.equal(capabilities.bucket.controls.brushType, false);
    assert.equal(capabilities.bucket.controls.brushSize, false);
    assert.equal(capabilities.gradient.controls.brushType, false);
    assert.equal(capabilities.gradient.controls.opacity, false);
    assert.equal(capabilities.lasso.controls.pixelAlgorithm, true);
    assert.equal(capabilities.contour.controls.pixelAlgorithm, true);
    assert.equal(capabilities.contour.behavior.connectFreehandStroke, true);
    const capabilityBuild = await build({
      entryPoints: ["packages/editor-core/src/drawing/capabilities.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { getXpriteToolCapabilities } = await import(
      `data:text/javascript;base64,${Buffer.from(capabilityBuild.outputFiles[0].text).toString("base64")}`
    );
    for (const [tool, capability] of Object.entries(capabilities))
      assert.deepEqual(getXpriteToolCapabilities(tool), capability);
    console.log(
      "Tool settings checks passed: product ink/dynamics/pixel-perfect capabilities and all 26 connected tools.",
    );
  }, 60_000);
});
