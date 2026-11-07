import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  defaultNormalMapOptions,
  normalizeNormalMapOptions,
  type NormalMapOptions,
} from "@xprite/editor-core/image-editing";

const STORAGE_KEY = "xse.normal-map.preferences.v1";
export class NormalMapPreferences {
  private value = defaultNormalMapOptions();
  private manualAngle = false;
  constructor(private readonly storage?: PreferenceStoragePort) {
    try {
      const saved = storage?.readJson(STORAGE_KEY);
      const defaults = this.value;
      this.value = normalizeNormalMapOptions(saved ?? {});
      this.manualAngle =
        typeof saved?.paintedLightAngleManual === "boolean"
          ? saved.paintedLightAngleManual
          : this.value.paintedLightAngle !== defaults.paintedLightAngle;
    } catch {
      /* Use the defaults when preferences are unavailable. */
    }
  }
  get options() {
    return { ...this.value };
  }
  get hasManualPaintedLightAngle() {
    return this.manualAngle;
  }
  accepted(options: NormalMapOptions, manualAngle: boolean) {
    this.value = normalizeNormalMapOptions(options);
    this.manualAngle = manualAngle;
    try {
      this.storage?.writeJson(STORAGE_KEY, { ...this.value, paintedLightAngleManual: manualAngle });
    } catch {
      /* Accepted settings remain available for this workspace. */
    }
  }
  reset() {
    this.accepted(defaultNormalMapOptions(), false);
  }
}
