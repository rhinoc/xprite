import { afterEach, describe, expect, it, vi } from "vitest";

import { browserPageContext } from "./browser-context";

function visit(pathname: string) {
  vi.stubGlobal("location", { origin: "https://xprite.cc", pathname });
  vi.stubGlobal("document", { referrer: "" });
}

afterEach(() => vi.unstubAllGlobals());

describe("browser page context", () => {
  it("reports a localized tool page as the same tool as its English page", () => {
    visit("/tools/viewer/");
    const english = browserPageContext();
    visit("/ja/tools/viewer/");
    const japanese = browserPageContext();
    expect(english).toMatchObject({ page_type: "tool", tool_name: "viewer" });
    expect(japanese).toMatchObject({
      page_type: "tool",
      tool_name: "viewer",
      page_path: "/ja/tools/viewer/",
    });
  });
});
