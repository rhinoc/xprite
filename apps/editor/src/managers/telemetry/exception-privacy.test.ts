import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { DiagnosticSource, type DiagnosticRecord } from "$/managers/ports/diagnostics";
import { telemetryException } from "$/managers/telemetry/exception-privacy";

function record(overrides: Partial<DiagnosticRecord>): DiagnosticRecord {
  return {
    id: "1",
    timestamp: 1,
    source: DiagnosticSource.Session,
    name: "Error",
    message: "Could not open [name].",
    ...overrides,
  };
}

describe("telemetryException", () => {
  it("appends a scrubbed cause message", () => {
    const result = telemetryException(
      record({
        message: "Could not open secret.png.",
        details: {
          causeMessage: "Failed to read /Users/me/art/secret.png (hero) at blob:https://x/1",
        },
      }),
      ["hero"],
    );
    assert.equal(
      result.message,
      "Could not open [file]. (cause: Failed to read [local path] ([document]) at [local resource])",
    );
    assert.ok(!result.message.includes("hero"), "document names are scrubbed");
  });

  it("leaves the message alone without a cause", () => {
    assert.equal(telemetryException(record({}), []).message, "Could not open [name].");
  });
});
