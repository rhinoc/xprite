import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  automaticViewTransition,
  userViewTransition,
  EditorView,
  EditorViewChangeTrigger,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { DiagnosticSource } from "$/managers/ports/diagnostics";
import { TelemetryEvent, type TelemetryProperties } from "$/managers/ports/telemetry";
import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import { OpfsByteStore } from "@xprite/bedrock/browser/opfs";
import { BrowserStorageError } from "@xprite/bedrock/browser/storage-error";

describe("view telemetry", () => {
  it("reports initial entry once and preserves user, automatic and navigation causes", () => {
    const events: { event: TelemetryEvent; properties: TelemetryProperties }[] = [];
    const telemetry = new TelemetryManager({
      enabled: true,
      capture: (event, properties) => events.push({ event, properties }),
      captureException: () => {},
    });
    const selection = userViewTransition(EditorViewChangeReason.TabSelected);
    telemetry.viewChanged(EditorView.Home, selection);
    telemetry.viewChanged(EditorView.Home, selection);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event: TelemetryEvent.ViewChanged,
      properties: {
        from_view: null,
        to_view: EditorView.Home,
        trigger: EditorViewChangeTrigger.Initial,
        reason: EditorViewChangeReason.InitialLoad,
      },
    });
    telemetry.viewChanged(EditorView.Editor, selection);
    const automatic = automaticViewTransition(EditorViewChangeReason.LastDocumentClosed);
    telemetry.viewChanged(EditorView.Editor, automatic);
    telemetry.viewChanged(EditorView.Home, automatic);
    telemetry.viewChanged(EditorView.Editor, {
      trigger: EditorViewChangeTrigger.Navigation,
      reason: EditorViewChangeReason.HistoryNavigation,
    });
    assert.deepEqual(
      events
        .slice(1)
        .map(({ properties }) => [
          properties.from_view,
          properties.to_view,
          properties.trigger,
          properties.reason,
        ]),
      [
        [
          EditorView.Home,
          EditorView.Editor,
          EditorViewChangeTrigger.User,
          EditorViewChangeReason.TabSelected,
        ],
        [
          EditorView.Editor,
          EditorView.Home,
          EditorViewChangeTrigger.Automatic,
          EditorViewChangeReason.LastDocumentClosed,
        ],
        [
          EditorView.Home,
          EditorView.Editor,
          EditorViewChangeTrigger.Navigation,
          EditorViewChangeReason.HistoryNavigation,
        ],
      ],
    );
  });

  it("does not send view events when telemetry is disabled", () => {
    const telemetry = new TelemetryManager({
      enabled: false,
      capture: () => assert.fail("Disabled telemetry must not report"),
      captureException: () => {},
    });
    telemetry.viewChanged(
      EditorView.Recovery,
      userViewTransition(EditorViewChangeReason.RecoveryOpened),
    );
    telemetry.viewChanged(EditorView.Guide, userViewTransition(EditorViewChangeReason.TabSelected));
  });
});

describe("exception telemetry", () => {
  it("forwards real OPFS worker failures through the diagnostic allowlist", async () => {
    const captured: TelemetryProperties[] = [];
    const telemetry = new TelemetryManager({
      enabled: true,
      capture: () => {},
      captureException: (_exception, properties) => captured.push(properties),
    });
    const store = new OpfsByteStore("private-workspace", () => {
      const worker = {
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage() {
          queueMicrotask(() =>
            worker.onerror?.({
              message: "Cannot read /Users/private/artwork.aseprite",
              filename: "https://example.test/assets/opfs-worker.js?token=secret",
              lineno: 12,
              colno: 3,
            } as ErrorEvent),
          );
        },
        terminate() {},
      };
      return worker as unknown as Worker;
    });
    try {
      await assert.rejects(store.read("private-project-id"), (error: unknown) => {
        assert.ok(error instanceof BrowserStorageError);
        telemetry.observeDiagnostic({
          id: "opfs",
          timestamp: 1,
          source: DiagnosticSource.Session,
          name: error.name,
          message: error.message,
          context: "open-browser-project",
          details: error.diagnosticDetails,
        });
        return true;
      });
      assert.deepEqual(captured, [
        {
          opfs_stage: "error",
          opfs_operation: "read",
          opfs_worker_answered: false,
          opfs_line: 12,
          opfs_column: 3,
          error_source: DiagnosticSource.Session,
          operation: "open-browser-project",
        },
      ]);
    } finally {
      store.close();
    }
  });

  it("attaches a scrubbed component stack to React boundary failures only", () => {
    const captured: TelemetryProperties[] = [];
    const telemetry = new TelemetryManager({
      enabled: true,
      capture: () => {},
      captureException: (_exception, properties) => captured.push(properties),
    });
    const base = { id: "1", timestamp: 1, name: "Error", message: "Minified React error #185" };
    telemetry.observeDiagnostic({
      ...base,
      source: DiagnosticSource.ReactBoundary,
      componentStack: "\n    at Frame (https://xprite.cc/assets/a.js:1:2)",
    });
    telemetry.observeDiagnostic({
      ...base,
      id: "2",
      message: "other",
      source: DiagnosticSource.GlobalError,
      componentStack: "at Ignored",
    });
    assert.equal(captured[0].component_stack, "at Frame (https://xprite.cc/assets/a.js:1:2)");
    assert.equal("component_stack" in captured[1], false);
  });

  it("does not report declined file permissions or echoes of a worker that could not load", () => {
    const captured: { name: string; source: unknown }[] = [];
    const telemetry = new TelemetryManager({
      enabled: true,
      capture: () => {},
      captureException: (exception, properties) =>
        captured.push({ name: exception.name, source: properties.error_source }),
    });
    const record = (id: string, name: string, source: DiagnosticSource) =>
      telemetry.observeDiagnostic({ id, timestamp: 1, name, message: `${name} ${id}`, source });
    record("1", "FileWritePermissionError", DiagnosticSource.Session);
    record("2", "WorkerLoadError", DiagnosticSource.RecoveryWorker);
    record("3", "WorkerLoadError", DiagnosticSource.Session);
    record("4", "WorkerLoadError", DiagnosticSource.ImportWorker);
    // The service worker adapter's stale-build report is the one that is kept.
    record("5", "WorkerLoadError", DiagnosticSource.ServiceWorker);
    record("6", "Error", DiagnosticSource.RecoveryWorker);
    assert.deepEqual(captured, [
      { name: "WorkerLoadError", source: DiagnosticSource.ServiceWorker },
      { name: "Error", source: DiagnosticSource.RecoveryWorker },
    ]);
  });
});
