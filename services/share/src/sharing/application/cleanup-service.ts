import { CleanupMode } from "$/sharing/domain/model";
import { CLEANUP_BATCH_SIZE, RETIRED_RECORD_LIFETIME_MS } from "$/sharing/domain/policy";
import type { ShareObjectStore } from "$/sharing/ports/object-store";
import type { ShareRepository } from "$/sharing/ports/repository";
import type { ShareRuntime } from "$/sharing/ports/runtime";

export interface CleanupResult {
  completed: number;
  failed: number;
}

export class CleanupService {
  constructor(
    private readonly repository: ShareRepository,
    private readonly objects: ShareObjectStore,
    private readonly runtime: ShareRuntime,
  ) {}

  async run(): Promise<CleanupResult> {
    const now = this.runtime.now();
    await this.repository.retireExpired(now, CLEANUP_BATCH_SIZE);
    const records = await this.repository.pendingCleanup(now, CLEANUP_BATCH_SIZE);
    const result: CleanupResult = { completed: 0, failed: 0 };
    // Sequential bounded work keeps subrequests below the free Worker limit.
    for (const record of records) {
      try {
        if (record.cleanupMode === CleanupMode.Fence) await this.objects.fence(record.id);
        else await this.objects.delete(record.id);
        await this.repository.acknowledgeCleanup(record.id, this.runtime.now());
        result.completed++;
      } catch {
        await this.repository.retryCleanup(record.id, this.runtime.now());
        result.failed++;
      }
    }
    await this.repository.purgeRetired(now - RETIRED_RECORD_LIFETIME_MS, CLEANUP_BATCH_SIZE);
    return result;
  }
}
