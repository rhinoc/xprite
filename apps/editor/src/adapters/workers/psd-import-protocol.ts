import type { EditorProject } from "@xprite/editor-core/document";
import type { PsdIssueCode, PsdResourceLimits } from "@xprite/editor-core/import-export";

export interface PsdImportRequest {
  bytes: Uint8Array;
  fileName: string;
  limits: PsdResourceLimits;
}

export type PsdImportResponse =
  | { ok: true; project: EditorProject }
  | {
      ok: false;
      message: string;
      code?: PsdIssueCode;
      details?: Readonly<Record<string, unknown>>;
    };
