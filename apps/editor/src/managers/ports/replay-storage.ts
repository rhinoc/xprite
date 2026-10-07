export interface StoredReplay {
  head: number;
  enabled: boolean;
  segments: Uint8Array[];
}

/** Append a durable segment and publish its head in the same transaction.
 * A stale head must fail; concurrent pages cannot overwrite each other's work. */
export interface ReplayStoragePort {
  load(projectId: string): Promise<StoredReplay | null>;
  append(
    projectId: string,
    expectedHead: number,
    segment: Uint8Array | null,
    enabled: boolean,
  ): Promise<number>;
  fork(sourceProjectId: string, projectId: string): Promise<void>;
  remove(projectIds: readonly string[]): Promise<void>;
}
