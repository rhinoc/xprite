import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  RasterEditor,
  AsepriteInk,
  AsepriteDynamicSensor,
  DEFAULT_DYNAMICS_SETTINGS,
  FillReference,
  EyedropperChannel,
  SelectionMode,
  GradientType,
} from "$/index";

describe("persistent tool preferences", () => {
  it("restores the retained standard brush when discarding an image brush after switching documents", () => {
    const editor = new RasterEditor();
    editor.drawing.settings.setSettings({ brush: { shape: "square", size: 7, angle: 35 } });
    editor.drawing.settings.setSettings({
      brush: {
        shape: "image",
        size: 12,
        angle: 0,
        image: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
      },
    });
    const otherDocument = new RasterEditor();
    otherDocument.drawing.settings.applyPreferences(editor.drawing.settings.capturePreferences());
    otherDocument.drawing.settings.discardImageBrush();
    assert.deepEqual(otherDocument.getSnapshot().settings.brush, {
      shape: "square",
      size: 7,
      angle: 35,
    });
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(
      JSON.parse(JSON.stringify(editor.drawing.settings.capturePersistentPreferences())),
    );
    assert.deepEqual(restored.getSnapshot().settings.brush, {
      shape: "square",
      size: 7,
      angle: 35,
    });
  });

  it("keeps independent rounded tool radii, including temporary marquee settings", () => {
    const editor = new RasterEditor();
    const settings = editor.drawing.settings;
    settings.setSettings({ tool: "rectangle", rectangleCornerRadius: 48 });
    settings.setSettings({ tool: "filled_rectangle", rectangleCornerRadius: 8 });
    settings.setPointerTool("marquee");
    settings.setInputCornerRadius(64);
    assert.equal(settings.getSettings().tool, "filled_rectangle");
    assert.equal(settings.getInputSettings().selectionCornerRadius, 64);
    settings.setPointerTool(null);
    assert.equal(settings.getSettings().rectangleCornerRadius, 8);
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(
      JSON.parse(JSON.stringify(settings.capturePersistentPreferences())),
    );
    restored.drawing.settings.setSettings({ tool: "rectangle" });
    assert.equal(restored.getSnapshot().settings.rectangleCornerRadius, 48);
    restored.drawing.settings.setSettings({ tool: "filled_rectangle" });
    assert.equal(restored.getSnapshot().settings.rectangleCornerRadius, 8);
    restored.drawing.settings.setSettings({ tool: "marquee" });
    assert.equal(restored.getSnapshot().settings.selectionCornerRadius, 64);
  });

  it("preserves requested text size and antialias through a saved workspace", () => {
    const editor = new RasterEditor();
    editor.drawing.settings.setSettings({
      textFontFamily: "Aseprite Mini",
      textFontSize: 12,
      textAntialias: true,
      textScale: 1,
    });
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(
      JSON.parse(JSON.stringify(editor.drawing.settings.capturePersistentPreferences())),
    );
    const settings = restored.getSnapshot().settings;
    assert.equal(settings.textFontFamily, "Aseprite Mini");
    assert.equal(settings.textFontSize, 12);
    assert.equal(settings.textAntialias, true);
    assert.equal(settings.textScale, 1);
    // Typing and committing a final-size raster still publish textScale=1.
    restored.drawing.settings.setSettings({ text: "A", textScale: 1 });
    assert.equal(restored.getSnapshot().settings.textFontSize, 12);
    restored.drawing.settings.resetToolPreferences();
    assert.equal(restored.getSnapshot().settings.textFontSize, 7);
    assert.equal(restored.getSnapshot().settings.textAntialias, false);
  });

  it("starts with Aseprite working colors and preserves explicit saved colors", () => {
    const editor = new RasterEditor();
    assert.deepEqual(editor.getSnapshot().settings.foreground, [255, 255, 255, 255]);
    assert.deepEqual(editor.getSnapshot().settings.background, [0, 0, 0, 255]);
    editor.drawing.settings.setSettings({
      foreground: [12, 13, 14, 255],
      background: [15, 16, 17, 255],
    });
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(
      editor.drawing.settings.capturePersistentPreferences(),
    );
    assert.deepEqual(restored.getSnapshot().settings.foreground, [12, 13, 14, 255]);
    assert.deepEqual(restored.getSnapshot().settings.background, [15, 16, 17, 255]);
  });
  it("restores independent tool banks without restoring the active tool or selection mode", () => {
    const editor = new RasterEditor();
    editor.drawing.settings.setSettings({
      pixelPerfect: true,
      brush: { shape: "square", size: 7, angle: 30 },
      ink: AsepriteInk.LockAlpha,
      opacity: 120,
      foreground: [12, 34, 56, 255],
      eyedropperChannel: EyedropperChannel.Alpha,
      textFontFamily: "Example Font",
      textScale: 3,
    });
    editor.drawing.settings.setSettings({
      tool: "bucket",
      tolerance: 45,
      contiguous: false,
      fillReference: FillReference.VisibleLayers,
    });
    editor.drawing.settings.setSettings({ tool: "magic_wand", tolerance: 9 });
    editor.drawing.settings.setSettings({
      tool: "eraser",
      pixelPerfect: false,
      opacity: 30,
      selectionMode: SelectionMode.Add,
    });
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(
      JSON.parse(JSON.stringify(editor.drawing.settings.capturePersistentPreferences())),
    );
    let settings = restored.getSnapshot().settings;
    assert.equal(settings.tool, "pencil");
    assert.equal(settings.selectionMode, SelectionMode.Replace);
    assert.equal(settings.pixelPerfect, true);
    assert.deepEqual(settings.brush, { shape: "square", size: 7, angle: 30 });
    assert.equal(settings.ink, AsepriteInk.LockAlpha);
    assert.equal(settings.opacity, 120);
    assert.deepEqual(settings.foreground, [12, 34, 56, 255]);
    assert.equal(settings.eyedropperChannel, EyedropperChannel.Alpha);
    assert.equal(settings.textFontFamily, "Example Font");
    assert.equal(settings.textScale, 3);
    restored.drawing.settings.setSettings({ tool: "bucket" });
    settings = restored.getSnapshot().settings;
    assert.equal(settings.tolerance, 45);
    assert.equal(settings.contiguous, false);
    assert.equal(settings.fillReference, FillReference.VisibleLayers);
    restored.drawing.settings.setSettings({ tool: "magic_wand" });
    assert.equal(restored.getSnapshot().settings.tolerance, 9);
    restored.drawing.settings.setSettings({ tool: "eraser" });
    assert.equal(restored.getSnapshot().settings.opacity, 30);
    assert.equal(restored.getSnapshot().settings.pixelPerfect, false);
  });

  it("restores shared ink and dynamics while retaining the private dynamics banks", () => {
    const editor = new RasterEditor();
    editor.drawing.settings.setSettings({
      shareDynamics: false,
      dynamics: {
        ...DEFAULT_DYNAMICS_SETTINGS,
        size: AsepriteDynamicSensor.Pressure,
        minAngle: -45,
      },
    });
    editor.drawing.settings.setSettings({
      tool: "eraser",
      dynamics: {
        ...DEFAULT_DYNAMICS_SETTINGS,
        angle: AsepriteDynamicSensor.Velocity,
      },
      ink: AsepriteInk.CopyColor,
      opacity: 90,
    });
    editor.drawing.settings.setSettings({ shareInk: true, shareDynamics: true });
    const saved = JSON.parse(
      JSON.stringify(editor.drawing.settings.capturePersistentPreferences()),
    );
    const restored = new RasterEditor();
    restored.drawing.settings.restorePersistentPreferences(saved);
    const settings = restored.getSnapshot().settings;
    assert.equal(settings.shareInk, true);
    assert.equal(settings.shareDynamics, true);
    assert.equal(settings.ink, AsepriteInk.CopyColor);
    assert.equal(settings.opacity, 90);
    assert.equal(settings.dynamics?.angle, AsepriteDynamicSensor.Velocity);
    const pencilBank = restored.drawing.settings
      .capturePersistentPreferences()
      .parameters.find(([tool]) => tool === "pencil")?.[1];
    assert.equal(pencilBank?.dynamics?.size, AsepriteDynamicSensor.Pressure);
    assert.equal(pencilBank?.dynamics?.minAngle, -45);
  });

  it("excludes drafts and image brushes and leaves artwork and history untouched", () => {
    const editor = new RasterEditor({ width: 2, height: 2, data: new Uint8ClampedArray(16) });
    const before = editor.getPersistenceSnapshot();
    editor.drawing.settings.setSettings({
      text: "unfinished",
      gradientType: GradientType.Radial,
      brush: {
        shape: "image",
        size: 2,
        angle: 0,
        image: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      },
    });
    const saved = editor.drawing.settings.capturePersistentPreferences();
    assert.equal(saved.settings.text, undefined);
    assert.equal(saved.settings.font, undefined);
    assert.equal(saved.settings.gradientType, undefined);
    assert.equal(saved.brushes[0][1].image, undefined);
    editor.drawing.settings.restorePersistentPreferences(saved);
    assert.deepEqual(editor.getPersistenceSnapshot(), before);
  });

  it("ignores unknown versions and normalizes corrupt fields", () => {
    const editor = new RasterEditor();
    editor.drawing.settings.restorePersistentPreferences({
      version: 99,
      settings: { opacity: -10 },
    });
    assert.equal(editor.getSnapshot().settings.opacity, 255);
    editor.drawing.settings.restorePersistentPreferences({
      version: 1,
      settings: { textScale: -1, foreground: [300, -1, 20, 255], ink: "unknown" },
      brushes: [["pencil", { shape: "unknown", size: 999, angle: -999 }]],
      pixelPerfect: [
        ["pencil", "true"],
        ["unknown-tool", true],
      ],
      parameters: [["pencil", { tolerance: 999 }]],
    });
    const settings = editor.getSnapshot().settings;
    assert.equal(settings.textScale, 1);
    assert.deepEqual(settings.foreground, [255, 0, 20, 255]);
    assert.equal(settings.tolerance, 255);
    assert.equal(settings.opacity, 255);
    assert.equal(settings.pixelPerfect, false);
    assert.deepEqual(settings.brush, { shape: "circle", size: 64, angle: -180 });
  });
});
