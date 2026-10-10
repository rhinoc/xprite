import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";

export async function handOffToolOutput(
  generate: () => Promise<Blob> | Blob,
  name: string,
): Promise<void> {
  let blob: Blob;
  try {
    blob = await generate();
  } catch (reason) {
    if (reason instanceof ToolOperationError) throw reason;
    if (
      reason instanceof Error &&
      ["AbortError", "NotAllowedError", "SecurityError"].includes(reason.name)
    )
      throw reason;
    throw new ToolOperationError(
      reason instanceof RangeError ? ToolFailureCategory.Limit : ToolFailureCategory.Encode,
      reason instanceof Error ? reason.message : "The output could not be generated.",
    );
  }
  downloadBlob(blob, name);
}
