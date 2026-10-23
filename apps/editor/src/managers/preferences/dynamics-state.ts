import {
  DEFAULT_DYNAMICS_SETTINGS,
  MYPAINT_PRESSURE_GAIN_LOG_LIMIT,
  MYPAINT_SLOW_TRACKING_MAX,
  type BrushDynamicsSettings,
} from "@xprite/editor-core";

export type DynamicsSettings = BrushDynamicsSettings;
export const defaultDynamicsSettings: Readonly<DynamicsSettings> = DEFAULT_DYNAMICS_SETTINGS;
/** Integer slider positions per unit of libmypaint's fractional settings. */
const SLIDER_STEPS_PER_UNIT = 10;
const GAIN_LABEL_DIGITS = 2;
const TRACKING_LABEL_DIGITS = 1;
export const SLOW_TRACKING_SLIDER_MAX = MYPAINT_SLOW_TRACKING_MAX * SLIDER_STEPS_PER_UNIT;
export const PRESSURE_GAIN_SLIDER_LIMIT = MYPAINT_PRESSURE_GAIN_LOG_LIMIT * SLIDER_STEPS_PER_UNIT;

export interface DynamicsPreferences {
  shared: boolean;
  common: DynamicsSettings;
  tools: Record<string, DynamicsSettings>;
}
export function createDynamicsPreferences(): DynamicsPreferences {
  return { shared: true, common: { ...defaultDynamicsSettings }, tools: {} };
}
export function getDynamicsSettings(
  preferences: DynamicsPreferences,
  tool: string,
): DynamicsSettings {
  return preferences.shared
    ? preferences.common
    : (preferences.tools[tool] ?? defaultDynamicsSettings);
}
export function updateDynamicsSettings(
  preferences: DynamicsPreferences,
  tool: string,
  settings: DynamicsSettings,
): DynamicsPreferences {
  return preferences.shared
    ? { ...preferences, common: { ...settings } }
    : {
        ...preferences,
        tools: { ...preferences.tools, [tool]: { ...settings } },
      };
}
/** Switching banks carries the current settings into the new bank; enabling
 * sharing does not overwrite the per-tool banks. */
export function shareDynamicsSettings(
  preferences: DynamicsPreferences,
  tool: string,
  shared: boolean,
): DynamicsPreferences {
  if (preferences.shared === shared) return preferences;
  return updateDynamicsSettings(
    { ...preferences, shared },
    tool,
    getDynamicsSettings(preferences, tool),
  );
}

export function slowTrackingSliderValue(settings: DynamicsSettings): number {
  return Math.round(settings.slowTracking * SLIDER_STEPS_PER_UNIT);
}
export function withSlowTrackingSliderValue(
  settings: DynamicsSettings,
  value: number,
): DynamicsSettings {
  return { ...settings, slowTracking: value / SLIDER_STEPS_PER_UNIT };
}
export function slowTrackingLabel(value: number): string {
  return (value / SLIDER_STEPS_PER_UNIT).toFixed(TRACKING_LABEL_DIGITS);
}
export function pressureGainSliderValue(settings: DynamicsSettings): number {
  return Math.round(settings.pressureGain * SLIDER_STEPS_PER_UNIT);
}
export function withPressureGainSliderValue(
  settings: DynamicsSettings,
  value: number,
): DynamicsSettings {
  return { ...settings, pressureGain: value / SLIDER_STEPS_PER_UNIT };
}
/** Pressure gain is logarithmic; show the resulting pressure multiplier. */
export function pressureGainLabel(value: number): string {
  return `${Math.exp(value / SLIDER_STEPS_PER_UNIT).toFixed(GAIN_LABEL_DIGITS)}x`;
}
