import {
  DEFAULT_DYNAMICS_SETTINGS,
  SLOW_TRACKING_ENABLED_AMOUNT,
  SLOW_TRACKING_MAX,
  type BrushDynamicsSettings,
  type BrushDynamicInput,
} from "@xprite/editor-core";
export type { BrushDynamicsSettings, BrushDynamicInput } from "@xprite/editor-core";
export { SLOW_TRACKING_ENABLED_AMOUNT, SLOW_TRACKING_MAX };

export type DynamicsSettings = BrushDynamicsSettings;
export type DynamicsSensor = BrushDynamicInput;
export const defaultDynamicsSettings: Readonly<DynamicsSettings> = DEFAULT_DYNAMICS_SETTINGS;
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
/** The dynamics panel copies the current tool into the newly selected bank.
 * Enabling shared dynamics does not overwrite every tool's own bank. */
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
export function setSlowTracking(settings: DynamicsSettings, enabled: boolean): DynamicsSettings {
  return {
    ...settings,
    slowTracking: enabled,
    slowTrackingAmount:
      enabled && settings.slowTrackingAmount === 0
        ? SLOW_TRACKING_ENABLED_AMOUNT
        : settings.slowTrackingAmount,
  };
}
