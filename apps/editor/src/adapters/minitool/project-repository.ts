import { readBytes, readJson, removeBytes, writeBytes, writeJson } from "$/adapters/minitool/sdk";
import type { WorkspaceRecoveryRepository } from "$/managers/workspace/workspace-recovery";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

const CATALOG_KEY = "projects";
const PAYLOAD_PREFIX = "snapshot:";
type RecordEntry = Awaited<ReturnType<WorkspaceRecoveryRepository["list"]>>[number] & {
  head: { id: string; backend: string; checksum: string; size: number };
};

/** One container-owned catalog; immutable payloads are published only after read-back. */
export class MiniToolProjectRepository implements WorkspaceRecoveryRepository {
  private queue = Promise.resolve();
  private closed = false;

  async list(): Promise<RecordEntry[]> {
    await this.queue;
    return readJson<RecordEntry[]>(CATALOG_KEY, []);
  }

  async load(projectId: string) {
    const record = (await this.list()).find((entry) => entry.projectId === projectId);
    if (!record) return null;
    const bytes = await readBytes(PAYLOAD_PREFIX + record.head.id);
    if (
      !bytes ||
      bytes.length !== record.head.size ||
      (await sha256Hex(bytes)) !== record.head.checksum
    )
      throw new Error("项目存储损坏，请恢复其它已保存的项目。");
    return { record, bytes, recovered: false };
  }

  save(input: Parameters<WorkspaceRecoveryRepository["save"]>[0]): Promise<RecordEntry> {
    const bytes = new Uint8Array(input.bytes);
    const metadata = structuredClone(input.metadata);
    return this.mutate(async () => {
      const records = await readJson<RecordEntry[]>(CATALOG_KEY, []);
      const old = records.find((entry) => entry.projectId === input.projectId);
      if ((old?.head.id ?? null) !== input.expectedHead) throw new Error("项目已被其它操作修改。");
      const id = randomId();
      const checksum = await sha256Hex(bytes);
      const record: RecordEntry = {
        projectId: input.projectId,
        metadata,
        head: { id, backend: "minitool", checksum, size: bytes.length },
        updatedAt: Date.now(),
      };
      try {
        await writeBytes(PAYLOAD_PREFIX + id, bytes);
        const reread = await readBytes(PAYLOAD_PREFIX + id);
        if (!reread || reread.length !== bytes.length || (await sha256Hex(reread)) !== checksum)
          throw new Error("项目未能完整保存，请重试。");
        await writeJson(CATALOG_KEY, [
          ...records.filter((entry) => entry.projectId !== input.projectId),
          record,
        ]);
      } catch (error) {
        await removeBytes(PAYLOAD_PREFIX + id).catch(() => {});
        throw error;
      }
      if (old) await removeBytes(PAYLOAD_PREFIX + old.head.id).catch(() => {});
      return record;
    });
  }

  remove(projectId: string, expectedHead: string): Promise<void> {
    return this.mutate(async () => {
      const records = await readJson<RecordEntry[]>(CATALOG_KEY, []);
      const record = records.find((entry) => entry.projectId === projectId);
      if (!record) return;
      if (record.head.id !== expectedHead) throw new Error("项目已被其它操作修改。");
      await writeJson(
        CATALOG_KEY,
        records.filter((entry) => entry.projectId !== projectId),
      );
      await removeBytes(PAYLOAD_PREFIX + record.head.id).catch(() => {});
    });
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("项目存储已关闭。"));
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  close(): void {
    this.closed = true;
  }
}
