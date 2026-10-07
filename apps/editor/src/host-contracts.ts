/** Host capabilities are independent of application mounting and browser I/O. */
export type { EditorHostFactory, EditorHostPorts } from "$/managers/ports/editor-host";
export type { DiagnosticsPort, DiagnosticRecord } from "$/managers/ports/diagnostics";
export type { EditorPlatformPorts } from "$/managers/ports/platform";
export type { WorkspaceRecoveryRepository } from "$/managers/ports/workspace-recovery";
export type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
export {
  PayloadKind,
  ProjectBytesOwnership,
  ProjectStorageError,
  type ProjectCatalog,
  type PayloadStore,
  type ProjectRecord,
  type ProjectRepositoryOptions,
} from "$/managers/ports/project-storage";
