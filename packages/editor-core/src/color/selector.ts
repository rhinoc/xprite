import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import {
  hslaToRgba,
  hsvaToRgba,
  rgbaToHsla,
  rgbaToHsva,
  type Hsla,
  type Hsva,
} from "$/color/color";

export enum ColorSelectorMode {
  TintShadeTone = "tint-shade-tone",
  Spectrum = "spectrum",
  RgbWheel = "rgb-wheel",
  RybWheel = "ryb-wheel",
  NormalMapWheel = "normal-map-wheel",
}
export enum ColorSelectorRegion {
  Main = "main",
  Bottom = "bottom",
  Alpha = "alpha",
}
export enum ColorWheelHarmony {
  None = "none",
  Complementary = "complementary",
  Monochromatic = "monochromatic",
  Analogous = "analogous",
  SplitComplementary = "split-complementary",
  Triadic = "triadic",
  Tetradic = "tetradic",
  Square = "square",
}
export interface ColorSelectorState {
  mode: ColorSelectorMode;
  discrete: boolean;
  harmony: ColorWheelHarmony;
  color: Rgba;
  hsv: Hsva;
  hsl: Hsla;
}
export interface ColorSelectorPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ColorSelectorSample {
  color: Rgba;
  hsv?: Hsva;
  hsl?: Hsla;
  harmony?: boolean;
}
export interface ColorSelectorIndicator {
  x: number;
  y: number;
  light: boolean;
}

const FULL_TURN = 360;
const HALF_TURN = FULL_TURN / 2;
const WHEEL_ROTATION = 30;
const DISCRETE_HUE_STEP = 30;
const DISCRETE_RADIAL_STEPS = 6;
const NORMAL_MIDPOINT = 128;
const NORMAL_BLUE_APPROXIMATION = 246;
const HARMONY_PREVIEW_DIVISOR = 10;
const KEYBOARD_PLANE_SIZE = 101;
const KEYBOARD_CHANNEL_STEP = 0.01;
const RYB_HUE_STOPS: readonly (readonly [number, number])[] = [
  [0, 0],
  [120, 60],
  [180, 120],
  [240, 240],
  [360, 360],
];
const HARMONIES: Record<ColorWheelHarmony, readonly (readonly [number, number])[]> = {
  [ColorWheelHarmony.None]: [[0, 1]],
  [ColorWheelHarmony.Complementary]: [
    [0, 1],
    [180, 1],
  ],
  [ColorWheelHarmony.Monochromatic]: [
    [0, 1],
    [0, 0.5],
  ],
  [ColorWheelHarmony.Analogous]: [
    [0, 1],
    [30, 1],
    [330, 1],
  ],
  [ColorWheelHarmony.SplitComplementary]: [
    [0, 1],
    [150, 1],
    [210, 1],
  ],
  [ColorWheelHarmony.Triadic]: [
    [0, 1],
    [120, 1],
    [240, 1],
  ],
  [ColorWheelHarmony.Tetradic]: [
    [0, 1],
    [120, 1],
    [180, 1],
    [300, 1],
  ],
  [ColorWheelHarmony.Square]: [
    [0, 1],
    [90, 1],
    [180, 1],
    [270, 1],
  ],
};
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const wrapHue = (value: number) => ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;
const axisValue = (position: number, size: number) => clampUnit(position / Math.max(1, size - 1));
const byte = (value: number) => Math.max(0, Math.min(UINT8_MAX, value));

export function isColorWheel(mode: ColorSelectorMode): boolean {
  return mode !== ColorSelectorMode.TintShadeTone && mode !== ColorSelectorMode.Spectrum;
}

/** RYB hue positions interpolate between red, yellow, green, blue, and red. */
export function convertWheelHue(hue: number, toRgb: boolean): number {
  const input = toRgb ? 0 : 1;
  const output = toRgb ? 1 : 0;
  const value = wrapHue(hue);
  for (let index = 1; index < RYB_HUE_STOPS.length; index++) {
    const before = RYB_HUE_STOPS[index - 1]!;
    const after = RYB_HUE_STOPS[index]!;
    if (value <= after[input]) {
      const fraction = (value - before[input]) / (after[input] - before[input]);
      return before[output] + fraction * (after[output] - before[output]);
    }
  }
  return value;
}

