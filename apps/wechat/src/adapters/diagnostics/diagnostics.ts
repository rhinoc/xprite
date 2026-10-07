import { randomId } from "@xprite/bedrock/browser/runtime-crypto";
import type { DiagnosticRecord, DiagnosticsPort } from "@xprite/editor-app/host-contracts";

const MAX_RECORDS = 200;
export function createWechatDiagnostics(): DiagnosticsPort {
  let records: DiagnosticRecord[] = [];
  return {
    capture: (reason, source, details) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      records = [
        ...records,
        {
          id: randomId(),
          timestamp: Date.now(),
          source,
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...details,
        },
      ].slice(-MAX_RECORDS);
      console.error("Xprite WeChat", source, error);
    },
    recordWorkspaceEvent: () => {},
    setWorkspaceSnapshotProvider: () => {},
    getRuntimeCapabilities: () => ({
      openFilePicker: false,
      saveFilePicker: false,
      opfs: false,
      indexedDb: false,
      workers: false,
      compressionStream: false,
      offscreenCanvas: true,
      imageBitmap: false,
    }),
    getRecent: async () => records,
    clear: async () => {
      records = [];
    },
    readReport: async () => JSON.stringify(records, null, 2),
    exportLogs: async () => {
      const path = `${wx.env.USER_DATA_PATH}/xprite-diagnostics.json`;
      wx.getFileSystemManager().writeFileSync(path, JSON.stringify(records, null, 2), "utf8");
      return records.length;
    },
  };
}
