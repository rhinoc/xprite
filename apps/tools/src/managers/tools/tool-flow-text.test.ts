import { describe, expect, it } from "vitest";

import { PublicLanguage } from "@xprite/growth-content/language";
import { translateToolText } from "@xprite/growth-content/tools";

describe("flow tool text", () => {
  it("localizes the adjust and export strings in every locale", () => {
    for (const language of Object.values(PublicLanguage).filter(
      (value) => value !== PublicLanguage.English,
    ))
      for (const key of ["Adjust", "Export", "Export…", "Choose an export format", "Edit more"])
        expect(translateToolText(key, language)).not.toBe(key);
    expect(translateToolText("Adjust", PublicLanguage.SimplifiedChinese)).toBe("调整");
  });
});

describe("pixelate comparison text", () => {
  it("localizes the divider label in every locale", () => {
    for (const language of Object.values(PublicLanguage).filter(
      (value) => value !== PublicLanguage.English,
    ))
      for (const key of [
        "Drag to compare original and result",
        "Pixelated",
        "Restored",
        "Preparing preview…",
      ])
        expect(translateToolText(key, language)).not.toBe(key);
  });
});
