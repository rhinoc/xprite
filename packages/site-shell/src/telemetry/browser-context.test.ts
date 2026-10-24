import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SitePageType,
  SiteToolName,
  type SiteTelemetryProperties,
} from "../managers/ports/telemetry";
import { browserPageContext, watchSiteLinks } from "./browser-context";

const ORIGIN = "https://xprite.cc";
const TOOL_PATHS = [
  "/tools/viewer/",
  "/tools/gif-to-sprite-sheet/",
  "/tools/animal-crossing-qr/",
  "/tools/pixelate/",
  "/tools/fix-ai-pixel-art/",
  "/tools/fuse-beads/",
];

type ClickListener = (event: Partial<MouseEvent>) => void;

class FakeElement {
  constructor(private readonly link: FakeLink | null) {}
  closest() {
    return this.link;
  }
}

class FakeLink {
  constructor(readonly href: string) {}
  hasAttribute() {
    return false;
  }
  getAttribute() {
    return null;
  }
}

let listeners: Map<string, ClickListener>;

function visit(pathname: string) {
  listeners = new Map();
  vi.stubGlobal("location", { origin: ORIGIN, pathname });
  vi.stubGlobal("document", {
    referrer: "",
    addEventListener: (type: string, listener: ClickListener) => listeners.set(type, listener),
  });
  vi.stubGlobal("Element", FakeElement);
}

/** Clicks a same-site link and returns the CTA properties reported for it, if any. */
async function clickLink(path: string): Promise<SiteTelemetryProperties | undefined> {
  let reported: SiteTelemetryProperties | undefined;
  watchSiteLinks((properties) => {
    reported = properties;
  });
  listeners.get("click")!({
    type: "click",
    button: 0,
    defaultPrevented: false,
    target: new FakeElement(new FakeLink(`${ORIGIN}${path}`)) as unknown as EventTarget,
  });
  await Promise.resolve();
  return reported;
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

  it("names every public tool page, in English and localized", () => {
    for (const path of TOOL_PATHS) {
      const tool = path.split("/")[2];
      for (const prefix of ["", "/zh-CN", "/ko", "/pt-BR"]) {
        visit(`${prefix}${path}`);
        expect(browserPageContext(), `${prefix}${path}`).toMatchObject({
          page_type: SitePageType.Tool,
          tool_name: tool,
        });
      }
    }
    expect(Object.values(SiteToolName).sort()).toEqual(
      TOOL_PATHS.map((path) => path.split("/")[2]).sort(),
    );
  });

  it("reports pixelate, fix-ai-pixel-art and fuse bead pages as tools, not other pages", () => {
    visit("/ja/tools/pixelate/");
    expect(browserPageContext()).toMatchObject({ page_type: "tool", tool_name: "pixelate" });
    visit("/zh-CN/tools/fix-ai-pixel-art/");
    expect(browserPageContext()).toMatchObject({
      page_type: "tool",
      tool_name: "fix-ai-pixel-art",
    });
    visit("/tools/fuse-beads/");
    expect(browserPageContext()).toMatchObject({ page_type: "tool", tool_name: "fuse-beads" });
  });
});

describe("site link clicks", () => {
  it("report a click on a link to any tool page as a CTA to that tool", async () => {
    for (const path of [...TOOL_PATHS, "/ja/tools/pixelate/", "/es/tools/fuse-beads/"]) {
      visit("/about/");
      expect(await clickLink(path), path).toEqual({
        cta_target: path.split("/").at(-2),
        target_page_path: path,
      });
    }
  });

  it("ignore links to pages outside the product, such as the privacy notice", async () => {
    visit("/about/");
    expect(await clickLink("/privacy/")).toBeUndefined();
  });
});
