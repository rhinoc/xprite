import { DEFAULT_PROJECT_DATABASE_NAME } from "$/adapters/storage/project-storage/indexeddb";
import type { RecoverySettingsPort } from "$/managers/ports/recovery-settings";
import { optionalLocalStorage } from "@xprite/bedrock/browser/localstorage";

const RECOVERY_SETTINGS_KEY_PREFIX = "xse.recovery.settings.v1";

export class RecoverySettingsStore implements RecoverySettingsPort {
  private readonly key: string;
  constructor(
    namespace = DEFAULT_PROJECT_DATABASE_NAME,
    private readonly storage?: Pick<Storage, "getItem" | "setItem">,
  ) {
    this.key = `${RECOVERY_SETTINGS_KEY_PREFIX}.${encodeURIComponent(namespace)}`;
  }
  load(): unknown {
    const raw = (this.storage ?? optionalLocalStorage())?.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  save(value: unknown): void {
    (this.storage ?? optionalLocalStorage())?.setItem(this.key, JSON.stringify(value));
  }
}
