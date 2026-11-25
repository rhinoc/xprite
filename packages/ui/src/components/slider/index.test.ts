import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

import { testAssetLoaders, viteAssetImports } from "$/testing/esbuild";

describe("slider-family", () => {
  it("slider-family behavior", async () => {
    const directory = path.resolve("node_modules/.cache/slider-family-verifier");
    await mkdir(directory, { recursive: true });
    const outfile = path.join(directory, "family.mjs");
    try {
      await build({
        stdin: {
          contents:
            'export { Slider } from "./packages/ui/src/components/slider/Slider.tsx"; export { sliderSplitWidth } from "./packages/ui/src/components/slider/position.ts"; export { SliderMode, SliderRendering, SliderValueFormat } from "./packages/ui/src/components/slider/types.ts"; export { UIProvider, UiColorScheme, loadUiThemeSnapshot } from "./packages/ui/src/components/theme/provider.tsx"; export { asepriteTheme } from "./packages/ui/src/base/theme/themes/aseprite";',
          resolveDir: process.cwd(),
          loader: "tsx",
        },
        outfile,
        jsx: "automatic",
        bundle: true,
        format: "esm",
        platform: "node",
        external: ["react", "react-dom", "react-dom/*"],
        loader: testAssetLoaders,
        plugins: [viteAssetImports],
        logLevel: "silent",
      });
      const family = await import(pathToFileURL(outfile).href);
      const bundleRequire = createRequire(outfile);
      const React = bundleRequire("react");
      const { renderToStaticMarkup } = bundleRequire("react-dom/server");
      const theme = family.asepriteTheme;
      const initialTheme = await family.loadUiThemeSnapshot(family.UiColorScheme.Light, theme);
      const render = (props) =>
        renderToStaticMarkup(
          React.createElement(
            family.UIProvider,
            { theme, initialTheme },
            React.createElement(family.Slider, props),
          ),
        );
      assert.equal(typeof family.Slider, "function");
      assert.equal("SliderEntry" in family, false);
      assert.equal("ThresholdSlider" in family, false);
      const common = {
        bounds: { x: 0, y: 0, width: 200, height: 32 },
        "aria-label": "Value",
        onValueChange() {},
      };
      const pixel = render({ ...common, min: 0, max: 100, value: 42 });
      assert.match(pixel, /role="slider"/);
      assert.match(pixel, /aria-valuenow="42"/);
      assert.match(pixel, /aria-valuemin="0"/);
      assert.match(pixel, /aria-valuemax="100"/);
      const range = render({
        ...common,
        mode: family.SliderMode.Range,
        value: [0.2, 0.8],
      });
      assert.match(range, /aria-label="Value"/);
      assert.match(range, /role="group"/);
      const entry = render({
        ...common,
        rendering: family.SliderRendering.NumberEntry,
        min: 0,
        max: 255,
        value: 128,
        valueFormat: family.SliderValueFormat.Percentage,
      });
      assert.match(entry, /<input/);
      assert.match(entry, /value="50%"/);
      const disabled = render({
        ...common,
        rendering: family.SliderRendering.NumberEntry,
        min: 0,
        max: 10,
        value: 3,
        disabled: true,
      });
      assert.match(disabled, /disabled=""/);

      // Split geometry: min/max have no overhang or negative clip widths; mid values snap to 2px grid.
      assert.equal(family.sliderSplitWidth(0, 0, 100, 320), 0);
      assert.equal(family.sliderSplitWidth(100, 0, 100, 320), 320);
      assert.equal(family.sliderSplitWidth(100, 0, 100, 320, 10), 320);
      assert.equal(family.sliderSplitWidth(3, 0, 6, 320), 162);

      // Light-theme filled slider uses high-contrast dark text (#000000 on #7c919d = 6.39:1)
      // instead of washed-out white (#ffffff = 3.28:1), and full/min render a single track part.
      const fullLight = render({ ...common, min: 0, max: 100, value: 100, label: "100%" });
      assert.match(fullLight, /data-theme-part="slider_full"/);
      assert.doesNotMatch(fullLight, /data-theme-part="slider_empty"/);
      assert.match(fullLight, /color:#000000/);
      assert.doesNotMatch(fullLight, /color:#ffffff/i);

      const minLight = render({ ...common, min: 0, max: 100, value: 0, label: "0%" });
      assert.match(minLight, /data-theme-part="slider_empty"/);
      assert.doesNotMatch(minLight, /data-theme-part="slider_full"/);

      const darkTheme = await family.loadUiThemeSnapshot(family.UiColorScheme.Dark, theme);
      const fullDark = renderToStaticMarkup(
        React.createElement(
          family.UIProvider,
          { theme, colorScheme: family.UiColorScheme.Dark, initialTheme: darkTheme },
          React.createElement(family.Slider, {
            ...common,
            min: 0,
            max: 100,
            value: 100,
            label: "100%",
          }),
        ),
      );
      assert.match(fullDark, /color:#c0c0c0/i);

      console.log(
        "Slider family: pixel, range, number-entry, percentage, contrast, split geometry and disabled semantics verified; only one component export.",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
