import type { PixelBuffer } from "@xprite/editor-core/base";
import type { NormalMapOptions } from "@xprite/editor-core/image-editing";

export interface NormalMapDraft {
  options: NormalMapOptions;
  manualAngle: boolean;
  estimateSource: PixelBuffer | null;
}

export function patchNormalMapDraft(
  draft: NormalMapDraft,
  patch: Partial<NormalMapOptions>,
  source: PixelBuffer | null,
): NormalMapDraft {
  const options = { ...draft.options, ...patch };
  const manualAngle = draft.manualAngle || patch.paintedLightAngle !== undefined;
  let estimateSource = draft.estimateSource;
  if (manualAngle || !options.paintedLightInfluence) estimateSource = null;
  else if (!draft.options.paintedLightInfluence) estimateSource = source;
  return { options, manualAngle, estimateSource };
}

export function finishNormalMapAngleEstimate(
  draft: NormalMapDraft,
  source: PixelBuffer,
  angle: number | null,
): NormalMapDraft {
  if (draft.estimateSource !== source || draft.manualAngle || !draft.options.paintedLightInfluence)
    return draft;
  return {
    ...draft,
    estimateSource: null,
    options: angle === null ? draft.options : { ...draft.options, paintedLightAngle: angle },
  };
}
