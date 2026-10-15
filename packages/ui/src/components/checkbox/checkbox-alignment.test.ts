import { describe, expect, it } from "vitest";

import { macintoshGeometry } from "$/base/theme/themes/macintosh/geometry";
import { checkboxLabelNudgeY } from "$/components/checkbox/Checkable";

// Regression guard for the CJK checkbox label baseline, measured on 3x captures of the ACNH
// tool at zh-CN/ja/en: plain Text such as the zoom label has no offset and Macintosh CJK
// and Macintosh checkbox labels, CJK or Latin, must land on that same row (net 0).
// The pixel-level counterpart is scripts/visual-audit/checkbox-label-alignment.mjs.
describe("checkbox label vertical alignment", () => {
  const dimensions = macintoshGeometry.dimensions;

  it("puts Macintosh CJK labels on the same row as plain text", () => {
    for (const label of ["图块网格", "タイルのグリッド", "타일 격자"])
      expect(checkboxLabelNudgeY(dimensions, label)).toBe(0);
  });

  it("puts Macintosh Latin labels on the same row as plain text", () => {
    expect(checkboxLabelNudgeY(dimensions, "Tile grid")).toBe(0);
  });
});
