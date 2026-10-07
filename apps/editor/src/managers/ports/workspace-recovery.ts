import type { ProjectBytesOwnership } from "$/managers/ports/project-storage";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";

interface WorkspaceRecoveryProjectRecord {
  projectId: string;
  metadata: Record<string, unknown> & { name: string };
  head: { id: string; backend?: string };
  updatedAt: number;
}
interface WorkspaceRecoveryLoadedProject {
  record: WorkspaceRecoveryProjectRecord;
  bytes: Uint8Array;
  recovered: boolean;
}
export interface WorkspaceRecoveryRepository {
  load(projectId: string): Promise<WorkspaceRecoveryLoadedProject | null>;
  save(input: {
    projectId: string;
    expectedHead: string | null;
    bytes: Uint8Array;
    bytesOwnership?: ProjectBytesOwnership;
    metadata: Record<string, unknown> & { name: string };
    reuseFromProjectId?: string;
  }): Promise<WorkspaceRecoveryProjectRecord>;
  list(): Promise<WorkspaceRecoveryProjectRecord[]>;
  close(): void;
  remove?(projectId: string, expectedHead: string): Promise<void>;
}
export interface WorkspaceRecoveryCodec {
  encode(snapshot: EditorPersistenceSnapshot): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<EditorPersistenceSnapshot>;
  close(): void;
}
