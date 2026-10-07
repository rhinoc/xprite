import {
  DEFAULT_PROJECT_DATABASE_NAME,
  IndexedDbProjectStorage,
} from "$/adapters/storage/project-storage/indexeddb";
import { OpfsPayloadStore, supportsOpfs } from "$/adapters/storage/project-storage/opfs";
import { PayloadKind, type ProjectRepositoryOptions } from "$/managers/ports/project-storage";
import { createExclusiveLock } from "@xprite/bedrock/browser/exclusive-lock";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

const DEFAULT_PROJECT_OPFS_NAMESPACE = "xse.opfs.projects.v1";

/** Capability fallback is chosen only for NEW projects; existing backend stays pinned. */
export function createBrowserProjectStorage(
  options: {
    factory?: IDBFactory;
    databaseName?: string;
    opfsNamespace?: string;
    preferOpfs?: boolean;
  } = {},
): ProjectRepositoryOptions {
  const databaseName = options.databaseName ?? DEFAULT_PROJECT_DATABASE_NAME;
  const opfsNamespace =
    options.opfsNamespace ??
    (databaseName === DEFAULT_PROJECT_DATABASE_NAME
      ? DEFAULT_PROJECT_OPFS_NAMESPACE
      : `${DEFAULT_PROJECT_OPFS_NAMESPACE}.${encodeURIComponent(databaseName)}`);
  const indexeddb = new IndexedDbProjectStorage({ factory: options.factory, databaseName });
  const opfs = supportsOpfs() ? new OpfsPayloadStore(opfsNamespace) : undefined;
  return {
    catalog: indexeddb,
    makeId: randomId,
    now: Date.now,
    checksum: sha256Hex,
    stores: { [PayloadKind.IndexedDb]: indexeddb, [PayloadKind.Opfs]: opfs },
    preferredBackend:
      options.preferOpfs !== false && opfs ? PayloadKind.Opfs : PayloadKind.IndexedDb,
    exclusive: createExclusiveLock(`xse.projects.mutation:${databaseName}`),
  };
}
