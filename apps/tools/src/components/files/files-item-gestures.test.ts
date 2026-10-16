import { describe, expect, it } from "vitest";

import {
  FOLDER_NAV_SUPPRESS_MS,
  createFolderNavGate,
  opensOnPrimaryClick,
} from "$/components/files/files-item-gestures";

describe("opensOnPrimaryClick", () => {
  it("opens on touch and pen, not mouse", () => {
    expect(opensOnPrimaryClick("touch")).toBe(true);
    expect(opensOnPrimaryClick("pen")).toBe(true);
    expect(opensOnPrimaryClick("mouse")).toBe(false);
    expect(opensOnPrimaryClick(undefined)).toBe(false);
  });
});

describe("createFolderNavGate", () => {
  it("suppresses activations briefly after arm", () => {
    let t = 1000;
    const gate = createFolderNavGate(() => t);
    expect(gate.suppressed()).toBe(false);
    gate.arm();
    expect(gate.suppressed()).toBe(true);
    t += FOLDER_NAV_SUPPRESS_MS - 1;
    expect(gate.suppressed()).toBe(true);
    t += 1;
    expect(gate.suppressed()).toBe(false);
  });
});
