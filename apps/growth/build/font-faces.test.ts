import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { missingFontFaces } from "./font-faces.ts";

const CHICAGO = `@font-face {
  font-family: ChiKareGo2;
  src: url("/theme/ssg-assets/a.woff2") format("woff2");
  font-display: block;
}`;

describe("font face coverage", () => {
  it("ignores formatting, quotes, comments and the final semicolon", () => {
    const minified =
      "@font-face{font-family:ChiKareGo2;src:url(/theme/ssg-assets/a.woff2) format(woff2);font-display:block}";
    assert.deepEqual(missingFontFaces(minified, `/* face */\n${CHICAGO}`), []);
  });

  it("reports faces with a different source or descriptor", () => {
    const swapped = CHICAGO.replace("block", "swap");
    assert.equal(missingFontFaces(swapped, CHICAGO).length, 1);
    assert.equal(missingFontFaces(CHICAGO.replace("a.woff2", "b.woff2"), CHICAGO).length, 1);
  });
});
