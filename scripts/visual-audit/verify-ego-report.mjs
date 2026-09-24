import assert from "node:assert/strict";

import { parseEgoReport } from "../base/ego-report.mjs";

assert.deepEqual(parseEgoReport({ stdout: 'QA_REPORT:{"ok":true}\n' }, "QA_REPORT").report, {
  ok: true,
});
assert.deepEqual(
  parseEgoReport({ stderr: 'CAPTURE_REPORT:{"ok":true}\n' }, "CAPTURE_REPORT").report,
  { ok: true },
);
assert.throws(
  () => parseEgoReport({ stdout: "QA_PHASE:started\n" }, "QA_REPORT"),
  /no QA_REPORT report/,
);
assert.throws(
  () => parseEgoReport({ stderr: "QA_REPORT:{broken}\n" }, "QA_REPORT"),
  /malformed QA_REPORT JSON/,
);
console.log("4 Ego report parser cases passed: stdout, stderr, missing marker and malformed JSON.");
