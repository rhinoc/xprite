import { describe, expect, it } from "vitest";

import { FILES_TEXT, filesText } from "$/managers/locale/files-text";
import { PUBLIC_LANGUAGES, PublicLanguage } from "@xprite/growth-content/language";

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Files copy", () => {
  it("covers every public language with the same keys and placeholders", () => {
    const english = FILES_TEXT[PublicLanguage.English];
    expect(Object.keys(FILES_TEXT).sort()).toEqual([...PUBLIC_LANGUAGES].sort());
    for (const language of PUBLIC_LANGUAGES) {
      const catalog = FILES_TEXT[language];
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.trim(), `${language} ${key}`).not.toBe("");
        expect(placeholders(message), `${language} ${key}`).toEqual(
          placeholders(english[key as keyof typeof english]),
        );
      }
    }
  });
  it("interpolates values", () => {
    expect(
      filesText(PublicLanguage.English)("files.info.bar", { count: 3, free: "2 GB" }),
    ).toContain("3");
  });
});
