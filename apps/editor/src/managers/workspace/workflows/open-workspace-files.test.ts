import { describe, expect, it, vi } from "vitest";

import {
  openWorkspaceFiles,
  type FallbackFileInput,
} from "$/managers/workspace/workflows/open-workspace-files";

describe("openWorkspaceFiles", () => {
  it("invokes fallback input.click() synchronously within the same user-activation turn when showOpenFilePicker is unavailable", () => {
    const order: string[] = [];
    const fallback: FallbackFileInput = {
      multiple: false,
      click: vi.fn(() => {
        expect(fallback.multiple).toBe(true);
        order.push("input.click");
      }),
    };

    openWorkspaceFiles({
      canStartInteraction: () => true,
      flushPendingLayerProperties: () => order.push("flush"),
      hasPendingSequenceSources: () => false,
      onRequested: () => order.push("requested"),
      pickFiles: () => {
        order.push("pickFiles");
        return null;
      },
      fallbackInput: () => fallback,
      onSources: vi.fn(),
      onCancelled: vi.fn(),
      onError: vi.fn(),
    });

    // Must already have fired synchronously before openWorkspaceFiles returns (no timers/microtasks).
    expect(order).toEqual(["flush", "requested", "pickFiles", "input.click"]);
    expect(fallback.click).toHaveBeenCalledTimes(1);
  });

  it("uses native pickFiles promise without touching the fallback input when available", async () => {
    const fallback: FallbackFileInput = { multiple: false, click: vi.fn() };
    const onSources = vi.fn();
    const onCancelled = vi.fn();
    const onError = vi.fn();
    const sources = [{ source: "s1", name: "art.gif" }];

    openWorkspaceFiles({
      canStartInteraction: () => true,
      hasPendingSequenceSources: () => false,
      onRequested: vi.fn(),
      pickFiles: () => Promise.resolve(sources),
      fallbackInput: () => fallback,
      onSources,
      onCancelled,
      onError,
    });

    expect(fallback.click).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onSources).toHaveBeenCalledWith(sources);
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports cancellation on AbortError and skips interaction when blocked", async () => {
    const fallback: FallbackFileInput = { multiple: false, click: vi.fn() };
    const onCancelled = vi.fn();
    const onError = vi.fn();

    openWorkspaceFiles({
      canStartInteraction: () => false,
      hasPendingSequenceSources: () => false,
      onRequested: vi.fn(),
      pickFiles: () => null,
      fallbackInput: () => fallback,
      onSources: vi.fn(),
      onCancelled,
      onError,
    });
    expect(fallback.click).not.toHaveBeenCalled();

    openWorkspaceFiles({
      canStartInteraction: () => true,
      hasPendingSequenceSources: () => false,
      onRequested: vi.fn(),
      pickFiles: () => Promise.reject(new DOMException("Aborted", "AbortError")),
      fallbackInput: () => fallback,
      onSources: vi.fn(),
      onCancelled,
      onError,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
