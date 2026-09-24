import {
  DEFAULT_DYNAMICS_SETTINGS,
  type AsepriteDynamicsSettings,
  type AsepriteDynamicSensor,
} from "@xprite/editor-core";
export type { AsepriteDynamicsSettings, AsepriteDynamicSensor } from "@xprite/editor-core";

export type DynamicsSettings = AsepriteDynamicsSettings;
export type DynamicsSensor = AsepriteDynamicSensor;
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
/** DynamicsPopup transfers the current panel to the new bank; unlike ink
 * sharing, enabling shared dynamics does not overwrite every tool's own bank. */
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
export function setDynamicsStabilizer(
  settings: DynamicsSettings,
  enabled: boolean,
): DynamicsSettings {
  return {
    ...settings,
    stabilizer: enabled,
    stabilizerFactor: enabled && settings.stabilizerFactor === 0 ? 16 : settings.stabilizerFactor,
  };
}
