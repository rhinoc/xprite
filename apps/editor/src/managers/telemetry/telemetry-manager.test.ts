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
});
