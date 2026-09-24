export interface RecoverySettings {
  enabled: boolean;
  intervalMinutes: number;
  retentionDays: number;
}

export const DEFAULT_RECOVERY_SETTINGS: Readonly<RecoverySettings> = Object.freeze({
  enabled: true,
  intervalMinutes: 2,
  retentionDays: 7,
});

export function normalizeRecoverySettings(value: unknown): RecoverySettings {
  const settings =
    typeof value === "object" && value !== null ? (value as Partial<RecoverySettings>) : {};
  return {
    enabled:
      typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_RECOVERY_SETTINGS.enabled,
    intervalMinutes:
      typeof settings.intervalMinutes === "number" && Number.isFinite(settings.intervalMinutes)
        ? Math.max(0.1, Math.min(1440, settings.intervalMinutes))
        : DEFAULT_RECOVERY_SETTINGS.intervalMinutes,
    retentionDays:
      typeof settings.retentionDays === "number" && Number.isFinite(settings.retentionDays)
        ? Math.max(0, Math.min(3650, Math.floor(settings.retentionDays)))
        : DEFAULT_RECOVERY_SETTINGS.retentionDays,
  };
}
