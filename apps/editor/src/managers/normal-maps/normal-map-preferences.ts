import {
  isNormalMapRememberedFrameScope,
  NormalMapFrameScope,
  type NormalMapRememberedFrameScope,
} from "$/managers/normal-maps/normal-map-batch";
import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  defaultLightMaskOptions,
  defaultNormalMapOptions,
  LIGHT_MASK_LIMITS,
  normalizeNormalMapOptions,
  type LightMaskOptions,
  type NormalMapOptions,
} from "@xprite/editor-core/image-editing";

const STORAGE_KEY = "xse.normal-map.preferences.v1";

function clampOption(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : fallback;
}

function normalizeMaskOptions(raw: unknown): LightMaskOptions {
  const defaults = defaultLightMaskOptions();
  if (!raw || typeof raw !== "object") return defaults;
  const source = raw as Partial<Record<keyof LightMaskOptions, unknown>>;
  return {
    strength: clampOption(source.strength, defaults.strength, LIGHT_MASK_LIMITS.strength),
    floor: clampOption(source.floor, defaults.floor, LIGHT_MASK_LIMITS.floor),
    ceiling: clampOption(source.ceiling, defaults.ceiling, LIGHT_MASK_LIMITS.ceiling),
    cavity: clampOption(source.cavity, defaults.cavity, LIGHT_MASK_LIMITS.cavity),
  };
}

export class NormalMapPreferences {
  private value = defaultNormalMapOptions();
  private maskValue = defaultLightMaskOptions();
  private manualAngle = false;
  private scope: NormalMapRememberedFrameScope = NormalMapFrameScope.All;
  constructor(private readonly storage?: PreferenceStoragePort) {
    try {
      const saved = storage?.readJson(STORAGE_KEY);
      const defaults = this.value;
      this.value = normalizeNormalMapOptions(saved ?? {});
      this.maskValue = normalizeMaskOptions(saved?.maskOptions);
      this.manualAngle =
        typeof saved?.paintedLightAngleManual === "boolean"
          ? saved.paintedLightAngleManual
          : this.value.paintedLightAngle !== defaults.paintedLightAngle;
      if (isNormalMapRememberedFrameScope(saved?.frameScope)) this.scope = saved.frameScope;
    } catch {
      /* Use the defaults when preferences are unavailable. */
    }
  }
  get options() {
    return { ...this.value };
  }
  get maskOptions() {
    return { ...this.maskValue };
  }
  get hasManualPaintedLightAngle() {
    return this.manualAngle;
  }
  get frameScope(): NormalMapRememberedFrameScope {
    return this.scope;
  }
  private persist() {
    try {
      this.storage?.writeJson(STORAGE_KEY, {
        ...this.value,
        paintedLightAngleManual: this.manualAngle,
        maskOptions: this.maskValue,
        frameScope: this.scope,
      });
    } catch {
      /* Accepted settings remain available for this workspace. */
    }
  }
  accepted(options: NormalMapOptions, manualAngle: boolean, scope?: string) {
    this.value = normalizeNormalMapOptions(options);
    this.manualAngle = manualAngle;
    if (isNormalMapRememberedFrameScope(scope)) this.scope = scope;
    this.persist();
  }
  acceptedMask(options: LightMaskOptions, scope?: string) {
    this.maskValue = normalizeMaskOptions(options);
    if (isNormalMapRememberedFrameScope(scope)) this.scope = scope;
    this.persist();
  }
  reset() {
    this.value = defaultNormalMapOptions();
    this.maskValue = defaultLightMaskOptions();
    this.manualAngle = false;
    this.scope = NormalMapFrameScope.All;
    this.persist();
  }
}
