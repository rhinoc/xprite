import { describe, expect, it } from "vitest";

import {
  beadFileName,
  defaultBeadFileStem,
  sanitizeBeadFileStem,
} from "$/import-export/beads/file-name";

describe("bead output file names", () => {
  it("removes folders, reserved and control characters, output extensions and edge dots", () => {
    expect(sanitizeBeadFileStem("../hero/pattern")).toBe("hero-pattern");
    expect(sanitizeBeadFileStem('a<b>c:"d|e?f*g')).toBe("a-b-c-d-e-f-g");
    expect(sanitizeBeadFileStem("name\u0000\u0007end")).toBe("name-end");
    expect(sanitizeBeadFileStem("  chart.PDF  ")).toBe("chart");
    expect(sanitizeBeadFileStem("...hidden...")).toBe("hidden");
    expect(sanitizeBeadFileStem("many   spaces")).toBe("many spaces");
    expect(sanitizeBeadFileStem("x".repeat(300))).toHaveLength(120);
    expect(sanitizeBeadFileStem("拼豆 图纸")).toBe("拼豆 图纸");
  });
  it("falls back when nothing usable remains", () => {
    expect(beadFileName("///", "pdf", "sprite")).toBe("sprite-beads.pdf");
    expect(beadFileName("hero.png", "png", "sprite")).toBe("hero.png");
    expect(defaultBeadFileStem("hero.aseprite", "sprite")).toBe("hero-beads");
    expect(defaultBeadFileStem(".aseprite", "sprite")).toBe("sprite-beads");
    expect(defaultBeadFileStem("a/b:c.png", "sprite")).toBe("a-b-c-beads");
  });
});
