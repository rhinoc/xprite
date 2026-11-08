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
  it("reports OPFS transport context without forwarding paths, messages or request data", () => {
    assert.deepEqual(
      telemetryDiagnosticDetails(
        record({
          opfs: {
            stage: "error",
            operation: "read",
            workerAnswered: false,
            line: 12,
            column: 3,
            requestId: 42,
            filename: "https://example.test/assets/opfs-worker.js?token=secret",
            message: "Cannot read /Users/private/artwork.aseprite",
            key: "private-project-id",
            namespace: "private-workspace",
            bytes: [1, 2, 3],
            stack: "at /Users/private/artwork.aseprite:12:3",
            cause: { message: "private artwork" },
          },
        }),
      ),
      {
        opfs_stage: "error",
        opfs_operation: "read",
        opfs_worker_answered: false,
        opfs_line: 12,
        opfs_column: 3,
      },
    );
  });

  it.each(["construction", "post-message", "error", "messageerror"])(
    "allows the OPFS %s stage for each storage operation",
    (stage) => {
      for (const operation of ["read", "write", "remove"])
        assert.deepEqual(
          telemetryDiagnosticDetails(record({ opfs: { stage, operation, workerAnswered: true } })),
          { opfs_stage: stage, opfs_operation: operation, opfs_worker_answered: true },
        );
    },
  );

  it("requires a known OPFS stage before forwarding any context", () => {
    for (const stage of [undefined, null, "", "private.aseprite", 1, {}, ["error"]])
      assert.deepEqual(
        telemetryDiagnosticDetails(
          record({
            opfs: { stage, operation: "read", workerAnswered: false, line: 12, column: 3 },
          }),
        ),
        {},
      );
    for (const opfs of [undefined, null, "error", 1, true, [], [{ stage: "error" }]])
      assert.deepEqual(telemetryDiagnosticDetails(record({ opfs })), {});
  });

  it("rejects invalid OPFS field values and unbounded source positions", () => {
    for (const value of [undefined, "12", true, {}, [], -1, 1.5, NaN, Infinity, 86_400_001])
      assert.deepEqual(
        telemetryDiagnosticDetails(
          record({
            opfs: {
              stage: "error",
              operation: "private.aseprite",
              workerAnswered: "false",
              line: value,
              column: value,
            },
          }),
        ),
        { opfs_stage: "error" },
      );
    assert.deepEqual(
      telemetryDiagnosticDetails(record({ opfs: { stage: "error", line: 0, column: 86_400_000 } })),
      { opfs_stage: "error", opfs_line: 0, opfs_column: 86_400_000 },
    );
  });

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

  it("forwards only bounded same-site chunk and worker context", () => {
    assert.deepEqual(
      telemetryDiagnosticDetails(
        record({
          pwa: {
            stage: "chunk",
            failure: "chunk-load",
            controlled: true,
            chunk_in_worker_build: false,
            controller_state: "activated",
            script_path: "/sw.js",
            chunk: "/assets/animation-preview-C439ED4q.js",
            worker_version: "abc123",
            status: 404,
          },
        }),
      ),
      {
        pwa_stage: "chunk",
        pwa_failure: "chunk-load",
        pwa_controller_state: "activated",
        pwa_controlled: true,
        pwa_chunk_in_worker_build: false,
        pwa_status: 404,
        pwa_worker_version: "abc123",
        pwa_script_path: "/sw.js",
        pwa_chunk: "/assets/animation-preview-C439ED4q.js",
      },
    );
    assert.deepEqual(
      telemetryDiagnosticDetails(
        record({
          pwa: {
            stage: "chunk",
            script_path: "https://example.test/sw.js?token=1",
            chunk: "/assets/../../Users/private.aseprite?x=1",
            resource: "https://example.test/assets/a.js",
          },
        }),
      ),
      { pwa_stage: "chunk" },
    );
  });
});