function hsvSample(hsv: Hsva): ColorSelectorSample {
  return { color: hsvaToRgba(hsv), hsv };
}
function hslSample(hsl: Hsla): ColorSelectorSample {
  return { color: hslaToRgba(hsl), hsl };
}
function wheelHarmonies(state: ColorSelectorState): Hsva[] {
  const [hue, saturation, value, alpha] = state.hsv;
  const ryb = state.mode === ColorSelectorMode.RybWheel;
  const wheelHue = ryb ? convertWheelHue(hue, false) : hue;
  return HARMONIES[state.harmony].map(([offset, multiplier]) => [
    ryb ? convertWheelHue(wheelHue + offset, true) : wrapHue(wheelHue + offset),
    saturation * multiplier,
    value,
    alpha,
  ]);
}
function wheelGeometry(width: number, height: number) {
  return {
    cx: (width - 1) / 2,
    cy: (height - 1) / 2,
    radius: Math.max(1, Math.min(width, height) / 2) - 0.1,
  };
}

/** The same sampling policy supplies painting, hover, picking, and channel drags. */
export function sampleColorSelector(
  state: ColorSelectorState,
  region: ColorSelectorRegion,
  point: ColorSelectorPoint,
  options: { captured?: boolean; paint?: boolean } = {},
): ColorSelectorSample | null {
  const axis = axisValue(point.x, point.width);
  const alpha = options.paint || state.color[3] === 0 ? UINT8_MAX : state.color[3];
  if (region === ColorSelectorRegion.Alpha) {
    const opacity = Math.trunc(axis * UINT8_MAX);
    return {
      color: [state.color[0], state.color[1], state.color[2], opacity],
      hsv: [state.hsv[0], state.hsv[1], state.hsv[2], opacity],
      hsl: [state.hsl[0], state.hsl[1], state.hsl[2], opacity],
    };
  }
  if (region === ColorSelectorRegion.Bottom) {
    if (state.mode === ColorSelectorMode.Spectrum)
      return hslSample([state.hsl[0], axis, state.hsl[2], alpha]);
    if (state.mode === ColorSelectorMode.TintShadeTone)
      return hsvSample([
        axis * FULL_TURN,
        options.paint ? 1 : state.hsv[1],
        options.paint ? 1 : state.hsv[2],
        alpha,
      ]);
    return hsvSample([state.hsv[0], state.hsv[1], axis, alpha]);
  }
  const vertical = 1 - axisValue(point.y, point.height);
  if (state.mode === ColorSelectorMode.TintShadeTone)
    return hsvSample([state.hsv[0], axis, vertical, alpha]);
  if (state.mode === ColorSelectorMode.Spectrum)
    return hslSample([axis * FULL_TURN, state.hsl[1], vertical, alpha]);

  if (state.mode !== ColorSelectorMode.NormalMapWheel && state.color[3] > 0) {
    const harmonies = wheelHarmonies(state);
    const size = Math.floor(Math.min(point.width, point.height) / HARMONY_PREVIEW_DIVISOR);
    const start = point.width - harmonies.length * size;
    if (size > 0 && point.y >= point.height - size && point.x >= start) {
      const index = Math.min(harmonies.length - 1, Math.floor((point.x - start) / size));
      const [hue, saturation, value] = harmonies[index]!;
      const sample = hsvSample([hue, saturation, value, alpha]);
      return { ...sample, harmony: true };
    }
  }
  const { cx, cy, radius } = wheelGeometry(point.width, point.height);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const distance = Math.hypot(dx, dy);
  if (distance > radius && !options.captured)
    return state.mode === ColorSelectorMode.NormalMapWheel
      ? { color: [NORMAL_MIDPOINT, NORMAL_MIDPOINT, UINT8_MAX, UINT8_MAX] }
      : null;
  const radial = clampUnit(distance / radius);
  const angle = Math.atan2(-dy, dx);
  if (state.mode === ColorSelectorMode.NormalMapWheel) {
    let nx = dx / radius;
    let ny = -dy / radius;
    let nz = Math.sqrt(1 - radial * radial);
    if (state.discrete) {
      const degrees =
        Math.round((angle * HALF_TURN) / Math.PI / DISCRETE_HUE_STEP) * DISCRETE_HUE_STEP;
      const direction = radial < 1 / DISCRETE_RADIAL_STEPS ? 0 : (degrees * Math.PI) / HALF_TURN;
      const ring = Math.floor(radial * DISCRETE_RADIAL_STEPS);
      const discreteRadius = ring / (DISCRETE_RADIAL_STEPS - 1);
      nx = discreteRadius * Math.cos(direction);
      ny = discreteRadius * Math.sin(direction);
      const blueDegrees = Math.floor(
        (90 * (DISCRETE_RADIAL_STEPS - Math.floor(discreteRadius * DISCRETE_RADIAL_STEPS))) /
          (DISCRETE_RADIAL_STEPS - 1),
      );
      nz = Math.sin((blueDegrees * Math.PI) / HALF_TURN);
    }
    return {
      color: [
        byte(NORMAL_MIDPOINT + Math.trunc(NORMAL_MIDPOINT * nx)),
        byte(NORMAL_MIDPOINT + Math.trunc(NORMAL_MIDPOINT * ny)),
        byte(NORMAL_MIDPOINT + Math.trunc(NORMAL_MIDPOINT * nz)),
        UINT8_MAX,
      ],
    };
  }
  let hue = wrapHue((angle * HALF_TURN) / Math.PI + WHEEL_ROTATION);
  let saturation = radial;
  if (state.discrete) {
    hue = wrapHue(Math.round(hue / DISCRETE_HUE_STEP) * DISCRETE_HUE_STEP);
    saturation = Math.min(
      1,
      Math.floor(radial * DISCRETE_RADIAL_STEPS) / (DISCRETE_RADIAL_STEPS - 1),
    );
  }
  if (state.mode === ColorSelectorMode.RybWheel) hue = convertWheelHue(hue, true);
  return hsvSample([hue, saturation, state.color[3] === 0 ? 1 : state.hsv[2], alpha]);
}

