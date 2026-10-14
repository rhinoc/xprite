import { describe, expect, it } from "vitest";

import { TelemetryEvent, type TelemetryProperties } from "$/managers/ports/telemetry";
import { telemetryFileFormat } from "$/managers/telemetry/document-context";
import { reportingExport } from "$/managers/telemetry/reporting-export";
import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type { EditorDocument } from "@xprite/editor-core/document";

const document: EditorDocument = {
  name: "hero.aseprite",
  width: 1,
  height: 1,
  selection: null,
  layer: {
    name: "Image",
    pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    x: 0,
    y: 0,
    visible: true,
    locked: false,
  },
};

describe("export telemetry", () => {
  it("recognizes PDF output", () => {
    expect(telemetryFileFormat("hero-beads.pdf")).toBe("pdf");
    expect(telemetryFileFormat("hero.PDF")).toBe("pdf");
  });
  it("tags request, result and download events with the exporter id", async () => {
    const events: { event: TelemetryEvent; properties: TelemetryProperties }[] = [];
    const telemetry = new TelemetryManager({
      enabled: true,
      capture: (event, properties) => events.push({ event, properties }),
      captureException: () => {},
    });
    await reportingExport(
      telemetry,
      document,
      undefined,
      async (ports) => {
        await ports.save!({ name: "hero-beads.pdf", blob: new Blob(["%PDF"]) });
      },
      async () => {},
      "beads",
    );
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const { properties } of events) expect(properties.exporter_id).toBe("beads");
    const download = events.find(({ event }) => event === TelemetryEvent.FileDownloadRequested);
    expect(download?.properties.output_format).toBe("pdf");
  });
});
