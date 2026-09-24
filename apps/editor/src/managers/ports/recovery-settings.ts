/** Persistence boundary for manager-owned recovery settings. */
export interface RecoverySettingsPort {
  load(): unknown;
  save(value: unknown): void;
}
