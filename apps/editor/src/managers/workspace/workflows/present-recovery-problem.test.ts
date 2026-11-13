import { describe, it, expect } from "vitest";

import { presentRecoveryProblem } from "$/managers/workspace/workflows/present-recovery-problem";

describe("persistent recovery status presentation", () => {
  it("shows acknowledged output plus failed recovery instead of masking it with a generic error", () => {
    const outputProblem =
      "The file was saved. Local recovery is not saved; keep this document open.";
    expect(
      presentRecoveryProblem({
        outputProblem,
        failure: new Error("CAS"),
        workspacePending: true,
        documentPending: true,
      }),
    ).toBe(outputProblem);
  });
  it("labels the other-documents/layout warning, not B's acknowledged checkpoint, as unsafe", () => {
    expect(
      presentRecoveryProblem({
        failure: new Error("A CAS"),
        workspacePending: true,
        documentPending: false,
      }),
    ).toBe("Other documents or the workspace layout are not saved in this browser.");
  });
  it("retains the active document error, optional-archive diagnostic, and pending-output warning", () => {
    expect(
      presentRecoveryProblem({
        failure: new Error("B quota"),
        workspacePending: true,
        documentPending: true,
      }),
    ).toBe("Changes are not saved in this browser.");
    expect(
      presentRecoveryProblem({
        failure: new Error("archive"),
        workspacePending: false,
        documentPending: false,
      }),
    ).toBeDefined();
    expect(
      presentRecoveryProblem({
        outputProblem: "Keep this document open",
        failure: null,
        workspacePending: true,
        documentPending: true,
      }),
    ).toBe("Keep this document open");
    expect(
      presentRecoveryProblem({ failure: null, workspacePending: false, documentPending: false }),
    ).toBeUndefined();
  });
});
