import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { semanticPresentationTokens } from "$/base/theme/semantic-presentation-tokens";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";
import { macintoshGeometry } from "$/base/theme/themes/macintosh/geometry";
import { macintoshTypography } from "$/base/theme/themes/macintosh/typography";
import { cjkRunOffsetStyle } from "$/components/text/script-offset";

// Regression guard for cross-script vertical text alignment. Latin is the base; CJK gets ONE
// vertical offset per theme (`typography.cjkTextOffsetY`, published as `--ui-cjk-text-offset-y`
// and applied only by components/text/script-offset.tsx), so checkbox, radio, input, button,
// select, tabs, menus and plain Text all align zh/ja with en the same way. The pixel-level
// counterpart, measured at 3x for zh/ja/en, is scripts/visual-audit/text-alignment.mjs.
describe("single CJK text offset", () => {
  it("is measured at 0 for Macintosh and Aseprite", () => {
    // text-alignment.mjs: with 0, CJK ink is centred on Latin ink within 1 device px in every
    // control on both themes; any non-zero value moves every control off by that amount.
    expect(macintoshTypography.cjkTextOffsetY).toBe(0);
    expect(asepriteTypography.cjkTextOffsetY).toBe(0);
  });

  it("publishes the theme value as one CSS variable", () => {
    const palette = {
      primaryFont: "a",
      compactFont: "b",
      cjkFont: "c",
      ink: "#000",
      mutedInk: "#888",
      paper: "#fff",
      line: "#aaa",
      desktop: "#ddd",
      chrome: "#eee",
      border: "#000",
      canvas: "#eee",
      link: "#000",
    };
    expect(
      semanticPresentationTokens({ ...palette, cjkTextOffsetY: -1 })["--ui-cjk-text-offset-y"],
    ).toBe("-1px");
    expect(semanticPresentationTokens(palette)["--ui-cjk-text-offset-y"]).toBe("0px");
  });

  it("scales the shared offset with the text scale", () => {
    expect(cjkRunOffsetStyle().top).toBe("calc(var(--ui-cjk-text-offset-y, 0px) * 1)");
    expect(cjkRunOffsetStyle(4).top).toBe("calc(var(--ui-cjk-text-offset-y, 0px) * 2)");
  });

  it("keeps CJK nudges out of theme geometry", () => {
    expect(Object.keys(macintoshGeometry.dimensions).filter((key) => /cjk/i.test(key))).toEqual([]);
  });

  it("keeps per-component CJK offsets out of the source", () => {
    const allowed = new Set(["cjkTextOffsetY", "cjkRunOffsetStyle", "MACINTOSH_CJK_TEXT_OFFSET_Y"]);
    const pattern = /\w*cjk\w*(?:offset|nudge)\w*|\w*(?:offset|nudge)\w*cjk\w*/gi;
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")) {
          for (const match of readFileSync(path, "utf8").matchAll(pattern))
            if (!allowed.has(match[0])) offenders.push(`${path}: ${match[0]}`);
        }
      }
    };
    walk(join(import.meta.dirname, "../.."));
    expect(offenders).toEqual([]);
  });
});
