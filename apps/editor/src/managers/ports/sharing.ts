import type { ShareLinkLimits, ShareProjectSource } from "@xprite/editor-core/import-export";

export interface ShareLimits extends ShareLinkLimits {
  quietUrlCharacters: number;
}

export interface ShareArtifact {
  url: string | null;
  urlCharacters: number;
  frameCount: number;
  layerCount: number;
  qr: { preview: string; file: Blob } | null;
}

/** Browser I/O and cancellable encoding. Product limits are supplied by the manager. */
export interface ProjectSharingPort {
  readonly canCopy: boolean;
  create(
    source: ShareProjectSource,
    limits: ShareLimits,
    signal: AbortSignal,
  ): Promise<ShareArtifact>;
  release(artifact: ShareArtifact): void;
  copy(url: string): Promise<void>;
  downloadQr(artifact: ShareArtifact, name: string): void;
}
