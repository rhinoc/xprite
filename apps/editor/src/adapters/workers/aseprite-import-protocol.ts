import type { EditorProject } from "@xprite/editor-core/document";
import type { AsepriteIssue, AsepriteResourceLimits } from "@xprite/editor-core/import-export";

export interface AsepriteImportRequest {
  bytes: Uint8Array;
  fileName: string;
  limits: AsepriteResourceLimits;
}

export type AsepriteImportResponse =
  | { ok: true; project: EditorProject }
  | {
      ok: false;
      message: string;
      issues?: readonly AsepriteIssue[];
      details?: Readonly<Record<string, unknown>>;
    };
