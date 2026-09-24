import {
  DEFAULT_PROJECT_DATABASE_NAME,
  IndexedDbProjectStorage,
} from "$/adapters/storage/project-storage/indexeddb";
import { OpfsPayloadStore, supportsOpfs } from "$/adapters/storage/project-storage/opfs";
import { ProjectRepository } from "$/adapters/storage/project-storage/repository";
import { PayloadKind } from "$/adapters/storage/project-storage/types";

const DEFAULT_PROJECT_OPFS_NAMESPACE = "xse.opfs.projects.v1";

export * from "$/adapters/storage/project-storage/types";
export { ProjectRepository } from "$/adapters/storage/project-storage/repository";

/** Capability fallback is chosen only for NEW projects; existing backend stays pinned. */
export function createBrowserProjectRepository(
  options: {
    factory?: IDBFactory;
    databaseName?: string;
    opfsNamespace?: string;
    preferOpfs?: boolean;
  } = {},
): ProjectRepository {
  const databaseName = options.databaseName ?? DEFAULT_PROJECT_DATABASE_NAME;
  const opfsNamespace =
    options.opfsNamespace ??
    (databaseName === DEFAULT_PROJECT_DATABASE_NAME
      ? DEFAULT_PROJECT_OPFS_NAMESPACE
      : `${DEFAULT_PROJECT_OPFS_NAMESPACE}.${encodeURIComponent(databaseName)}`);
  const indexeddb = new IndexedDbProjectStorage({ factory: options.factory, databaseName });
  const opfs = supportsOpfs() ? new OpfsPayloadStore(opfsNamespace) : undefined;
  return new ProjectRepository({
    catalog: indexeddb,
    stores: { [PayloadKind.IndexedDb]: indexeddb, [PayloadKind.Opfs]: opfs },
    preferredBackend:
      options.preferOpfs !== false && opfs ? PayloadKind.Opfs : PayloadKind.IndexedDb,
  });
}
