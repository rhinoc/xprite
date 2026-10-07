import type { ShareLimits } from "$/managers/ports/sharing";

export const PROJECT_SHARE_LIMITS: Readonly<ShareLimits> = {
  quietUrlCharacters: 1_800,
  maxUrlCharacters: 8_192,
  maxProjectBytes: 64 * 1024 * 1024,
};

export enum ShareLinkStage {
  Quiet,
  Warning,
  Rejected,
}

export function shareLinkStage(length: number): ShareLinkStage {
  if (length > PROJECT_SHARE_LIMITS.maxUrlCharacters) return ShareLinkStage.Rejected;
  return length > PROJECT_SHARE_LIMITS.quietUrlCharacters
    ? ShareLinkStage.Warning
    : ShareLinkStage.Quiet;
}
