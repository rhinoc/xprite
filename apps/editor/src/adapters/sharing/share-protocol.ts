import type {
  ShareLinkLimits,
  ShareLinkResult,
  ShareProjectSource,
} from "@xprite/editor-core/import-export";

export enum ShareOperation {
  Encode = "encode",
  Decode = "decode",
  Error = "error",
}
export type ShareWorkerRequest =
  | {
      operation: ShareOperation.Encode;
      source: ShareProjectSource;
      limits: ShareLinkLimits;
      baseUrl: string;
    }
  | { operation: ShareOperation.Decode; text: string; limits: ShareLinkLimits };
export type ShareWorkerResult =
  | (ShareLinkResult & { operation: ShareOperation.Encode })
  | { operation: ShareOperation.Decode; bytes: Uint8Array; name: string }
  | { operation: ShareOperation.Error; message: string };
