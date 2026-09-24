import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { build } from "esbuild";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it } from "vitest";

describe("animation-settings-ui [feature-7-12]", () => {
  it("animation-settings-ui behavior", async () => {
    const result = await build({
      stdin: {
        contents: `export * from './apps/editor/src/components/timeline/animation-settings';export * from './apps/editor/src/managers/preferences/timeline-panel-preferences';export * from './packages/editor-core/src/timeline/animation-options.ts';export * from './apps/editor/src/components/timeline/animation-preview';export * from './apps/editor/src/components/canvas/scene-bounds';export {UIProvider} from './packages/ui/dist/ui.js';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      jsx: "automatic",
      platform: "node",
      format: "cjs",
      write: false,
      external: ["react", "react-dom", "react/jsx-runtime"],
      loader: { ".png": "dataurl", ".woff2": "dataurl", ".css": "empty" },
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
    );
    const api = module.exports,
      value = {
        ...api.defaultOnionSkinSettings,
        active: true,
        previousFrames: 4,
        nextFrames: 3,
        type: "red-blue",
        opacityBase: 200,
        opacityStep: 10,
      };
    assert.equal(api.defaultTimelinePanelPreferences.firstFrame, 1);
    assert.equal(
      api.normalizeTimelinePanelPreferences({
        ...api.defaultTimelinePanelPreferences,
        firstFrame: 4,
        thumbnailZoom: 12,
        thumbnailOverlaySize: 1,
      }).thumbnailZoom,
      10,
    );
    assert.equal(
      api.normalizeTimelinePanelPreferences({
        ...api.defaultTimelinePanelPreferences,
        firstFrame: 4,
        thumbnailZoom: 12,
        thumbnailOverlaySize: 1,
      }).thumbnailOverlaySize,
      2,
    );
    const storedPreferences = new Map();
    globalThis.localStorage = {
      getItem: (key) => storedPreferences.get(key) ?? null,
      setItem: (key, value) => storedPreferences.set(key, String(value)),
    };
    api.writeTimelinePanelPreferences("Timeline fixture", {
      ...api.defaultTimelinePanelPreferences,
      firstFrame: -3,
      thumbnailsEnabled: true,
      thumbnailZoom: 3,
    });
    assert.equal(api.readTimelinePanelPreferences("Timeline fixture").firstFrame, -3);
    assert.equal(api.readTimelinePanelPreferences("Timeline fixture").thumbnailZoom, 3);
    api.writeTimelinePanelDefaults({ ...api.defaultTimelinePanelPreferences, firstFrame: 5 });
    assert.equal(api.readTimelinePanelPreferences("New timeline fixture").firstFrame, 5);
    const reset = api.resetOnionSkinOptions(value);
    assert.equal(reset.active, true);
    assert.equal(reset.previousFrames, 4);
    assert.equal(reset.nextFrames, 3);
    assert.equal(reset.opacityBase, 68);
    assert.equal(reset.opacityStep, 28);
    assert.equal(reset.type, "merge");
    const html = renderToString(
      React.createElement(api.OnionSkinSettingsPanel, {
        open: true,
        onOpenChange() {},
        value,
        onChange() {},
        anchor: { x: 232, y: 826, width: 24, height: 24 },
        timelinePosition: "bottom",
        onTimelinePositionChange() {},
        timelinePanelPreferences: api.defaultTimelinePanelPreferences,
        onTimelinePanelPreferencesChange() {},
        onFirstFrameChange() {},
        onSetAsDefaults() {},
      }),
    );
    assert.match(html, /role="dialog"[^>]*aria-label="Timeline Settings"/);
    for (const label of ["First Frame", "Thumbnails", "Set as Defaults"]) {
      const control = html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0];
      assert.ok(control, `missing ${label}`);
      assert.doesNotMatch(control, /disabled/, `${label} enabled`);
    }
    for (const [label, selected] of [
      ["Dock timeline at top", false],
      ["Dock timeline at left", false],
      ["Dock timeline at right", false],
      ["Dock timeline at bottom", true],
    ]) {
      const button = html.match(new RegExp(`<button\\b(?=[^>]*aria-label="${label}")[^>]*>`))?.[0];
      assert.ok(button, `missing ${label}`);
      assert.match(button, /aria-pressed="(?:true|false)"/);
      assert.equal(button.includes("disabled"), false, `${label} is enabled`);
      assert.equal(button.includes('aria-pressed="true"'), selected, `${label} selected state`);
    }
    assert.match(html, /aria-label="Onion skin opacity"/);
    assert.match(html, /aria-label="Onion skin opacity step"/);
    for (const label of [
      "Merge Frames",
      "Red/Blue Tint",
      "Loop through tag frames",
      "Current layer only",
      "Behind sprite",
      "In front of sprite",
      "Set as Defaults",
    ])
      assert.ok(html.includes(label), label);
    assert.doesNotMatch(
      html,
      /aria-label="Previous Frames"|aria-label="Next Frames"|xse-dialog-backdrop/,
      "frame count belongs to timeline handles, configuration is a source popup",
    );
    assert.equal(
      renderToString(
        React.createElement(api.OnionSkinSettingsPanel, {
          open: false,
          onOpenChange() {},
          value,
          onChange() {},
        }),
      ),
      "",
    );
    const enabled = renderToString(
      React.createElement(api.OnionSkinSettingsPanel, {
        open: true,
        onOpenChange() {},
        value,
        onChange() {},
        onFirstFrameChange() {},
        onSetAsDefaults() {},
        timelinePanelPreferences: {
          ...api.defaultTimelinePanelPreferences,
          thumbnailsEnabled: true,
        },
        onTimelinePanelPreferencesChange() {},
      }),
    );
    for (const label of [
      "Thumbnail size",
      "Thumbnail overlay size",
      "Thumbnails",
      "First Frame",
      "Set as Defaults",
    ])
      assert.ok(enabled.includes(label), label);
    const left = renderToString(
      React.createElement(api.OnionSkinSettingsPanel, {
        open: true,
        onOpenChange() {},
        value,
        onChange() {},
        timelinePosition: "left",
        onTimelinePositionChange() {},
      }),
    );
    assert.match(left, /aria-label="Dock timeline at left"[^>]*aria-pressed="true"/);
    const firstFrame = renderToString(
      React.createElement(api.OnionSkinSettingsPanel, {
        open: true,
        onOpenChange() {},
        value,
        onChange() {},
        firstFrame: 12,
        onFirstFrameChange() {},
        timelinePanelPreferences: api.defaultTimelinePanelPreferences,
        onTimelinePanelPreferencesChange() {},
        onSetAsDefaults() {},
      }),
    );
    assert.match(firstFrame, /aria-label="First Frame"[^>]*value="12"/);
    assert.match(firstFrame, /aria-label="Dock timeline at bottom"[^>]*aria-pressed="true"/);
    const menu = api.animationPlaybackMenuItems(api.defaultPlaybackSettings, () => {});
    assert.equal(menu.length, 10);
    assert.deepEqual(
      menu.slice(0, 6).map((v) => v.label),
      ["0.25x", "0.5x", "1x", "1.5x", "2x", "3x"],
    );
    assert.deepEqual(
      api.asepritePreviewWindowBounds(1920, 1050),
      { x: 1392, y: 746, width: 480, height: 262 },
      "preview window source quarter-screen bounds and toolbar/status/scrollbar offsets",
    );
    const timeline = {
      layers: [{ id: "one", name: "Layer", flags: 3, visible: true, locked: false, opacity: 255 }],
      frames: [{ duration: 100, cels: [null] }],
      activeFrame: 0,
      activeLayer: 0,
    };
    const state = {
      document: { id: 1, name: "Preview", width: 16, height: 16, timeline },
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      pixelRevision: 1,
    };
    const preview = renderToString(
      React.createElement(
        api.UIProvider,
        { translateKey: (key) => (key === "ui.close.name" ? "Close {name}" : key) },
        React.createElement(
          api.SceneBoundsContext.Provider,
          { value: { x: 0, y: 0, width: 1920, height: 1050 } },
          React.createElement(api.AnimationPreview, {
            snapshot: state,
            identity: 1,
            open: true,
            onOpenChange() {},
          }),
        ),
      ),
    );
    for (const label of [
      "Preview",
      "Center preview on active editor",
      "Play preview",
      "Close Preview",
      "Animation preview canvas",
    ])
      assert.ok(preview.includes(label), label);
    assert.doesNotMatch(
      preview,
      /Reset preview zoom|>100%<|>1x</,
      "Aseprite controls belong in titlebar; no invented bottom toolbar",
    );
    assert.match(
      preview,
      /data-ui-x="1404" data-ui-y="780" style="[^"]*width:456px;height:216px/,
      "preview client preserves global sampling dimensions rather than recomputing a smaller local-zero canvas",
    );
    console.log(
      "Timeline settings popup: four enabled position choices, enabled First Frame/Thumbnails/Defaults controls, thumbnail options, selection state, reset range retention, closed SSR and playback menu pass.",
    );
  }, 60_000);
});
