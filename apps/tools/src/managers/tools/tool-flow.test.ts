import { describe, expect, it } from "vitest";

import { flowCue } from "$/managers/tools/tool-flow";
import { PublicLanguage } from "@xprite/growth-content/language";
import { translateToolText } from "@xprite/growth-content/tools";

const FLOW_KEYS = [
  "Generated",
  "Adjust",
  "Export",
  "Open a file to start",
  "Open a file to adjust",
  "Choose an export format",
];

describe("flowCue", () => {
  const english = (source: string) => source;
  it("walks the three steps once a result exists", () => {
    expect(flowCue(english, { ready: true, processing: false })).toBe(
      "Generated · Adjust · Export",
    );
  });
  it("hints at the first step while empty and shows progress while working", () => {
    expect(flowCue(english, { ready: false, processing: false })).toBe("Open a file to start");
    expect(flowCue(english, { ready: true, processing: true })).toBe("Generating…");
  });
  it("is localized in every locale", () => {
    const zh = (source: string) => translateToolText(source, PublicLanguage.SimplifiedChinese);
    expect(flowCue(zh, { ready: true, processing: false })).toBe("已生成 · 调整 · 导出");
    for (const language of Object.values(PublicLanguage).filter(
      (value) => value !== PublicLanguage.English,
    ))
      for (const key of FLOW_KEYS) expect(translateToolText(key, language)).not.toBe(key);
  });
});
