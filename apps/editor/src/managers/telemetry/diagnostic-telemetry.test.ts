import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { DiagnosticSource, type DiagnosticRecord } from "$/managers/ports/diagnostics";
import { telemetryDiagnosticDetails } from "$/managers/telemetry/diagnostic-telemetry";

function record(details: DiagnosticRecord["details"]): DiagnosticRecord {
  return {
    id: "diagnostic",
    timestamp: 0,
    source: DiagnosticSource.ServiceWorker,
    name: "Error",
    message: "Failed",
    details,
  };
}

describe("diagnostic telemetry privacy", () => {
  it("reports actionable PWA and permission context without forwarding files or arbitrary fields", () => {
    assert.deepEqual(
      telemetryDiagnosticDetails(
        record({
          pwa: {
            stage: "status",
            failure: "timeout",
            worker_state: "activated",
            controller_state: null,
            elapsed_ms: 15000,
            attempt: 2,
            register_native: false,
            worker_version: "release_123",
            script_url: "https://example.test/sw.js?secret=1",
            file_name: "private.aseprite",
          },
          fileWrite: {
            stage: "permission",
            permission: "denied",
            user_activation: true,
            fileName: "private.aseprite",
          },
          aseprite: { bytes: [1, 2, 3] },
        }),
      ),
      {
        pwa_stage: "status",
        pwa_failure: "timeout",
        pwa_worker_state: "activated",
        pwa_controller_state: null,
        pwa_elapsed_ms: 15000,
        pwa_attempt: 2,
        pwa_register_native: false,
        pwa_worker_version: "release_123",
        file_write_stage: "permission",
        file_write_permission: "denied",
        file_write_user_activation: true,
      },
    );
  });

  it("rejects unbounded, invalid and private values even under known keys", () => {
    assert.deepEqual(
      telemetryDiagnosticDetails(
        record({
          pwa: {
            stage: "status",
            failure: "private.aseprite",
            worker_state: "file:///Users/private",
            timeout_ms: Infinity,
            elapsed_ms: -1,
            attempt: "2",
            visible: "true",
            worker_version: "https://example.test/?secret=1",
          },
          fileWrite: { stage: "private.aseprite", permission: "denied" },
        }),
      ),
      { pwa_stage: "status" },
    );
  });
});
