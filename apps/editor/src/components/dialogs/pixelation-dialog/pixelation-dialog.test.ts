import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it } from "vitest";

import { SceneBoundsContext } from "$/components/canvas/scene-bounds";
import { PixelationDialog } from "$/components/dialogs/pixelation-dialog";
import { ImportCompare } from "$/components/dialogs/pixelation-dialog/import-compare";
import {
  computePixelationDialogHeight,
  computePixelationParameterHeight,
  computePixelationPreviewHeight,
  DIALOG_CHROME_HEIGHT,
  DIALOG_HEIGHT,
  FOOTER_STACK_HEIGHT,
  FRAME_STEPPER_HEIGHT,
  GAP,
  VIEWPORT_VERTICAL_MARGIN,
} from "$/components/dialogs/pixelation-dialog/pixelation-dialog-layout";
import { EditorPlatformProvider } from "$/managers/platform/editor-platform-context";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import {
  DEFAULT_FILE_PREFERENCES,
  PixelationAlgorithm,
} from "$/managers/preferences/file-preferences";
import { defaultPixelationSettings, PixelArtClassification } from "@xprite/pixelate";
import { asepriteTheme, UiColorScheme, UIProvider } from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";

const TEST_PLATFORM_PORTS = {
  wheelInput: {
    connect: () => () => {},
  },
} as unknown as EditorPlatformPorts;

function makePixels(width: number, height: number) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

describe("pixelation dialog layout", () => {
  it("keeps default collapsed height at 560 and adds frame stepper height for multi-frame imports", () => {
    const collapsed = computePixelationDialogHeight({
      availableHeight: 900,
      hasMultiFrame: false,
      hasMessage: false,
      showAdvanced: false,
      showGridSource: false,
      showDither: false,
      removeBgEnabled: false,
      removeBgManual: false,
    });
    assert.equal(collapsed, DIALOG_HEIGHT);

    const multiFrame = computePixelationDialogHeight({
      availableHeight: 900,
      hasMultiFrame: true,
      hasMessage: false,
      showAdvanced: false,
      showGridSource: false,
      showDither: false,
      removeBgEnabled: false,
      removeBgManual: false,
    });
    assert.equal(multiFrame, DIALOG_HEIGHT + FRAME_STEPPER_HEIGHT + GAP);
  });

  it("expands dialog height gracefully when Advanced is open and stays bounded by viewport", () => {
    const flags = {
      hasMessage: false,
      showAdvanced: true,
      showGridSource: false,
      showDither: false,
      removeBgEnabled: false,
      removeBgManual: false,
    };
    const desktopHeight = computePixelationDialogHeight({
      ...flags,
      availableHeight: 900,
      hasMultiFrame: false,
    });
    assert.ok(desktopHeight > DIALOG_HEIGHT, "expanded dialog should grow beyond 560px");
    assert.ok(desktopHeight <= 900 - VIEWPORT_VERTICAL_MARGIN);

    // Every advanced field (including Width/Height) fits in the parameter region without clipping.
    const clientHeight = desktopHeight - DIALOG_CHROME_HEIGHT;
    const previewHeight = computePixelationPreviewHeight(clientHeight, {
      showAdvanced: true,
      hasMultiFrame: false,
    });
    const parameterHeight = clientHeight - previewHeight - GAP - FOOTER_STACK_HEIGHT - GAP;
    assert.ok(
      parameterHeight >= computePixelationParameterHeight(flags),
      `expected parameterHeight (${parameterHeight}) >= content height (${computePixelationParameterHeight(flags)})`,
    );

    // Short viewport clamps cleanly with comfortable padding.
    const shortHeight = computePixelationDialogHeight({
      ...flags,
      availableHeight: 600,
      hasMultiFrame: true,
    });
    assert.equal(shortHeight, 600 - VIEWPORT_VERTICAL_MARGIN);
  });
});

describe("pixelation dialog rendering", () => {
  it("uses the dedicated split-compare slider aria-label instead of preview zoom", async () => {
    const initialTheme = await loadUiThemeSnapshot(UiColorScheme.Light, asepriteTheme);
    const html = renderToString(
      React.createElement(
        EditorPlatformProvider,
        { ports: TEST_PLATFORM_PORTS },
        React.createElement(
          UIProvider,
          { theme: asepriteTheme, initialTheme, translateKey: (key: string) => key },
          React.createElement(ImportCompare, {
            original: makePixels(16, 16),
            result: makePixels(16, 16),
            width: 340,
            height: 220,
            comparing: true,
            labels: {
              original: "Original",
              result: "Result",
              preparing: "Preparing…",
              slider: "Compare slider",
            },
          }),
        ),
      ),
    );
    const sliderTag = html.match(/<div\b[^>]*role="slider"[^>]*>/)?.[0];
    assert.ok(sliderTag, "expected split comparison slider element");
    assert.match(sliderTag, /aria-label="Compare slider"/);
    assert.doesNotMatch(sliderTag, /Preview zoom|预览缩放/);
  });

  it("renders multi-frame navigation controls when frameCount > 1 and hides them for single frames", async () => {
    const initialTheme = await loadUiThemeSnapshot(UiColorScheme.Light, asepriteTheme);
    const renderDialog = (frameCount: number, previewFrame: number) => {
      const pixels = makePixels(32, 32);
      const workflow: Parameters<typeof PixelationDialog>[0]["workflow"] = {
        pending: {
          sourcePalette: [],
          grid: null,
          algorithm: PixelationAlgorithm.Auto,
          pixels,
          name: "anim.gif",
          width: 32,
          height: 32,
          classification: PixelArtClassification.LikelyPixelArt,
          frameCount,
          previewFrame,
        },
        pixelationOptions: defaultPixelationSettings({ width: 32, height: 32 }),
        pixelationPreview: pixels,
        pixelationPreviewing: false,
        pixelationError: null,
        setPixelationOptions() {},
        setImportAlgorithm() {},
        setImportPreviewFrame() {},
        setFilePreferences() {},
        getFilePreferences: () => ({ ...DEFAULT_FILE_PREFERENCES, importLastAction: "pixelate" }),
        busy: false,
        discardEmptyImport() {},
        acceptOriginalImport() {},
        acceptPixelatedImport() {},
      };
      return renderToString(
        React.createElement(
          EditorPlatformProvider,
          { ports: TEST_PLATFORM_PORTS },
          React.createElement(
            UIProvider,
            { theme: asepriteTheme, initialTheme, translateKey: (key: string) => key },
            React.createElement(
              SceneBoundsContext.Provider,
              { value: { x: 0, y: 0, width: 1280, height: 900 } },
              React.createElement(PixelationDialog, { workflow }),
            ),
          ),
        ),
      );
    };

    const singleFrameHtml = renderDialog(1, 0);
    assert.doesNotMatch(singleFrameHtml, /Previous preview frame|上一预览帧/);
    assert.doesNotMatch(singleFrameHtml, /Next preview frame|下一预览帧/);

    const multiFrameHtml = renderDialog(84, 0);
    assert.match(multiFrameHtml, /aria-label="(?:Previous preview frame|上一预览帧)"/);
    assert.match(multiFrameHtml, /aria-label="(?:Next preview frame|下一预览帧)"/);
    assert.match(multiFrameHtml, /(?:Frame 1 \(1\/84\)|帧 1（1\/84）)/);
    const sliderTag = multiFrameHtml.match(/<div\b[^>]*role="slider"[^>]*>/)?.[0];
    assert.ok(sliderTag, "expected split comparison slider inside dialog");
    assert.match(sliderTag, /aria-label="(?:Compare slider|对比滑块)"/);
  });
});
