import { describe, expect, it } from "vitest";

import { BEAD_TEXT, beadDocumentLabels, beadText } from "$/managers/locale/bead-text";
import { PUBLIC_LANGUAGES, PublicLanguage } from "@xprite/growth-content/language";

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("bead tool copy", () => {
  it("covers every public language with the same keys and placeholders, all translated", () => {
    const english = BEAD_TEXT[PublicLanguage.English];
    expect(Object.keys(BEAD_TEXT).sort()).toEqual([...PUBLIC_LANGUAGES].sort());
    for (const language of PUBLIC_LANGUAGES) {
      const catalog = BEAD_TEXT[language];
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.trim(), `${language} ${key}`).not.toBe("");
        expect(placeholders(message), `${language} ${key}`).toEqual(
          placeholders(english[key as keyof typeof english]),
        );
      }
    }
  });
  it("uses readable keys rather than English source text", () => {
    for (const key of Object.keys(BEAD_TEXT[PublicLanguage.English]))
      expect(key).toMatch(/^beads(\.[a-z]+)+$/);
  });
  it("interpolates values and builds localized document labels", () => {
    const russian = beadText(PublicLanguage.Russian);
    expect(russian("beads.board.coordinates", { row: 2, column: 3 })).toBe("Ряд 2, столбец 3");
    const labels = beadDocumentLabels(beadText(PublicLanguage.Japanese));
    expect(labels.overview({ brand: "Perler" })).toBe("Perler - 全体図");
    expect(labels.quantity).toBe("個数");
  });
});
