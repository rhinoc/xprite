import { decodePsdProjectSync } from "$/adapters/files/psd-decoder";
import type { PsdImportRequest, PsdImportResponse } from "$/adapters/workers/psd-import-protocol";
import { PsdCodecError, PsdIssueCode } from "@xprite/editor-core/import-export";

const scope = globalThis as unknown as {
  onmessage(event: MessageEvent<PsdImportRequest>): void;
  postMessage(response: PsdImportResponse, transfer?: ArrayBuffer[]): void;
};

function transferBuffers(value: unknown): ArrayBuffer[] {
  const seen = new Set<object>();
  const buffers = new Set<ArrayBuffer>();
  const visit = (child: unknown): void => {
    if (!child || typeof child !== "object" || seen.has(child)) return;
    seen.add(child);
    if (ArrayBuffer.isView(child)) {
      if (child.buffer instanceof ArrayBuffer) buffers.add(child.buffer);
    } else if (child instanceof ArrayBuffer) buffers.add(child);
    else for (const entry of Object.values(child)) visit(entry);
  };
  visit(value);
  return [...buffers];
}

scope.onmessage = ({ data }) => {
  try {
    const project = decodePsdProjectSync(data.bytes, data.limits);
    scope.postMessage({ ok: true, project }, transferBuffers(project));
  } catch (reason) {
    scope.postMessage({
      ok: false,
      message: reason instanceof Error ? reason.message : "Unable to open PSD file.",
      code: reason instanceof PsdCodecError ? reason.code : PsdIssueCode.DecodeFailed,
      details: reason instanceof PsdCodecError ? reason.details : undefined,
    });
  }
};
