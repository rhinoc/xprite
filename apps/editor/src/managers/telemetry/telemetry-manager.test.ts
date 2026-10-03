import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  automaticViewTransition,
  userViewTransition,
  EditorView,
  EditorViewChangeTrigger,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
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
