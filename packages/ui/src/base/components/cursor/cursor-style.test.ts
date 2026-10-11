import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { cursorScopeStyle } from "$/base/components/cursor";
import { defaultUiTheme } from "$/base/theme/default-theme";

describe("cursor scope style", () => {
  it("inlines theme cursor artwork as data URIs by default", () => {
    const style = cursorScopeStyle({ theme: defaultUiTheme }) as Record<string, string>;
    const crosshair = defaultUiTheme.cursors.crosshair!;
    assert.match(style["--ui-cursor-crosshair"], /^url\("data:image\/svg\+xml,%3C/);
    assert.ok(
      style["--ui-cursor-crosshair"].endsWith(
        `") ${crosshair.hotspot.x} ${crosshair.hotspot.y}, crosshair`,
      ),
    );
  });

  it("references artwork through a caller-provided URL, keeping hotspots and fallbacks", () => {
    const sources = new Map<string, string>();
    const style = cursorScopeStyle({
      theme: defaultUiTheme,
      scale: 2,
      artworkUrl: (svg) => {
        const url = `/cursors/${sources.size}.svg`;
        sources.set(url, svg);
        return url;
      },
    }) as Record<string, string>;
    const hand = defaultUiTheme.cursors.hand!;
    const value = style["--ui-cursor-hand"];
    const url = /^url\("([^"]+)"\)/.exec(value)?.[1];
    assert.ok(url && sources.has(url), value);
    assert.ok(sources.get(url)!.includes(`width="${hand.width * 2}"`));
    assert.ok(value.endsWith(`") ${hand.hotspot.x * 2 + 1} ${hand.hotspot.y * 2 + 1}, grab`));
    assert.ok(Object.values(style).every((entry) => !entry.includes("data:")));
  });
});
