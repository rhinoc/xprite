import { describe, expect, it, vi } from "vitest";

import { startupClickScript, takeStartupClick } from "$/adapters/tools/startup-click";

class FakeButton {
  disabled = false;
  isConnected = true;
  click = vi.fn();
  closest(selector: string) {
    return selector === "button" ? this : null;
  }
}

function page() {
  const root = new EventTarget() as EventTarget & Record<string, unknown>;
  const document = { getElementById: (id: string) => (id === "tool-root" ? root : null) };
  new Function("document", startupClickScript("tool-root"))(document);
  const press = (button: FakeButton) => {
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: button });
    root.dispatchEvent(event);
  };
  return { root: root as unknown as HTMLElement, press };
}

describe("presses before the tool is interactive", () => {
  it("presses the last button pressed during startup once, after hydration", () => {
    const { root, press } = page();
    const first = new FakeButton();
    const example = new FakeButton();
    const disabled = Object.assign(new FakeButton(), { disabled: true });
    press(first);
    press(example);
    press(disabled);
    const replay = takeStartupClick(root);
    // Presses from hydration on belong to React.
    press(first);
    replay();
    replay();
    expect(example.click).toHaveBeenCalledTimes(1);
    expect(first.click).not.toHaveBeenCalled();
    expect(disabled.click).not.toHaveBeenCalled();
  });

  it("does nothing without a press, or when the button left the page or was disabled", () => {
    const quiet = page();
    takeStartupClick(quiet.root)();
    const { root, press } = page();
    const gone = new FakeButton();
    press(gone);
    const replay = takeStartupClick(root);
    gone.isConnected = false;
    replay();
    expect(gone.click).not.toHaveBeenCalled();
  });
});
