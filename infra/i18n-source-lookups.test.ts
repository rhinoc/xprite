import { describe, expect, it } from "vitest";

import { findSourceLookups } from "../scripts/check/i18n-source-lookups.mjs";

const literalLines = (text: string, fileName?: string) =>
  findSourceLookups(text, fileName)
    .filter((lookup) => lookup.literal)
    .map((lookup) => lookup.line);

describe("findSourceLookups", () => {
  it("flags literal text on the same line", () => {
    expect(literalLines(`tUiSource("Open");\ntheme.translateSource('Close');`)).toEqual([1, 2]);
  });

  it("flags literal text wrapped onto later lines, past comments", () => {
    const text = [
      "const label = tUiSource(",
      "  // Shown in the share dialog.",
      '  "This link is long.",',
      ");",
      "const title = translateSource(",
      "  /* fallback */ `Show Tileset`",
      ");",
    ].join("\n");
    expect(literalLines(text)).toEqual([1, 5]);
  });

  it("flags choices between literal texts, including nested and wrapped ones", () => {
    const text = [
      "tUiSource(",
      "  device === Mouse",
      '    ? "Mouse"',
      '    : device === Trackpad ? ("Trackpad") : "Unknown",',
      ");",
      'tUiSource(wide ? "Median width" : label);',
    ].join("\n");
    expect(literalLines(text)).toEqual([1]);
  });

  it("counts dynamic lookups without flagging them", () => {
    const text = [
      "tUiSource(label);",
      "translateSource(",
      "  `${prefix} label`,",
      ");",
      'tUiSource(props["aria-label"] ?? "Tabs");',
      '// tUiSource("in a comment")',
      'const note = "tUiSource(\\"in a string\\")";',
      "export function tUiSource(source: string) { return source; }",
    ].join("\n");
    expect(findSourceLookups(text)).toEqual([
      { line: 1, literal: false, text: "tUiSource(label)" },
      { line: 2, literal: false, text: "translateSource( `${prefix} label`, )" },
      { line: 5, literal: false, text: 'tUiSource(props["aria-label"] ?? "Tabs")' },
    ]);
  });

  it("parses .ts files without JSX so generic arrows still parse", () => {
    const text = 'const id = <T,>(value: T) => value;\nid(tUiSource(\n  "Open",\n));';
    expect(literalLines(text, "file.ts")).toEqual([2]);
  });
});
