import {
  MiniToolStorageIntegrityError,
  readBytes,
  readJson,
  removeBytes,
  writeBytes,
  writeJson,
} from "$/adapters/minitool/sdk";
import {
  PayloadKind,
  ProjectStorageError,
  type PayloadStore,
  type ProjectCatalog,
  type ProjectRecord,
  type ProjectRepositoryOptions,
} from "$/managers/ports/project-storage";
import { createExclusiveLock } from "@xprite/bedrock/browser/exclusive-lock";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

const CATALOG_KEY = "projects";
const PAYLOAD_PREFIX = "snapshot:";
const CATALOG_LOCK = "xse.minitool.projects.mutation";

// All adapters in one container share the SDK catalog and must serialize its
// read/modify/write operations, including when Web Locks are unavailable.
let storageTail = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation);
  storageTail = result.then(
    () => {},
    () => {},
  );
  return result;
}

/** SDK I/O only; publication, verification and retention belong to the repository. */
class MiniToolProjectStorage implements ProjectCatalog, PayloadStore {
  readonly kind = PayloadKind.MiniTool;
  private closed = false;

  private assertOpen(): void {
    if (this.closed) throw new ProjectStorageError("closed", "项目存储已关闭。");
  }

  async list(): Promise<ProjectRecord[]> {
    this.assertOpen();
    return serialize(() => readJson<ProjectRecord[]>(CATALOG_KEY, []));
  }

  async get(projectId: string): Promise<ProjectRecord | null> {
    return (await this.list()).find((entry) => entry.projectId === projectId) ?? null;
  }

  async publish(record: ProjectRecord, expectedHead: string | null): Promise<void> {
    this.assertOpen();
    return serialize(async () => {
      this.assertOpen();
      const records = await readJson<ProjectRecord[]>(CATALOG_KEY, []);
      const old = records.find((entry) => entry.projectId === record.projectId);
      if ((old?.head.id ?? null) !== expectedHead)
        throw new ProjectStorageError("conflict", "项目已被其它操作修改。");
      await writeJson(CATALOG_KEY, [
        ...records.filter((entry) => entry.projectId !== record.projectId),
        record,
      ]);
    });
  }

  async removeRecord(projectId: string, expectedHead: string): Promise<ProjectRecord | null> {
    this.assertOpen();
    return serialize(async () => {
      this.assertOpen();
      const records = await readJson<ProjectRecord[]>(CATALOG_KEY, []);
      const record = records.find((entry) => entry.projectId === projectId);
      if (!record) return null;
      if (record.head.id !== expectedHead)
        throw new ProjectStorageError("conflict", "项目已被其它操作修改。");
      await writeJson(
        CATALOG_KEY,
        records.filter((entry) => entry.projectId !== projectId),
      );
      return record;
    });
  }

  async read(id: string): Promise<Uint8Array> {
    this.assertOpen();
    try {
      const bytes = await readBytes(PAYLOAD_PREFIX + id);
      if (!bytes) throw new ProjectStorageError("corrupt", "项目快照不存在。");
      return bytes;
    } catch (error) {
      if (error instanceof MiniToolStorageIntegrityError)
        throw new ProjectStorageError("corrupt", error.message);
      throw error;
    }
  }

  async write(id: string, bytes: Uint8Array): Promise<void> {
    this.assertOpen();
    return serialize(async () => {
      this.assertOpen();
      if (await readBytes(PAYLOAD_PREFIX + id))
        throw new ProjectStorageError("conflict", "项目快照已经存在。");
      await writeBytes(PAYLOAD_PREFIX + id, bytes);
    });
  }

  async remove(id: string): Promise<void> {
    this.assertOpen();
    return serialize(() => removeBytes(PAYLOAD_PREFIX + id));
  }

  close(): void {
    this.closed = true;
  }
}

export function createMiniToolProjectStorage(): ProjectRepositoryOptions {
  const storage = new MiniToolProjectStorage();
  return {
    catalog: storage,
    stores: { [PayloadKind.MiniTool]: storage },
    preferredBackend: PayloadKind.MiniTool,
    makeId: randomId,
    now: Date.now,
    checksum: sha256Hex,
    exclusive: createExclusiveLock(CATALOG_LOCK),
  };
}
