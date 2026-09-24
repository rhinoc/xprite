import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("slider-family", () => {
  it("slider-family behavior", async () => {
    const directory = path.resolve("node_modules/.cache/slider-family-verifier");
    await mkdir(directory, { recursive: true });
    const outfile = path.join(directory, "family.mjs");
    try {
      await build({
        stdin: {
          contents:
            'export { Slider } from "./packages/ui/src/components/slider/Slider.tsx"; export { UIProvider } from "./packages/ui/src/components/theme/appearance.tsx";',
          resolveDir: process.cwd(),
          loader: "tsx",
        },
        outfile,
        jsx: "automatic",
        bundle: true,
        format: "esm",
        platform: "node",
        external: ["react", "react-dom", "react-dom/*"],
        loader: { ".webp": "dataurl", ".css": "empty", ".woff2": "dataurl" },
        logLevel: "silent",
      });
      const family = await import(pathToFileURL(outfile).href);
      const bundleRequire = createRequire(outfile);
      const React = bundleRequire("react");
      const { renderToStaticMarkup } = bundleRequire("react-dom/server");
      const render = (props) =>
        renderToStaticMarkup(
          React.createElement(family.UIProvider, null, React.createElement(family.Slider, props)),
        );
      assert.equal(typeof family.Slider, "function");
      assert.equal("SliderEntry" in family, false);
      assert.equal("ThresholdSlider" in family, false);
      const common = {
        bounds: { x: 0, y: 0, width: 200, height: 32 },
        "aria-label": "Value",
        onValueChange() {},
      };
      for (const variant of ["normal"]) {
        const html = render({ ...common, variant, min: 0, max: 100, value: 42 });
        assert.match(html, /role="slider"/);
        assert.match(html, /aria-valuenow="42"/);
        assert.match(html, /aria-valuemin="0"/);
        assert.match(html, /aria-valuemax="100"/);
      }
      const range = render({ ...common, variant: "threshold", value: [0.2, 0.8] });
      assert.match(range, /aria-label="Value"/);
      assert.match(range, /role="group"/);
      const entry = render({
        ...common,
        variant: "entry",
        min: 0,
        max: 255,
        value: 128,
        valueFormat: "percentage",
      });
      assert.match(entry, /<input/);
      assert.match(entry, /value="50%"/);
      const disabled = render({
        ...common,
        variant: "entry",
        min: 0,
        max: 10,
        value: 3,
        disabled: true,
      });
      assert.match(disabled, /disabled=""/);
      console.log(
        "Slider family: normal, threshold, entry, percentage and disabled semantics verified; only one component export.",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
