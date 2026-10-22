import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { desktopWallpaperUrl } from "./desktop-wallpaper.ts";

const HTML =
  '<div class="desktop" data-ui-desktop-pattern="macos8-copland-blue" data-ui-desktop-workspace="true">';
const URL = "/tools/ssg-assets/b381.png";

describe("desktop wallpaper preload", () => {
  it("finds the background of the rendered pattern in minified or formatted CSS", () => {
    const minified = `[data-ui-desktop-pattern=mono]{background-image:url("/x.png")}[data-ui-desktop-pattern=macos8-copland-blue]{background-image:url("${URL}");background-size:256px 256px}`;
    assert.equal(desktopWallpaperUrl(HTML, minified), URL);
    const formatted = `[data-ui-desktop-pattern="macos8-copland-blue"] {\n  background-image: url(${URL});\n}`;
    assert.equal(desktopWallpaperUrl(HTML, formatted), URL);
  });

  it("skips pages without a desktop and fails when the pattern has no image", () => {
    assert.equal(desktopWallpaperUrl("<main></main>", ""), undefined);
    assert.throws(() => desktopWallpaperUrl(HTML, "[data-ui-desktop-pattern=other]{}"));
  });
});