export function colorSelectorIndicators(
  state: ColorSelectorState,
  region: ColorSelectorRegion,
  width: number,
  height: number,
): ColorSelectorIndicator[] {
  if (state.color[3] === 0) return [];
  if (region === ColorSelectorRegion.Alpha)
    return [{ x: (state.color[3] / UINT8_MAX) * (width - 1), y: (height - 1) / 2, light: false }];
  if (region === ColorSelectorRegion.Bottom) {
    const axis =
      state.mode === ColorSelectorMode.Spectrum
        ? state.hsl[1]
        : state.mode === ColorSelectorMode.TintShadeTone
          ? state.hsv[0] / FULL_TURN
          : state.hsv[2];
    const light =
      state.mode === ColorSelectorMode.Spectrum
        ? state.hsl[2] < 0.5
        : state.mode !== ColorSelectorMode.TintShadeTone && state.hsv[2] < 0.5;
    return [{ x: axis * (width - 1), y: (height - 1) / 2, light }];
  }
  if (!isColorWheel(state.mode)) {
    const spectrum = state.mode === ColorSelectorMode.Spectrum;
    return [
      {
        x: (spectrum ? state.hsl[0] / FULL_TURN : state.hsv[1]) * (width - 1),
        y: (1 - (spectrum ? state.hsl[2] : state.hsv[2])) * (height - 1),
        light: (spectrum ? state.hsl[2] : state.hsv[2]) < 0.5,
      },
    ];
  }
  const { cx, cy, radius } = wheelGeometry(width, height);
  if (state.mode === ColorSelectorMode.NormalMapWheel) {
    const nx = (state.color[0] / UINT8_MAX) * 2 - 1;
    const ny = (state.color[1] / UINT8_MAX) * 2 - 1;
    const nz = clampUnit((state.color[2] / UINT8_MAX) * 2 - 1);
    const radial =
      state.color[2] > NORMAL_BLUE_APPROXIMATION
        ? Math.min(1, Math.hypot(nx, ny))
        : Math.sqrt(1 - nz * nz);
    const angle = Math.atan2(ny, nx);
    return [
      {
        x: cx + Math.cos(angle) * radius * radial,
        y: cy - Math.sin(angle) * radius * radial,
        light: true,
      },
    ];
  }
  return wheelHarmonies(state).map(([hue, saturation, value]) => {
    const degrees = state.mode === ColorSelectorMode.RybWheel ? convertWheelHue(hue, false) : hue;
    const angle = ((degrees - WHEEL_ROTATION) * Math.PI) / HALF_TURN;
    return {
      x: cx + Math.cos(angle) * radius * saturation,
      y: cy - Math.sin(angle) * radius * saturation,
      light: value < 0.5,
    };
  });
}

