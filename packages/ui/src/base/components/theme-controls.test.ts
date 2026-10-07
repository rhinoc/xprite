import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("intrinsic-controls", () => {
  it("intrinsic-controls behavior", async () => {
    await fs.mkdir(path.resolve(".tmp"), { recursive: true });
    const dir = await fs.mkdtemp(path.resolve(".tmp/intrinsic-controls-"));
    try {
      const file = path.join(dir, "controls.cjs");
      await build({
        stdin: {
          contents:
            'export { Button } from "./packages/ui/src/components/button"; export { Input, InputTouchActivation } from "./packages/ui/src/components/input"; export { Text, TextVariant } from "./packages/ui/src/components/text";',
          resolveDir: process.cwd(),
          loader: "tsx",
        },
        jsx: "automatic",
        outfile: file,
        bundle: true,
        format: "cjs",
        platform: "node",
        packages: "external",
        loader: { ".webp": "dataurl", ".css": "empty", ".woff2": "dataurl" },
      });
      const bundleRequire = createRequire(file);
      const { Button, Text, TextVariant, Input, InputTouchActivation } = bundleRequire(file);
      const { createElement } = bundleRequire("react");
      const { renderToStaticMarkup } = bundleRequire("react-dom/server");
      const html = (Component, props) => renderToStaticMarkup(createElement(Component, props));
      const size = (markup) => {
        const style = markup.match(/style="([^"]+)"/)[1];
        return {
          width: Number(style.match(/(?:^|;)width:([\d.]+)px/)[1]),
          height: Number(style.match(/(?:^|;)height:([\d.]+)px/)[1]),
          style,
        };
      };
      const short = size(html(Button, { text: "OK", font: "default" }));
      const long = size(html(Button, { text: "Export Sprite Sheet", font: "default" }));
      assert.match(short.style, /position:relative/);
      assert.ok(long.width > short.width, "Button follows content length.");
      assert.equal(short.height, long.height, "Content length does not scale button height.");
      const label = size(html(Text, { variant: TextVariant.Control, text: "Export Sprite Sheet" }));
      assert.ok(long.width >= label.width, "Button accommodates its label plus skin borders.");
      const entry = size(html(Input, { size: 4, value: "1" }));
      const fullEntry = size(html(Input, { size: 4, value: "1000" }));
      assert.deepEqual(entry, fullEntry, "Typing does not resize an entry.");
      assert.ok(size(html(Input, { size: 12, value: "" })).width > entry.width);
      const toolbar = html(Input, {
        size: 4,
        value: "100",
        touchActivation: InputTouchActivation.DoubleTap,
      });
      assert.match(toolbar, /<input[^>]*readonly=""/, "toolbar inputs require explicit editing");
      assert.doesNotMatch(
        html(Input, { size: 4, value: "100" }),
        /readonly=/,
        "ordinary form inputs remain directly editable",
      );
      assert.match(
        html(Input, { size: 4, value: "100", readOnly: true }),
        /<input[^>]*readonly=""/,
        "explicit readonly inputs remain readonly in either activation mode",
      );
      const placed = size(
        html(Button, { text: "OK", bounds: { x: 4, y: 6, width: 80, height: 32 } }),
      );
      assert.match(placed.style, /position:absolute/);
      assert.equal(placed.width, 80, "Explicit painter geometry remains compatible.");
      console.log(
        "Intrinsic controls: content growth, stable entry capacity, skin padding and explicit geometry passed.",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
