import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { SsgAsset } from "../../../infra/react-ssg-renderer.ts";
import { PUBLIC_UI_ASSET_PREFIX, publicCursorStylesheet } from "./static-ui-renderer.ts";

describe("public cursor stylesheet", () => {
  it("defines every cursor once as a hashed SVG file instead of inline markup", () => {
    const assets = new Map<string, SsgAsset>();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
    const css = publicCursorStylesheet(
      (artworkUrl) => ({
        "--ui-cursor-default": `url("${artworkUrl(svg)}") 1 1, default`,
        "--ui-cursor-hand": `url("${artworkUrl(svg)}") 5 0, grab`,
      }),
      assets,
    );
    assert.equal(assets.size, 1);
    const [[name, asset]] = [...assets];
    assert.match(name, /^[0-9a-f]{64}\.svg$/);
    assert.equal(asset.type, "image/svg+xml");
    assert.equal(asset.bytes.toString(), svg);
    assert.equal(
      css,
      `:root{--ui-cursor-default:url("${PUBLIC_UI_ASSET_PREFIX}${name}") 1 1, default;` +
        `--ui-cursor-hand:url("${PUBLIC_UI_ASSET_PREFIX}${name}") 5 0, grab}`,
    );
    assert.ok(!css.includes("data:"));
  });
});
