import { afterEach, describe, expect, it, vi } from "vitest";

import { localizeAsepriteRejection } from "$/adapters/files/aseprite-errors";
import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import { changeUiLanguage } from "$/i18n";
import { AsepriteCodecError, AsepriteIssueCode } from "@xprite/editor-core/import-export";

afterEach(async () => {
  vi.unstubAllGlobals();
  await changeUiLanguage("en");
});
describe("Aseprite rejection hints", () => {
  it.each([
    [AsepriteIssueCode.ResourceLimit, "resource limits"],
    [AsepriteIssueCode.Truncated, "incomplete"],
    [AsepriteIssueCode.UnsupportedCel, "unsupported feature"],
    [AsepriteIssueCode.InvalidChunk, "structure"],
  ])("shows a safe reason for %s", (code, text) => {
    const issues = [
      {
        code,
        message: "/Users/private/secret.aseprite parser bytes=" + "x".repeat(10000),
        fatal: true,
      },
    ];
    const error = new AsepriteCodecError("raw private message", issues);
    expect(localizeAsepriteRejection(error)).toBe(error);
    expect(error.message).toContain(text);
    expect(error.message).not.toMatch(/secret|private|parser|bytes=/);
    expect(error.issues).toBe(issues);
  });
  it("localizes the fixed hint and preserves unexpected non-codec exceptions", async () => {
    await changeUiLanguage("zh-CN");
    const error = new AsepriteCodecError("raw", [
      { code: AsepriteIssueCode.Truncated, message: "private", fatal: true },
    ]);
    localizeAsepriteRejection(error);
    expect(error.message).toContain("不完整");
    const unexpected = new Error("network");
    expect(localizeAsepriteRejection(unexpected)).toBe(unexpected);
  });
});

it("preserves a structured worker preflight reason through the real import boundary", async () => {
  vi.stubGlobal("fetch", undefined);
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      terminate() {}
      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              ok: false,
              message: "Aseprite preflight rejected this file",
              issues: [
                {
                  code: AsepriteIssueCode.UnsupportedCel,
                  message: "raw private data",
                  fatal: true,
                },
              ],
            },
          }),
        );
      }
    },
  );
  await expect(
    decodeAsepriteBlob(new Blob([new Uint8Array(128)]), "private.aseprite"),
  ).rejects.toMatchObject({
    name: "AsepriteCodecError",
    message: expect.stringContaining("unsupported feature"),
    issues: [expect.objectContaining({ code: "unsupported-cel" })],
  });
});
