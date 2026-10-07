import type { ReplayStoragePort, StoredReplay } from "$/managers/ports/replay-storage";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

const DATABASE_NAME = "xse.idb.replays.v1";
const RECORDS_STORE = "projects";
const SEGMENTS_STORE = "segments";

interface ReplayRecord {
  projectId: string;
  head: number;
  count: number;
  enabled: boolean;
}

export class BrowserReplayStorage implements ReplayStoragePort {
  private readonly database = new IndexedDbDatabase({
    databaseName: DATABASE_NAME,
    stores: [{ name: RECORDS_STORE, options: { keyPath: "projectId" } }, { name: SEGMENTS_STORE }],
  });

  load(projectId: string): Promise<StoredReplay | null> {
    return this.database.withConnection(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction([RECORDS_STORE, SEGMENTS_STORE], "readonly");
          const request = tx.objectStore(RECORDS_STORE).get(projectId);
          let result: StoredReplay | null = null;
          request.onsuccess = () => {
            const record: ReplayRecord | undefined = request.result;
            if (!record) return;
            result = { head: record.head, enabled: record.enabled, segments: [] };
            for (let index = 0; index < record.count; index++) {
              const segment = tx.objectStore(SEGMENTS_STORE).get([projectId, index]);
              segment.onsuccess = () => {
                if (!(segment.result instanceof Uint8Array)) {
                  tx.abort();
                  return;
                }
                result!.segments[index] = segment.result;
              };
            }
          };
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(tx.error ?? new Error("Unable to load the project replay."));
        }),
    );
  }

  append(
    projectId: string,
    expectedHead: number,
    segment: Uint8Array | null,
    enabled: boolean,
  ): Promise<number> {
    return this.database.withConnection(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction([RECORDS_STORE, SEGMENTS_STORE], "readwrite");
          const records = tx.objectStore(RECORDS_STORE);
          const request = records.get(projectId);
          let head = expectedHead;
          let conflict = false;
          request.onsuccess = () => {
            const previous: ReplayRecord | undefined = request.result;
            if ((previous?.head ?? 0) !== expectedHead) {
              conflict = true;
              tx.abort();
              return;
            }
            head++;
            const count = previous?.count ?? 0;
            if (segment) tx.objectStore(SEGMENTS_STORE).add(segment, [projectId, count]);
            records.put({
              projectId,
              head,
              enabled,
              count: count + (segment ? 1 : 0),
            } satisfies ReplayRecord);
          };
          tx.oncomplete = () => resolve(head);
          tx.onabort = () =>
            reject(
              new Error(
                conflict
                  ? "This project replay changed in another page. Export the current replay before reloading."
                  : "Unable to save the project replay. Free browser storage, then retry saving.",
              ),
            );
        }),
    );
  }

  fork(sourceProjectId: string, projectId: string): Promise<void> {
    return this.database.withConnection(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction([RECORDS_STORE, SEGMENTS_STORE], "readwrite");
          const records = tx.objectStore(RECORDS_STORE);
          const target = records.get(projectId);
          target.onsuccess = () => {
            if (target.result) return;
            const request = records.get(sourceProjectId);
            request.onsuccess = () => {
              const source: ReplayRecord | undefined = request.result;
              if (!source) return;
              records.add({ ...source, projectId });
              for (let index = 0; index < source.count; index++) {
                const segment = tx.objectStore(SEGMENTS_STORE).get([sourceProjectId, index]);
                segment.onsuccess = () => {
                  if (!(segment.result instanceof Uint8Array)) {
                    tx.abort();
                    return;
                  }
                  tx.objectStore(SEGMENTS_STORE).add(segment.result, [projectId, index]);
                };
              }
            };
          };
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error("Unable to copy the project replay."));
        }),
    );
  }

  remove(projectIds: readonly string[]): Promise<void> {
    return this.database.withConnection(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction([RECORDS_STORE, SEGMENTS_STORE], "readwrite");
          for (const projectId of projectIds) {
            tx.objectStore(RECORDS_STORE).delete(projectId);
            tx.objectStore(SEGMENTS_STORE).delete(
              IDBKeyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]),
            );
          }
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error("Unable to delete the project replay."));
        }),
    );
  }
}
