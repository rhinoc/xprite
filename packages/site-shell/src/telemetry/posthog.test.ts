import { describe, expect, it } from "vitest";

import { DEFAULT_POSTHOG_API_HOST, resolvePostHogApiHost } from "./posthog";

describe("resolvePostHogApiHost", () => {
  it("defaults US projects to the first-party managed proxy", () => {
    expect(DEFAULT_POSTHOG_API_HOST).toBe("https://e.xprite.cc");
    expect(resolvePostHogApiHost("us")).toBe("https://e.xprite.cc");
    expect(resolvePostHogApiHost("us", "")).toBe("https://e.xprite.cc");
    expect(resolvePostHogApiHost("us", "   ")).toBe("https://e.xprite.cc");
  });

  it("keeps PostHog's EU host for EU projects", () => {
    expect(resolvePostHogApiHost("eu")).toBe("https://eu.i.posthog.com");
  });

  it("accepts an https origin override", () => {
    expect(resolvePostHogApiHost("us", " https://m.example.com/ ")).toBe("https://m.example.com");
    expect(resolvePostHogApiHost("eu", "https://m.example.com")).toBe("https://m.example.com");
  });

  it("ignores unsafe or malformed overrides", () => {
    for (const value of [
      "http://m.example.com",
      "not a url",
      "https://user:pass@m.example.com",
      "https://m.example.com/ingest",
      "https://m.example.com/?a=1",
    ])
      expect(resolvePostHogApiHost("us", value)).toBe("https://e.xprite.cc");
  });
});
