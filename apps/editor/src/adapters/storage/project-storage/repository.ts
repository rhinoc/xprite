import {
  ProjectStorageError,
  type PayloadKind,
  type PayloadStore,
  type ProjectCatalog,
  type SaveProject,
  type LoadedProject,
  type Generation,
  type ProjectRecord,
} from "$/adapters/storage/project-storage/types";
import { tUi } from "$/i18n";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

export interface ProjectRepositoryOptions {
  catalog: ProjectCatalog;
  stores: Partial<Record<PayloadKind, PayloadStore>>;
  preferredBackend: PayloadKind;
  makeId?: () => string;
  now?: () => number;
}

/** A checksum guards incomplete or damaged bytes; it is not a security signature. */
async function checksum(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}

/** Binary snapshots are immutable. Only a catalog transaction publishes a head. */
export class ProjectRepository {
  private closed = false;
  constructor(private readonly options: ProjectRepositoryOptions) {}

  private assertOpen() {
    if (this.closed) throw new ProjectStorageError("closed", "Project repository is closed");
  }
  private store(kind: PayloadKind): PayloadStore {
    const result = this.options.stores[kind];
    if (!result)
      throw new ProjectStorageError(
        "unavailable",
        tUi("ui.project.storage.is.unavailable", { value1: kind }),
      );
    return result;
  }
  async list(): Promise<ProjectRecord[]> {
    this.assertOpen();
    return this.options.catalog.list();
  }
  private async read(generation: Generation): Promise<Uint8Array> {
    const bytes = await this.store(generation.backend).read(generation.id);
    if (bytes.byteLength !== generation.size || (await checksum(bytes)) !== generation.checksum)
      throw new ProjectStorageError(
        "corrupt",
        tUi("ui.project.snapshot.failed.integrity.verification", { value1: generation.id }),
      );
    return bytes;
  }
  async load(projectId: string): Promise<LoadedProject | null> {
    this.assertOpen();
    const record = await this.options.catalog.get(projectId);
    if (!record) return null;
    return this.loadRecord(record, true);
  }
  private async loadRecord(record: ProjectRecord, retry: boolean): Promise<LoadedProject> {
    try {
      return {
        record,
        generation: record.head,
        bytes: await this.read(record.head),
        recovered: false,
      };
    } catch (error) {
      // Permission, quota and worker failures must surface, not masquerade as corruption.
      if (!(error instanceof ProjectStorageError && error.code === "corrupt")) throw error;
      // A concurrent successful save may have collected the generation this
      // read started with. Refresh once before deciding that bytes are damaged.
      if (retry) {
        const latest = await this.options.catalog.get(record.projectId);
        if (latest && latest.head.id !== record.head.id) return this.loadRecord(latest, false);
      }
      if (!record.previous) throw error;
      try {
        return {
          record,
          generation: record.previous,
          bytes: await this.read(record.previous),
          recovered: true,
        };
      } catch (previousError) {
        if (
          retry &&
          previousError instanceof ProjectStorageError &&
          previousError.code === "corrupt"
        ) {
          const latest = await this.options.catalog.get(record.projectId);
          if (latest && latest.head.id !== record.head.id) return this.loadRecord(latest, false);
        }
        throw previousError;
      }
    }
  }
  async save(input: SaveProject): Promise<ProjectRecord> {
    this.assertOpen();
    if (!input.projectId || !input.metadata.name)
      throw new TypeError("Project ID and name are required");
    // Own input before yielding so callers can safely continue painting.
    const bytes = new Uint8Array(input.bytes);
    const metadata = structuredClone(input.metadata);
    const old = await this.options.catalog.get(input.projectId);
    if ((old?.head.id ?? null) !== input.expectedHead)
      throw new ProjectStorageError(
        "conflict",
        "A newer project snapshot exists in another writer",
      );
    let previous = old?.head;
    if (old) {
      // A recovery save retains the last verified generation, not the damaged head.
      const valid = await this.load(input.projectId);
      previous = valid!.generation;
    }
    const backend = old?.head.backend ?? this.options.preferredBackend;
    const head: Generation = {
      id: (this.options.makeId ?? randomId)(),
      backend,
      size: bytes.byteLength,
      checksum: await checksum(bytes),
    };
    await this.store(backend).write(head.id, bytes);
    const record: ProjectRecord = {
      projectId: input.projectId,
      metadata,
      head,
      previous,
      updatedAt: (this.options.now ?? Date.now)(),
    };
    try {
      // Read-back catches truncated writes before publication.
      await this.read(head);
      await this.options.catalog.publish(record, input.expectedHead);
    } catch (error) {
      // This generation was successfully created by this writer and never
      // published. Never remove on write failure (it could be an ID collision).
      await this.discard(head);
      throw error;
    }
    if (old?.previous && old.previous.id !== previous?.id) await this.discard(old.previous);
    if (old && old.head.id !== previous?.id) await this.discard(old.head);
    return record;
  }
  async remove(projectId: string, expectedHead: string): Promise<void> {
    this.assertOpen();
    if (!this.options.catalog.removeRecord)
      throw new ProjectStorageError("unavailable", "Project removal is unavailable");
    const removed = await this.options.catalog.removeRecord(projectId, expectedHead);
    // IDs identify immutable payloads. A later recreation cannot refer to these
    // generations through save(), so cleanup cannot delete another writer's head.
    if (removed) {
      await this.discard(removed.head);
      if (removed.previous) await this.discard(removed.previous);
    }
  }
  private async discard(generation: Generation): Promise<void> {
    try {
      await this.store(generation.backend).remove?.(generation.id);
    } catch {
      /* Publication already succeeded; cleanup is best effort. */
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.options.catalog.close?.();
    for (const store of Object.values(this.options.stores)) store?.close?.();
  }
}
