import { readFileSync } from "node:fs";

import { BaseSequencer, type TestSpecification } from "vitest/node";

/** Start CPU-bound fixtures first even when Vitest has no previous timing cache. */
export class CpuFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    const intensive = new Set(
      ordered.filter((file) => readFileSync(file.moduleId, "utf8").startsWith("// @cpu-intensive")),
    );
    return [
      ...ordered.filter((file) => intensive.has(file)),
      ...ordered.filter((file) => !intensive.has(file)),
    ];
  }
}
