import { createBrowserEditorPlatformPorts } from "$/adapters/platform/browser-editor-platform";
import { BrowserSessionPorts } from "$/adapters/session/browser-session-ports";
import { DEFAULT_FILE_HANDLES_DATABASE_NAME } from "$/adapters/storage/indexeddb/file-handles";
import { DEFAULT_RECENT_DATABASE_NAME } from "$/adapters/storage/indexeddb/recents";
import { createBrowserProjectRepository } from "$/adapters/storage/project-storage";
import { DEFAULT_PROJECT_DATABASE_NAME } from "$/adapters/storage/project-storage/indexeddb";
import { RecoveryCodecClient } from "$/adapters/workers/recovery-codec-client";
import { DiagnosticSource } from "$/managers/ports/diagnostics";
import type { EditorHostFactory } from "$/managers/ports/editor-host";

export const createBrowserEditorHostPorts: EditorHostFactory = (diagnostics) => ({
  platform: createBrowserEditorPlatformPorts(),
  createSessions: () =>
    new BrowserSessionPorts({
      databaseName: DEFAULT_RECENT_DATABASE_NAME,
      fileHandleDatabaseName: DEFAULT_FILE_HANDLES_DATABASE_NAME,
      diagnostics,
    }),
  createRepository: () =>
    createBrowserProjectRepository({ databaseName: DEFAULT_PROJECT_DATABASE_NAME }),
  createCodec: () =>
    new RecoveryCodecClient({
      onFatalError: (error) => diagnostics.capture(error, DiagnosticSource.RecoveryWorker),
    }),
});
