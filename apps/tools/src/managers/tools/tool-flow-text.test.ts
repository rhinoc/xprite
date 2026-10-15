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
