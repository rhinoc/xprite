import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { markFieldKey } from "$/base/utils/field-key";
import { triggerDefaultAction } from "$/components/window/interaction";

class MockNode {
  isConnected = true;
  disabled = false;
  defaultAction = false;
  clicks = 0;
  actionButton: MockNode | null = null;
  matches(selector: string) {
    if (selector === "[data-ui-default-action]:not(:disabled)") {
      return this.defaultAction && !this.disabled;
    }
    return false;
  }
  querySelector(selector: string) {
    return this.actionButton?.matches(selector) ? this.actionButton : null;
  }
  click() {
    this.clicks++;
  }
}

function makeEnterEvent(target: MockNode | null, overrides: Record<string, unknown> = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    key: { value: "Enter" },
    altKey: { value: false },
    ctrlKey: { value: false },
    metaKey: { value: false },
    shiftKey: { value: false },
    isComposing: { value: false },
    keyCode: { value: 13 },
    target: { value: target },
    ...Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, { value, configurable: true }]),
    ),
  });
  return event as unknown as KeyboardEvent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("triggerDefaultAction", () => {
  it("clicks the default action in a microtask for an unclaimed or field-marked Enter", async () => {
    vi.stubGlobal("Element", MockNode);
    const root = new MockNode();
    const button = new MockNode();
    button.defaultAction = true;
    root.actionButton = button;
    const input = new MockNode();

    const event = makeEnterEvent(input);
    event.preventDefault();
    markFieldKey(event);

    assert.equal(triggerDefaultAction(root as unknown as HTMLElement, event), true);
    assert.equal(button.clicks, 0);
    await Promise.resolve();
    assert.equal(button.clicks, 1);
  });

  it("ignores Enter already claimed by a commit-only input", async () => {
    vi.stubGlobal("Element", MockNode);
    const root = new MockNode();
    const button = new MockNode();
    button.defaultAction = true;
    root.actionButton = button;
    const input = new MockNode();

    const event = makeEnterEvent(input);
    event.preventDefault();

    assert.equal(triggerDefaultAction(root as unknown as HTMLElement, event), false);
    await Promise.resolve();
    assert.equal(button.clicks, 0);
  });

  it("skips clicking when the button becomes disabled before the microtask runs", async () => {
    vi.stubGlobal("Element", MockNode);
    const root = new MockNode();
    const button = new MockNode();
    button.defaultAction = true;
    root.actionButton = button;
    const input = new MockNode();

    const event = makeEnterEvent(input);
    assert.equal(triggerDefaultAction(root as unknown as HTMLElement, event), true);
    button.disabled = true;
    await Promise.resolve();
    assert.equal(button.clicks, 0);
  });
});
