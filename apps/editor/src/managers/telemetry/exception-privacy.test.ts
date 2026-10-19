import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { DiagnosticSource, type DiagnosticRecord } from "$/managers/ports/diagnostics";
import {
  telemetryComponentStack,
  telemetryException,
} from "$/managers/telemetry/exception-privacy";

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

describe("telemetryComponentStack", () => {
  it("keeps component names and scrubs private text", () => {
    const stack =
      "\n    at Panel (https://xprite.cc/assets/x.js:2:3)\n    at hero (/Users/me/a.js)";
    const result = telemetryComponentStack(stack, ["hero"]);
    assert.ok(result.startsWith("at Panel (https://xprite.cc/assets/x.js:2:3)"));
    assert.ok(!result.includes("hero") && !result.includes("/Users/me"));
  });

  it("is bounded", () => {
    assert.equal(telemetryComponentStack("at A\n".repeat(5_000), []).length, 4_000);
  });
});
