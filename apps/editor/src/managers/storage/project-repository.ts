import { tUi } from "$/i18n";
import {
  ProjectStorageError,
  type PayloadKind,
  type PayloadStore,
  type SaveProject,
  type LoadedProject,
  type Generation,
  type GenerationPart,
  type ProjectRecord,
  type ProjectRepositoryOptions,
} from "$/managers/ports/project-storage";
import { ProjectBytesOwnership } from "$/managers/ports/project-storage";
import { splitSnapshotParts } from "$/managers/storage/snapshot-parts";
import { MAX_RECOVERY_BYTES } from "@xprite/editor-core/import-export";

const SHARED_PAYLOAD_PREFIX = "shared-";

function payloadKey(backend: PayloadKind, id: string): string {
  return `${backend}:${id}`;
}

function payloads(generation: Generation): readonly GenerationPart[] {
  return generation.parts ?? [generation];
}

function retainedPayloads(generations: readonly Generation[]): Set<string> {
  return new Set(
    generations.flatMap((generation) =>
      payloads(generation).map((part) => payloadKey(generation.backend, part.id)),
    ),
  );
}

/** Binary snapshots are immutable. Only a catalog transaction publishes a head. */
export class ProjectRepository {
  private closed = false;
  constructor(private readonly options: ProjectRepositoryOptions) {}

