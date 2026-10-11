import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { deferStylesheets } from "./site-html.ts";

describe("deferred bundle stylesheets", () => {
  it("defers only Vite bundle stylesheets that have no media query yet", () => {
    const html = [
      '<link rel="stylesheet" href="/theme/growth-desktop.css">',
      '<link rel="stylesheet" crossorigin href="/assets/posthog-Bxqvc_JX.css">',
      '<link rel="stylesheet" crossorigin href="/tools/assets/pixelate-BxMZuWdm.css" />',
      '<link rel="stylesheet" media="print" href="/assets/print-AbCdEfGh.css">',
      '<link rel="modulepreload" crossorigin href="/assets/posthog-jun1m9QX.js">',
    ].join("\n");
    assert.equal(
      deferStylesheets(html),
      [
        '<link rel="stylesheet" href="/theme/growth-desktop.css">',
        `<link rel="stylesheet" crossorigin href="/assets/posthog-Bxqvc_JX.css" media="print" onload="this.media='all'">`,
        `<link rel="stylesheet" crossorigin href="/tools/assets/pixelate-BxMZuWdm.css" media="print" onload="this.media='all'">`,
        '<link rel="stylesheet" media="print" href="/assets/print-AbCdEfGh.css">',
        '<link rel="modulepreload" crossorigin href="/assets/posthog-jun1m9QX.js">',
      ].join("\n"),
    );
  });
});
