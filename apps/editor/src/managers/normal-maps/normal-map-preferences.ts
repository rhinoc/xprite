import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  defaultNormalMapOptions,
  normalizeNormalMapOptions,
  type NormalMapOptions,
} from "@xprite/editor-core/image-editing";

const STORAGE_KEY = "xse.normal-map.preferences.v1";
export class NormalMapPreferences {
  private value = defaultNormalMapOptions();
  constructor(private readonly storage?: PreferenceStoragePort) {
    try {
      this.value = normalizeNormalMapOptions(storage?.readJson(STORAGE_KEY) ?? {});
    } catch {
      /* Use the defaults when preferences are unavailable. */
    }
  }
  get options() {
    return { ...this.value };
  }
  accepted(options: NormalMapOptions) {
    this.value = normalizeNormalMapOptions(options);
    try {
      this.storage?.writeJson(STORAGE_KEY, this.value);
    } catch {
      /* Accepted settings remain available for this workspace. */
    }
  }
  reset() {
    this.accepted(defaultNormalMapOptions());
  }
}
