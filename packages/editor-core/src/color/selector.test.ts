import { describe, expect, it } from "vitest";

import {
  ColorSelectorMode,
  ColorSelectorRegion,
  ColorWheelHarmony,
  colorSelectorIndicators,
  convertWheelHue,
  sampleColorSelector,
  selectorStateForColor,
  stepColorSelector,
} from "$/color/selector";

const MAIN = ColorSelectorRegion.Main;
const point = (x: number, y = 50) => ({ x, y, width: 101, height: 101 });
const preferences = (mode: ColorSelectorMode) => ({
  mode,
  discrete: false,
  harmony: ColorWheelHarmony.None,
});

describe("color selector", () => {
  it("uses HSL hue and lightness for the spectrum and saturation for its bottom bar", () => {
    const state = selectorStateForColor([255, 0, 0, 128], preferences(ColorSelectorMode.Spectrum));
    expect(sampleColorSelector(state, MAIN, point(0, 50))?.color).toEqual([255, 0, 0, 128]);
    expect(sampleColorSelector(state, MAIN, point(50, 50))?.color).toEqual([0, 255, 255, 128]);
    expect(sampleColorSelector(state, MAIN, point(0, 75))?.color).toEqual([128, 0, 0, 128]);
    expect(sampleColorSelector(state, ColorSelectorRegion.Bottom, point(0))?.color).toEqual([
      128, 128, 128, 128,
    ]);
    const black = sampleColorSelector(state, MAIN, point(70, 100))!;
    expect(black.color).toEqual([0, 0, 0, 128]);
    expect(black.hsl).toEqual([252, 1, 0, 128]);
  });

  it("maps RYB hue through its primary-color positions in both directions", () => {
    for (const [ryb, rgb] of [
      [0, 0],
      [60, 30],
      [120, 60],
      [180, 120],
      [240, 240],
      [300, 300],
    ]) {
      expect(convertWheelHue(ryb!, true)).toBe(rgb);
      expect(convertWheelHue(rgb!, false)).toBe(ryb);
    }
    const rgb = selectorStateForColor(
      [255, 255, 255, 255],
      preferences(ColorSelectorMode.RgbWheel),
    );
    const ryb = { ...rgb, mode: ColorSelectorMode.RybWheel };
    const top = point(50, 0);
    expect(sampleColorSelector(rgb, MAIN, top)?.hsv?.[0]).toBe(120);
    expect(sampleColorSelector(ryb, MAIN, top)?.hsv?.[0]).toBe(60);
  });

  it("encodes an upward hemisphere in normal-map RGB", () => {
    const state = selectorStateForColor(
      [128, 128, 255, 64],
      preferences(ColorSelectorMode.NormalMapWheel),
    );
    expect(sampleColorSelector(state, MAIN, point(50, 50))?.color).toEqual([128, 128, 255, 255]);
    expect(sampleColorSelector(state, MAIN, point(100.4, 50), { captured: true })?.color).toEqual([
      255, 128, 128, 255,
    ]);
    expect(sampleColorSelector(state, MAIN, point(50, -0.4), { captured: true })?.color).toEqual([
      128, 255, 128, 255,
    ]);
    expect(sampleColorSelector(state, MAIN, point(0, 0))?.color).toEqual([128, 128, 255, 255]);
  });

  it("clamps captured wheel drags to the edge and quantizes discrete hue/saturation", () => {
    const state = selectorStateForColor([255, 0, 0, 200], preferences(ColorSelectorMode.RgbWheel));
    expect(sampleColorSelector(state, MAIN, point(130, 50))).toBeNull();
    expect(sampleColorSelector(state, MAIN, point(130, 50), { captured: true })?.hsv?.[1]).toBe(1);
    const quantized = sampleColorSelector({ ...state, discrete: true }, MAIN, point(70, 60))!;
    expect(quantized.hsv![0] % 30).toBe(0);
    expect(quantized.hsv?.[1]).toBe(0.4);
    expect(quantized.color[3]).toBe(200);
  });

  it("adjusts alpha independently in every selector mode", () => {
    for (const mode of Object.values(ColorSelectorMode)) {
      const state = selectorStateForColor([23, 71, 149, 128], preferences(mode));
      expect(sampleColorSelector(state, ColorSelectorRegion.Alpha, point(0))?.color).toEqual([
        23, 71, 149, 0,
      ]);
      expect(sampleColorSelector(state, ColorSelectorRegion.Alpha, point(100))?.color).toEqual([
        23, 71, 149, 255,
      ]);
    }
  });

  it("provides wheel brightness and keyboard channel changes", () => {
    const state = selectorStateForColor([255, 0, 0, 128], preferences(ColorSelectorMode.RgbWheel));
    expect(sampleColorSelector(state, ColorSelectorRegion.Bottom, point(50))?.color).toEqual([
      128, 0, 0, 128,
    ]);
    const spectrum = { ...state, mode: ColorSelectorMode.Spectrum };
    expect(stepColorSelector(spectrum, MAIN, 0.5, 0).color).toEqual([0, 255, 255, 128]);
    expect(stepColorSelector(state, ColorSelectorRegion.Bottom, -0.5, 0).color).toEqual([
      128, 0, 0, 128,
    ]);
    const discrete = { ...state, discrete: true };
    expect(stepColorSelector(discrete, MAIN, 0.01, 0).hsv?.[0]).toBe(30);
    expect(stepColorSelector(discrete, MAIN, 0, 0.01).hsv?.[1]).toBe(0.8);
  });

  it("places harmony indicators and samples the corresponding preview swatches", () => {
    const state = {
      ...selectorStateForColor([255, 0, 0, 255], preferences(ColorSelectorMode.RgbWheel)),
      harmony: ColorWheelHarmony.Complementary,
    };
    expect(colorSelectorIndicators(state, MAIN, 101, 101)).toHaveLength(2);
    const preview = sampleColorSelector(state, MAIN, point(100, 100));
    expect(preview?.color).toEqual([0, 255, 255, 255]);
    expect(preview?.harmony).toBe(true);
    const normal = { ...state, mode: ColorSelectorMode.NormalMapWheel };
    expect(colorSelectorIndicators(normal, MAIN, 101, 101)).toHaveLength(1);
  });
});
