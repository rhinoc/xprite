import { tUi } from "$/i18n";
import { AsepriteCodecError, AsepriteIssueCode } from "@xprite/editor-core/import-export";

/** Keep detailed issues for local diagnostics, but never put arbitrary parser text in a hint. */
export function localizeAsepriteRejection(reason: unknown): unknown {
  if (!(reason instanceof AsepriteCodecError) || !reason.issues.length) return reason;
  const issue = reason.issues.find((entry) => entry.fatal) ?? reason.issues[0];
  const code = issue.code;
  const key =
    code === AsepriteIssueCode.ResourceLimit
      ? "ui.aseprite.rejection.resource"
      : code === AsepriteIssueCode.Truncated
        ? "ui.aseprite.rejection.truncated"
        : [
              AsepriteIssueCode.UnsupportedDepth,
              AsepriteIssueCode.UnsupportedLayer,
              AsepriteIssueCode.UnsupportedCel,
              AsepriteIssueCode.UnsupportedBlendMode,
            ].includes(code)
          ? "ui.aseprite.rejection.unsupported"
          : Object.values(AsepriteIssueCode).includes(code)
            ? "ui.aseprite.rejection.invalid"
            : "ui.aseprite.rejection.unknown";
  reason.message = tUi("ui.aseprite.rejection", { reason: tUi(key) });
  return reason;
}