export function stepColorSelector(
  state: ColorSelectorState,
  region: ColorSelectorRegion,
  horizontal: number,
  vertical: number,
): ColorSelectorSample {
  const alpha = state.color[3] || UINT8_MAX;
  if (region === ColorSelectorRegion.Alpha)
    return sampleColorSelector(state, region, {
      x: clampUnit(state.color[3] / UINT8_MAX + horizontal),
      y: 0,
      width: 2,
      height: 1,
    })!;
  if (region === ColorSelectorRegion.Bottom) {
    const axis =
      state.mode === ColorSelectorMode.Spectrum
        ? state.hsl[1]
        : state.mode === ColorSelectorMode.TintShadeTone
          ? state.hsv[0] / FULL_TURN
          : state.hsv[2];
    return sampleColorSelector(state, region, {
      x: clampUnit(axis + horizontal),
      y: 0,
      width: 2,
      height: 1,
    })!;
  }
  if (state.mode === ColorSelectorMode.Spectrum)
    return hslSample([
      wrapHue(state.hsl[0] + horizontal * FULL_TURN),
      state.hsl[1],
      clampUnit(state.hsl[2] - vertical),
      alpha,
    ]);
  if (state.mode === ColorSelectorMode.TintShadeTone)
    return hsvSample([
      state.hsv[0],
      clampUnit(state.hsv[1] + horizontal),
      clampUnit(state.hsv[2] - vertical),
      alpha,
    ]);
  if (state.discrete && state.mode !== ColorSelectorMode.NormalMapWheel) {
    const ryb = state.mode === ColorSelectorMode.RybWheel;
    const wheelHue = ryb ? convertWheelHue(state.hsv[0], false) : state.hsv[0];
    const nextHue = wrapHue(wheelHue + (horizontal / KEYBOARD_CHANNEL_STEP) * DISCRETE_HUE_STEP);
    const saturation = clampUnit(
      state.hsv[1] - vertical / KEYBOARD_CHANNEL_STEP / (DISCRETE_RADIAL_STEPS - 1),
    );
    return hsvSample([
      ryb ? convertWheelHue(nextHue, true) : nextHue,
      saturation,
      state.hsv[2],
      alpha,
    ]);
  }
  const size = KEYBOARD_PLANE_SIZE;
  const center = (size - 1) / 2;
  const marker = colorSelectorIndicators(state, region, size, size)[0] ?? { x: center, y: center };
  const distance = (step: number) =>
    state.discrete && step !== 0
      ? Math.sign(step) * Math.max(Math.abs(step) * size, size / DISCRETE_RADIAL_STEPS)
      : step * size;
  return sampleColorSelector(
    state,
    region,
    {
      x: marker.x + distance(horizontal),
      y: marker.y + distance(vertical),
      width: size,
      height: size,
    },
    { captured: true },
  )!;
}

export function selectorStateForColor(
  color: Rgba,
  preferences: Pick<ColorSelectorState, "mode" | "discrete" | "harmony">,
): ColorSelectorState {
  return { ...preferences, color, hsv: rgbaToHsva(color), hsl: rgbaToHsla(color) };
}
