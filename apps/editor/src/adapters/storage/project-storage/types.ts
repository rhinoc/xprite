export enum PayloadKind {
  IndexedDb = "indexeddb",
  Opfs = "opfs",
}
interface ProjectMetadata {
  name: string;
  [key: string]: unknown;
}
export interface Generation {
  id: string;
  backend: PayloadKind;
  checksum: string;
  size: number;
}
export interface ProjectRecord {
  projectId: string;
  metadata: ProjectMetadata;
  head: Generation;
  previous?: Generation;
  updatedAt: number;
}
export interface SaveProject {
  projectId: string;
  expectedHead: string | null;
  bytes: Uint8Array;
  metadata: ProjectMetadata;
}
export interface LoadedProject {
  record: ProjectRecord;
  generation: Generation;
  bytes: Uint8Array;
  recovered: boolean;
}
export class ProjectStorageError extends Error {
  constructor(
    public readonly code: "unavailable" | "conflict" | "corrupt" | "io" | "closed",
    message: string,
  ) {
    super(message);
    this.name = "ProjectStorageError";
  }
}
export interface ProjectCatalog {
  get(projectId: string): Promise<ProjectRecord | null>;
  list(): Promise<ProjectRecord[]>;
  /** Atomically checks the old head and publishes the new record. */
  publish(record: ProjectRecord, expectedHead: string | null): Promise<void>;
  /** Delete only when the generation still matches; return the detached record. */
  removeRecord?(projectId: string, expectedHead: string): Promise<ProjectRecord | null>;
  close?(): void;
}
export interface PayloadStore {
  readonly kind: PayloadKind;
  write(id: string, bytes: Uint8Array): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  remove?(id: string): Promise<void>;
  close?(): void;
}
