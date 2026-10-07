import { WechatBinaryStore } from "$/adapters/storage/binary-store";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";
import {
  PayloadKind,
  ProjectStorageError,
  type ProjectCatalog,
  type ProjectRecord,
  type PayloadStore,
  type ProjectRepositoryOptions,
} from "@xprite/editor-app/host-contracts";
const CATALOG_KEY = "project-catalog";
const PAYLOAD_PREFIX = "project-payload:";
/** Native catalog/payload capabilities; the application owns repository policy. */
export function createWechatProjectStorage(store: WechatBinaryStore): ProjectRepositoryOptions {
  const list = () => store.readJson<ProjectRecord[]>(CATALOG_KEY, []);
  const catalog: ProjectCatalog = {
    list: async () => list(),
    get: async (id) => list().find((entry) => entry.projectId === id) ?? null,
    publish: async (record, expectedHead) => {
      const records = list();
      const previous = records.find((entry) => entry.projectId === record.projectId);
      if ((previous?.head.id ?? null) !== expectedHead)
        throw new ProjectStorageError("conflict", "项目已被其它操作修改。");
      store.writeJson(CATALOG_KEY, [
        ...records.filter((entry) => entry.projectId !== record.projectId),
        record,
      ]);
    },
    removeRecord: async (id, expectedHead) => {
      const records = list();
      const record = records.find((entry) => entry.projectId === id);
      if (!record) return null;
      if (record.head.id !== expectedHead)
        throw new ProjectStorageError("conflict", "项目已被其它操作修改。");
      store.writeJson(
        CATALOG_KEY,
        records.filter((entry) => entry.projectId !== id),
      );
      return record;
    },
  };
  const payload: PayloadStore = {
    kind: PayloadKind.FileSystem,
    write: async (id, bytes) => {
      if (store.read(PAYLOAD_PREFIX + id))
        throw new ProjectStorageError("conflict", "项目快照已经存在。");
      store.write(PAYLOAD_PREFIX + id, bytes);
    },
    read: async (id) => {
      const bytes = store.read(PAYLOAD_PREFIX + id);
      if (!bytes) throw new ProjectStorageError("corrupt", "项目文件不存在。");
      return bytes;
    },
    remove: async (id) => store.remove(PAYLOAD_PREFIX + id),
  };
  return {
    catalog,
    makeId: randomId,
    now: Date.now,
    checksum: sha256Hex,
    stores: { [PayloadKind.FileSystem]: payload },
    preferredBackend: PayloadKind.FileSystem,
  };
}