  private assertOpen() {
    if (this.closed) throw new ProjectStorageError("closed", "Project repository is closed");
  }
  private payloadId(): string {
    const id = this.options.makeId();
    return this.options.exclusive ? `${SHARED_PAYLOAD_PREFIX}${id}` : id;
  }
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.options.exclusive ? this.options.exclusive(operation) : operation();
  }
  private async protectedPayloads(generations: readonly Generation[]): Promise<Set<string>> {
    const keep = [...generations];
    if (this.options.exclusive) {
      for (const record of await this.options.catalog.list()) {
        keep.push(record.head);
        if (record.previous) keep.push(record.previous);
      }
    }
    return retainedPayloads(keep);
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
    const corrupt = () =>
      new ProjectStorageError(
        "corrupt",
        tUi("ui.project.snapshot.failed.integrity.verification", { value1: generation.id }),
      );
    if (
      !Number.isSafeInteger(generation.size) ||
      generation.size < 0 ||
      generation.size > MAX_RECOVERY_BYTES ||
      typeof generation.id !== "string" ||
      typeof generation.checksum !== "string"
    )
      throw corrupt();
    let bytes: Uint8Array;
    if (generation.parts !== undefined) {
      if (!Array.isArray(generation.parts) || !generation.parts.length) throw corrupt();
      let size = 0;
      for (const part of generation.parts) {
        if (
          !Number.isSafeInteger(part.size) ||
          part.size < 1 ||
          typeof part.id !== "string" ||
          !part.id ||
          typeof part.checksum !== "string" ||
          !part.checksum
        )
          throw corrupt();
        size += part.size;
        if (size > generation.size) throw corrupt();
      }
      if (size !== generation.size) throw corrupt();
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of generation.parts) {
        const value = await this.store(generation.backend).read(part.id);
        if (
          value.byteLength !== part.size ||
          (await this.options.checksum(value)) !== part.checksum
        )
          throw corrupt();
        bytes.set(value, offset);
        offset += value.byteLength;
      }
    } else bytes = await this.store(generation.backend).read(generation.id);
    if (
      bytes.byteLength !== generation.size ||
      (await this.options.checksum(bytes)) !== generation.checksum
    )
      throw corrupt();
    return bytes;
  }
  /** Verify stored objects against the exact encoded input without allocating
   * and hashing another complete generation. Every object is still read back,
   * size/checksum checked, and compared at its ordered input offset. */
  private async verifyReadBack(generation: Generation, expected: Uint8Array): Promise<void> {
    const corrupt = () =>
      new ProjectStorageError(
        "corrupt",
        tUi("ui.project.snapshot.failed.integrity.verification", { value1: generation.id }),
      );
    let offset = 0;
    for (const part of payloads(generation)) {
      const actual = await this.store(generation.backend).read(part.id);
      if (
        actual.byteLength !== part.size ||
        offset + actual.byteLength > expected.byteLength ||
        (await this.options.checksum(actual)) !== part.checksum
      )
        throw corrupt();
      for (let index = 0; index < actual.byteLength; index++) {
        if (actual[index] !== expected[offset + index]) throw corrupt();
      }
      offset += actual.byteLength;
    }
    if (offset !== expected.byteLength) throw corrupt();
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
    // Mutable callers retain copy isolation; codec output can be borrowed without
    // duplicating the complete envelope. Neither path transfers its buffer.
    const bytes =
      input.bytesOwnership === ProjectBytesOwnership.Immutable
        ? input.bytes
        : new Uint8Array(input.bytes);
    if (bytes.byteLength > MAX_RECOVERY_BYTES)
      throw new RangeError("Project snapshot exceeds the supported storage size");
    const metadata = structuredClone(input.metadata);
    const owned = { ...input, bytes, metadata };
    return this.mutate(() => this.saveOwned(owned));
  }
  private async saveOwned(input: SaveProject): Promise<ProjectRecord> {
    this.assertOpen();
    const { bytes, metadata } = input;
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
      if (!valid || valid.record.head.id !== input.expectedHead)
        throw new ProjectStorageError(
          "conflict",
          "The project changed while preparing its snapshot",
        );
      previous = valid.generation;
    }
    const backend = old?.head.backend ?? this.options.preferredBackend;
    const candidates: Generation[] = previous?.backend === backend ? [previous] : [];
    if (
      this.options.exclusive &&
      input.reuseFromProjectId &&
      input.reuseFromProjectId !== input.projectId
    ) {
      const source = await this.load(input.reuseFromProjectId);
      if (source?.generation.backend === backend) candidates.push(source.generation);
    }
    const head: Generation = {
      id: this.payloadId(),
      backend,
      size: bytes.byteLength,
      checksum: await this.options.checksum(bytes),
    };
    const identical = candidates.find(
      (generation) =>
        head.size > 0 &&
        generation.size === head.size &&
        generation.checksum === head.checksum &&
        (!this.options.exclusive ||
          payloads(generation).every((part) => part.id.startsWith(SHARED_PAYLOAD_PREFIX))),
    );
    const parts = splitSnapshotParts(bytes);
    const written: GenerationPart[] = [];
    const record: ProjectRecord = {
      projectId: input.projectId,
      metadata,
      head,
      previous,
      updatedAt: this.options.now(),
    };
    try {
      if (identical) {
        // Metadata gets a new CAS token, while identical content keeps its bytes.
        head.parts = payloads(identical).map(({ id, size, checksum }) => ({ id, size, checksum }));
      } else if (parts.length === 1) {
        await this.store(backend).write(head.id, bytes);
        written.push(head);
      } else {
        // Cross-project reuse is permitted only while holding the shared catalog
        // lock. Unlocked writers never publish references to another project's data.
        const reusable = new Map<string, GenerationPart>(
          candidates
            .flatMap((generation) => payloads(generation))
            .filter((part) => !this.options.exclusive || part.id.startsWith(SHARED_PAYLOAD_PREFIX))
            .map((part) => [`${part.size}:${part.checksum}`, part] as const),
        );
        const references: GenerationPart[] = [];
        for (const value of parts) {
          const digest = await this.options.checksum(value);
          const key = `${value.byteLength}:${digest}`;
          let part = reusable.get(key);
          if (!part) {
            part = {
              id: this.payloadId(),
              size: value.byteLength,
              checksum: digest,
            };
            await this.store(backend).write(part.id, value);
            written.push(part);
            reusable.set(key, part);
          }
          references.push(part);
        }
        head.parts = references;
      }
      // Read-back catches truncated writes before publication.
      await this.verifyReadBack(head, bytes);
      await this.options.catalog.publish(record, input.expectedHead);
    } catch (error) {
      // This generation was successfully created by this writer and never
      // published. Never remove on write failure (it could be an ID collision).
      for (const part of written) await this.discard({ ...part, backend });
      throw error;
    }
    try {
      const retained = await this.protectedPayloads(previous ? [head, previous] : [head]);
      if (old?.previous && old.previous.id !== previous?.id)
        await this.discard(old.previous, retained);
      if (old && old.head.id !== previous?.id) await this.discard(old.head, retained);
    } catch {
      // Publication succeeded. A failed garbage-collection scan must not make
      // the coordinator retry a durable save using an obsolete head token.
    }
    return record;
  }
  async remove(projectId: string, expectedHead: string): Promise<void> {
    this.assertOpen();
    return this.mutate(() => this.removeOwned(projectId, expectedHead));
  }
  private async removeOwned(projectId: string, expectedHead: string): Promise<void> {
    this.assertOpen();
    if (!this.options.catalog.removeRecord)
      throw new ProjectStorageError("unavailable", "Project removal is unavailable");
    const removed = await this.options.catalog.removeRecord(projectId, expectedHead);
    // Shared objects remain live until no catalog head or predecessor uses them.
    if (removed) {
      try {
        const retained = await this.protectedPayloads([]);
        await this.discard(removed.head, retained);
        for (const key of retainedPayloads([removed.head])) retained.add(key);
        if (removed.previous) await this.discard(removed.previous, retained);
      } catch {
        // Catalog deletion succeeded; retain uncertain payloads for safety.
      }
    }
  }
  private async discard(generation: Generation, retained = new Set<string>()): Promise<void> {
    const visited = new Set<string>();
    for (const part of payloads(generation)) {
      // A context without a shared catalog lock cannot safely collect shared payloads.
      // Its newly written, independent payloads retain the normal cleanup policy.
      if (!this.options.exclusive && part.id.startsWith(SHARED_PAYLOAD_PREFIX)) continue;
      if (retained.has(payloadKey(generation.backend, part.id)) || visited.has(part.id)) continue;
      visited.add(part.id);
      try {
        await this.store(generation.backend).remove?.(part.id);
      } catch {
        /* Publication already succeeded; cleanup is best effort. */
      }
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.options.catalog.close?.();
    for (const store of Object.values(this.options.stores)) store?.close?.();
  }
}
