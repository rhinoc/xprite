import type {
  AsepriteImportRequest,
  AsepriteImportResponse,
} from "$/adapters/workers/aseprite-import-protocol";
import { AsepriteCodecError, decodeAsepriteProjectSync } from "@xprite/editor-core/import-export";

const scope = globalThis as unknown as {
  onmessage(event: MessageEvent<AsepriteImportRequest>): void;
  postMessage(response: AsepriteImportResponse, transfer?: ArrayBuffer[]): void;
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
    const project = decodeAsepriteProjectSync(data.bytes, {
      fileName: data.fileName,
      limits: data.limits,
      takeOwnership: true,
      deferPixels: true,
      takeProjectOwnership: true,
      errors: {
        canvas: () => new AsepriteCodecError("Aseprite canvas exceeds the browser resource limit"),
      },
    });
    scope.postMessage({ ok: true, project }, transferBuffers(project));
  } catch (reason) {
    scope.postMessage({
      ok: false,
      message: reason instanceof Error ? reason.message : "Unable to open Aseprite project.",
      issues: reason instanceof AsepriteCodecError ? reason.issues : undefined,
      details: reason instanceof AsepriteCodecError ? reason.details : undefined,
    });
  }
};
