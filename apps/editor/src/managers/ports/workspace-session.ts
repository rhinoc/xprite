import type { VideoImportPort } from "$/managers/ports/video-import";
import type {
  EditorSessionPorts,
  SessionSource,
  SessionProject,
} from "@xprite/editor-core/session";

export interface WorkspaceSessionPorts extends EditorSessionPorts<string> {
  readonly videoImport?: VideoImportPort;
  registerAsset(url: string, name: string): SessionSource<string>;
  registerFile(file: File): SessionSource<string>;
  registerProject(name: string, load: () => Promise<SessionProject>): SessionSource<string>;
  pickFiles(): Promise<readonly SessionSource<string>[]> | null;
  bindSourceToDocument(source: string, documentKey: string): void;
  releaseDocumentHandle(documentKey: string): void;
  hydrateDocumentHandles?(documentKeys: readonly string[]): Promise<void>;
}
