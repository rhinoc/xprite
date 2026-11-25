import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReadOnlyLayerRow } from "$/timeline/layer-row";
import type { SpriteTimeline } from "@xprite/editor-core/timeline";
import { asepriteTheme, UiColorScheme, UIProvider } from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";

function createTimeline(layerName: string): SpriteTimeline {
  return {
    activeFrame: 0,
    activeLayer: 0,
    composeGroups: false,
    layers: [
      {
        id: "layer-1",
        name: layerName,
        visible: true,
        locked: false,
        opacity: 255,
        flags: 1,
      },
    ],
    frames: [{ duration: 100, cels: [null] }],
  };
}

describe("ReadOnlyLayerRow hover tooltip", () => {
  it("exposes the full layer name via title tooltip for both selectable and read-only rows", async () => {
    const initialTheme = await loadUiThemeSnapshot(UiColorScheme.Light, asepriteTheme);
    const longName = "Character_Foreground_Highlights_Spec_v2_VeryLongName";
    const timeline = createTimeline(longName);

    const selectableHtml = renderToString(
      React.createElement(UIProvider, {
        theme: asepriteTheme,
        initialTheme,
        translateKey: (key: string) => key,
        children: React.createElement(ReadOnlyLayerRow, {
          timeline,
          index: 0,
          width: 120,
          selected: true,
          onSelect() {},
        }),
      }),
    );
    const button = selectableHtml.match(/<button\b[^>]*title="[^"]*"[^>]*>/)?.[0];
    expect(button).toBeTruthy();
    expect(button).toMatch(new RegExp(`title="${longName}"`));
    expect(button).not.toMatch(/\bdisabled\b/);

    // When onSelect is omitted, render a non-disabled element so browser hover tooltips still trigger.
    const staticHtml = renderToString(
      React.createElement(UIProvider, {
        theme: asepriteTheme,
        initialTheme,
        translateKey: (key: string) => key,
        children: React.createElement(ReadOnlyLayerRow, {
          timeline,
          index: 0,
          width: 120,
          selected: false,
        }),
      }),
    );
    const span = staticHtml.match(/<span\b[^>]*title="[^"]*"[^>]*>/)?.[0];
    expect(span).toBeTruthy();
    expect(span).toMatch(new RegExp(`title="${longName}"`));
    expect(staticHtml).toContain(`>${longName}</span>`);
  });
});
