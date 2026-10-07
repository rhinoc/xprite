/** Persistence consumers may borrow detached bytes retained unchanged by the caller. */
export enum ProjectBytesOwnership {
  Copy = "copy",
  Immutable = "immutable",
}

export enum PayloadKind {
  IndexedDb = "indexeddb",
  Opfs = "opfs",
  FileSystem = "filesystem",
  MiniTool = "minitool",
}
interface ProjectMetadata {
  name: string;
  [key: string]: unknown;
}
export interface GenerationPart {
  id: string;
  checksum: string;
  size: number;
}
export interface Generation extends GenerationPart {
  backend: PayloadKind;
  /** A large snapshot is assembled from immutable, independently verified objects. */
  parts?: readonly GenerationPart[];
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
  /** Immutable bytes remain caller-owned and must not be changed until save resolves. */
  bytesOwnership?: ProjectBytesOwnership;
  metadata: ProjectMetadata;
  /** A checkpoint may reuse verified payloads from its source project. */
  reuseFromProjectId?: string;
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

/** The host owns cryptography, IDs, time, and serialization capabilities. */
export interface ProjectRepositoryOptions {
  catalog: ProjectCatalog;
  stores: Partial<Record<PayloadKind, PayloadStore>>;
  preferredBackend: PayloadKind;
  makeId: () => string;
  now: () => number;
  checksum: (bytes: Uint8Array) => Promise<string>;
  /** Must serialize mutations across every context using this catalog. */
  exclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
}
