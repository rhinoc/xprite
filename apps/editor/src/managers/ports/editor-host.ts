import type { DiagnosticsPort } from "$/managers/ports/diagnostics";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import type { WorkspaceSessionPorts } from "$/managers/workspace/document-workspace";
import type {
  WorkspaceRecoveryCodec,
  WorkspaceRecoveryRepository,
} from "$/managers/workspace/workspace-recovery";

export interface EditorHostPorts {
  platform: EditorPlatformPorts;
  createSessions(): WorkspaceSessionPorts;
  createRepository(): WorkspaceRecoveryRepository;
  createCodec(): WorkspaceRecoveryCodec;
}

export type EditorHostFactory = (diagnostics: DiagnosticsPort) => EditorHostPorts;
