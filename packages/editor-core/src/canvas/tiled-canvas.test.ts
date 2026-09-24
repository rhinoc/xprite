import assert from "node:assert/strict";
import fs from "node:fs";

import babelParser from "@babel/parser";
import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tiled-editor-frame [feature-7-12]", () => {
  it("tiled-editor-frame behavior", async () => {
    const bundle = async (path) => {
      const { outputFiles } = await build({
        entryPoints: [path],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    };
    const { documentToScreen } = await bundle("packages/editor-core/src/canvas/view.ts"),
      { tiledCanvasLayout } = await bundle("packages/editor-core/src/canvas/tiled-canvas.ts"),
      { editorFrameGeometry } = await bundle("packages/editor-core/src/canvas/frame-geometry.ts");
    // Execute the real JSX binding expressions, rather than maintaining a copied
    // base-rectangle equation that could pass while EditorViewport regressed.
    const path = "apps/editor/src/components/canvas/editor-viewport/index.tsx",
      source = fs.readFileSync(path, "utf8"),
      tree = babelParser.parse(source, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
    let origin, bounds;
    function visit(node) {
      if (
        node.type === "VariableDeclarator" &&
        node.id?.type === "Identifier" &&
        node.id.name === "documentOrigin" &&
        node.init?.start !== undefined &&
        node.init?.end !== undefined &&
        source.slice(node.init.start, node.init.end).includes("tiledCanvasLayout")
      )
        origin = source.slice(node.init.start, node.init.end);
      if (
        node.type === "JSXAttribute" &&
        node.name?.type === "JSXIdentifier" &&
        node.name.name === "documentBounds" &&
        node.value?.type === "JSXExpressionContainer" &&
        node.value.expression?.start !== undefined &&
        node.value.expression?.end !== undefined &&
        source
          .slice(node.value.expression.start, node.value.expression.end)
          .includes("tiledCanvasLayout")
      )
        bounds = source.slice(node.value.expression.start, node.value.expression.end);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) if (child?.type) visit(child);
        } else if (value?.type) visit(value);
      }
    }
    visit(tree);
    assert.ok(origin && bounds, "EditorViewport must supply expanded-canvas base bounds");
    const js = `const documentOrigin=${origin};return (${bounds});`;
    const readBase = new Function(
      "documentToScreen",
      "tiledCanvasLayout",
      "surfaceBounds",
      "doc",
      "state",
      js,
    );
    let cases = 0;
    for (const frame of [
      { x: 158, y: 90, width: 1730, height: 700 },
      { x: 178, y: 108, width: 1843, height: 803 },
    ])
      for (const doc of [
        { width: 16, height: 16 },
        { width: 17, height: 13 },
        { width: 509, height: 396 },
      ])
        for (const tiledMode of [0, 1, 2, 3]) {
          const surfaceBounds = {
              x: frame.x + 6,
              y: frame.y + 6,
              width: frame.width - 24,
              height: frame.height - 24,
            },
            viewport = { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
            expanded = tiledCanvasLayout(doc.width, doc.height, tiledMode);
          let baseline;
          for (const zoom of [1 / 64, 1 / 3, 0.5, 0.75, 1, 2, 8, 24])
            for (const pan of [
              { x: 0, y: 0 },
              { x: 17, y: -8 },
            ]) {
              const base = readBase(documentToScreen, tiledCanvasLayout, surfaceBounds, doc, {
                view: { zoom, pan, tiledMode },
              });
              baseline ??= base;
              assert.deepEqual(
                base,
                baseline,
                "Base frame rectangle must not incorporate the current zoom/pan",
              );
              const actual = editorFrameGeometry(frame, base, zoom, {
                  x: pan.x * 2,
                  y: pan.y * 2,
                }).document,
                width = Math.trunc(expanded.width * zoom),
                height = Math.trunc(expanded.height * zoom);
              const expected = {
                x:
                  surfaceBounds.x +
                  2 * (Math.trunc(viewport.width / 2) - Math.trunc(width / 2) + pan.x),
                y:
                  surfaceBounds.y +
                  2 * (Math.trunc(viewport.height / 2) - Math.trunc(height / 2) + pan.y),
                width: width * 2,
                height: height * 2,
              };
              assert.deepEqual(
                actual,
                expected,
                `Aseprite expanded frame mode${tiledMode} zoom${zoom}`,
              );
              cases++;
            }
        }
    console.log(
      `${cases} actual EditorViewport bindings match Aseprite tiled frame centering: all4modes, odd/even documents/viewports, minification/magnification/pan. No double zoom offset.`,
    );
  }, 60_000);
});
