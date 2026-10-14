import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_POSTHOG_API_HOST,
  SNAPSHOT_EVENT,
  resolvePostHogApiHost,
  sanitizeRecordedRequest,
  sanitizeSdkEvent,
  sanitizeSnapshotData,
} from "./posthog";

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

describe("session replay sanitizing", () => {
  const allowed = new Set(["$pageview", SNAPSHOT_EVENT]);

  it("lets replay snapshots through the event allowlist", () => {
    const event = {
      uuid: "1",
      event: SNAPSHOT_EVENT,
      properties: { $session_id: "s", $snapshot_data: [] },
    } as unknown as CaptureResult;
    expect(sanitizeSdkEvent(event, allowed)?.event).toBe(SNAPSHOT_EVENT);
    expect(sanitizeSdkEvent({ ...event, event: "$autocapture" }, allowed)).toBeNull();
  });

  it("strips query strings and fragments from recorded page URLs", () => {
    const data = [
      { type: 4, data: { href: "https://xprite.cc/editor?file=secret#frag", width: 1, height: 1 } },
      { type: 5, data: { tag: "$pageview", payload: { href: "https://xprite.cc/?a=1" } } },
      { type: 5, data: { tag: "$pageview", payload: { href: "javascript:alert(1)" } } },
      { type: 3, data: { source: 1, positions: [] } },
    ];
    expect(sanitizeSnapshotData(data)).toEqual([
      { type: 4, data: { href: "https://xprite.cc/editor", width: 1, height: 1 } },
      { type: 5, data: { tag: "$pageview", payload: { href: "https://xprite.cc/" } } },
      { type: 5, data: { tag: "$pageview", payload: { href: "" } } },
      { type: 3, data: { source: 1, positions: [] } },
    ]);
    expect(data[0]?.data).toMatchObject({ href: "https://xprite.cc/editor?file=secret#frag" });
  });

  it("sanitizes snapshot payloads inside the SDK event", () => {
    const event = {
      uuid: "1",
      event: SNAPSHOT_EVENT,
      properties: {
        $current_url: "https://xprite.cc/?q=1",
        $snapshot_data: [{ type: 4, data: { href: "https://xprite.cc/?q=1#x" } }],
      },
    } as unknown as CaptureResult;
    expect(sanitizeSdkEvent(event, allowed)?.properties).toMatchObject({
      $current_url: "https://xprite.cc/",
      $snapshot_data: [{ type: 4, data: { href: "https://xprite.cc/" } }],
    });
  });

  it("leaves compressed or unknown snapshot payloads untouched", () => {
    expect(sanitizeSnapshotData("compressed")).toBe("compressed");
    expect(sanitizeSnapshotData([null, 1, { type: 2 }])).toEqual([null, 1, { type: 2 }]);
  });

  it("strips query strings from captured network requests", () => {
    expect(
      sanitizeRecordedRequest({ name: "https://e.xprite.cc/flags?v=2#a", duration: 3 }),
    ).toEqual({ name: "https://e.xprite.cc/flags", duration: 3 });
    expect(sanitizeRecordedRequest({ name: "blob:abc" })).toEqual({ name: "" });
  });
});
