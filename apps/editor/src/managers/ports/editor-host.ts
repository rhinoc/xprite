import type { DiagnosticsPort } from "$/managers/ports/diagnostics";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import type { ProjectRepositoryOptions } from "$/managers/ports/project-storage";
import type { ShareLimits } from "$/managers/ports/sharing";
import type { WorkspaceRecoveryCodec } from "$/managers/ports/workspace-recovery";
import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import type { SessionProject } from "@xprite/editor-core/session";

export interface EditorInitialProject {
  name: string;
  project: SessionProject;
}

export interface EditorHostPorts {
  platform: EditorPlatformPorts;
  createSessions(): WorkspaceSessionPorts;
  createProjectStorage(): ProjectRepositoryOptions;
  createCodec(): WorkspaceRecoveryCodec;
  takeInitialProject?(shareLimits: ShareLimits): Promise<EditorInitialProject | null> | null;
  /** A recent project id the page was asked to open, e.g. from the Files window. */
  takeInitialRecent?(): string | null;
}

export type EditorHostFactory = (diagnostics: DiagnosticsPort) => EditorHostPorts;
