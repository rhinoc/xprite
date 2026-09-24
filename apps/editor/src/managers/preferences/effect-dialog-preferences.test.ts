import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { EffectDialogPreferences } from "$/managers/preferences/effect-dialog-preferences";
import {
  EffectKind,
  EffectTarget,
  HueSaturationMode,
  ConvolutionPreset,
  type EffectSpec,
} from "@xprite/editor-core";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const hue: Extract<EffectSpec, { kind: EffectKind.HueSaturation }> = {
  kind: EffectKind.HueSaturation,
  mode: HueSaturationMode.HslMul,
  hue: 0,
  saturation: 0,
  lightness: 0,
  alpha: 0,
};
const replace: Extract<EffectSpec, { kind: EffectKind.ReplaceColor }> = {
  kind: EffectKind.ReplaceColor,
  tolerance: 12,
  from: [0, 0, 0, 255],
  to: [255, 255, 255, 255],
};
describe("filter preferences", () => {
  it("remembers advanced parameters only after OK and restores independent curve drafts", () => {
    const port = storage();
    const preferences = new EffectDialogPreferences(port);
    const median = { kind: EffectKind.MedianBlur, width: 8, height: 4 } as const;
    const convolution = {
      kind: EffectKind.ConvolutionMatrix,
      preset: ConvolutionPreset.Emboss,
    } as const;
    const curve = {
      kind: EffectKind.ColorCurve,
      points: [
        { x: 0, y: 255 },
        { x: 255, y: 0 },
      ],
    } as const;
    preferences.remember(EffectTarget.All, EffectKind.MedianBlur, false, median);
    expectInitial(preferences, median, { width: 3, height: 3 });
    preferences.accepted(median);
    preferences.accepted(convolution);
    preferences.accepted(curve);
    const restored = new EffectDialogPreferences(port);
    expectInitial(restored, median, { width: 8, height: 4 });
    expectInitial(restored, convolution, { preset: ConvolutionPreset.Emboss });
    const first = restored.initial(curve),
      second = restored.initial(curve);
    assert.deepEqual(first, curve);
    if (first.kind === EffectKind.ColorCurve && second.kind === EffectKind.ColorCurve)
      assert.notEqual(first.points, second.points);
    restored.reset();
    const reset = new EffectDialogPreferences(port);
    assert.deepEqual(reset.initial(curve), {
      kind: EffectKind.ColorCurve,
      points: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
    });
    expectInitial(reset, median, { width: 3, height: 3 });
  });
  it("normalizes persisted advanced dimensions, invalid presets and duplicate curve inputs", () => {
    const port = storage();
    port.setItem(
      "xse.filters.preferences.v1",
      JSON.stringify({
        version: 1,
        preferences: {
          median: { width: 1000, height: -10 },
          convolution: "invalid",
          curve: [
            { x: 20, y: 500 },
            { x: 0, y: 50 },
            { x: 20, y: 60 },
          ],
        },
      }),
    );
    const preferences = new EffectDialogPreferences(port);
    expectInitial(
      preferences,
      { kind: EffectKind.MedianBlur, width: 3, height: 3 },
      { width: 100, height: 1 },
    );
    expectInitial(
      preferences,
      { kind: EffectKind.ConvolutionMatrix, preset: ConvolutionPreset.Identity },
      { preset: ConvolutionPreset.GaussianBlur },
    );
    assert.deepEqual(
      preferences.initial({ kind: EffectKind.ColorCurve, points: [{ x: 0, y: 0 }] }),
      {
        kind: EffectKind.ColorCurve,
        points: [
          { x: 0, y: 50 },
          { x: 20, y: 60 },
        ],
      },
    );
  });
  it("remembers preview, target and hue mode even when no effect is accepted", () => {
    const port = storage();
    const manager = new EffectDialogPreferences(port);
    manager.remember(EffectTarget.All, EffectKind.HueSaturation, false, {
      ...hue,
      mode: HueSaturationMode.HsvAdd,
    });
    const restored = new EffectDialogPreferences(port);
    assert.equal(restored.target, EffectTarget.All);
    assert.equal(restored.preview[EffectKind.HueSaturation], false);
    assert.equal((restored.initial(hue) as typeof hue).mode, HueSaturationMode.HsvAdd);
  });
  it("stores accepted parameters separately and persists a reset", () => {
    const port = storage();
    const manager = new EffectDialogPreferences(port);
    manager.remember(EffectTarget.All, EffectKind.ReplaceColor, false, replace);
    assert.equal(
      (new EffectDialogPreferences(port).initial(replace) as typeof replace).tolerance,
      0,
    );
    manager.accepted(replace);
    assert.equal(
      (new EffectDialogPreferences(port).initial(replace) as typeof replace).tolerance,
      12,
    );
    manager.reset();
    const reset = new EffectDialogPreferences(port);
    assert.equal(reset.target, EffectTarget.Selected);
    assert.equal(reset.preview[EffectKind.ReplaceColor], undefined);
    assert.equal((reset.initial(replace) as typeof replace).tolerance, 0);
  });
});

function expectInitial(
  preferences: EffectDialogPreferences,
  spec: EffectSpec,
  values: Record<string, unknown>,
) {
  const initial = preferences.initial(spec);
  for (const [key, value] of Object.entries(values))
    assert.deepEqual(initial[key as keyof EffectSpec], value);
}
