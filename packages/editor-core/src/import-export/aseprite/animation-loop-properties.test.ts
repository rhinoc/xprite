import { describe, expect, it } from "vitest";

import {
  parseAnimationLoopMetadata,
  withAnimationLoopMetadata,
} from "$/import-export/aseprite/animation-loop-properties";
import {
  AsepriteUserPropertyType,
  decodeAsepriteUserPropertyMaps,
  encodeAsepriteUserPropertyMaps,
} from "$/import-export/aseprite/user-properties";

describe("animation play-count properties", () => {
  it("preserves user text, colors, properties and other extension maps without reusing their IDs", () => {
    const files = [{ id: 1, type: 2, fileName: "other-extension" }];
    const maps = [
      {
        key: 0,
        properties: [
          {
            name: "author",
            value: { type: AsepriteUserPropertyType.String as const, value: "Pixel Artist" },
          },
        ],
      },
      {
        key: 1,
        properties: [
          { name: "setting", value: { type: AsepriteUserPropertyType.Int32 as const, value: 42 } },
        ],
      },
    ];
    const userData = {
      text: "Keep this text",
      color: [1, 2, 3, 255] as [number, number, number, number],
      properties: encodeAsepriteUserPropertyMaps(maps),
    };
    const before = structuredClone(userData);
    const result = withAnimationLoopMetadata(files, userData, 3);
    expect(result.externalFiles?.find((file) => file.fileName === "xprite")?.id).toBe(2);
    expect(result.userData?.text).toBe(userData.text);
    expect(result.userData?.color).toEqual(userData.color);
    expect(decodeAsepriteUserPropertyMaps(result.userData!.properties!).slice(0, 2)).toEqual(maps);
    expect(parseAnimationLoopMetadata(result)).toBe(3);
    expect(userData).toEqual(before);
    expect(files).toHaveLength(1);
    const updated = withAnimationLoopMetadata(result.externalFiles, result.userData, 5);
    expect(parseAnimationLoopMetadata(updated)).toBe(5);
    expect(updated.externalFiles).toHaveLength(2);
    expect(decodeAsepriteUserPropertyMaps(updated.userData!.properties!)).toHaveLength(3);
    const removed = withAnimationLoopMetadata(updated.externalFiles, updated.userData, undefined);
    expect(parseAnimationLoopMetadata(removed)).toBeUndefined();
    expect(decodeAsepriteUserPropertyMaps(removed.userData!.properties!)).toEqual(maps);
  });
  it("keeps legacy opaque property bytes untouched when the file has no loop policy", () => {
    const userData = { properties: new Uint8Array([123, 45, 67]) };
    const result = withAnimationLoopMetadata(undefined, userData, undefined);
    expect(result.userData).toBe(userData);
    expect(parseAnimationLoopMetadata(result)).toBeUndefined();
    expect(() => withAnimationLoopMetadata(undefined, undefined, 65537)).toThrow();
  });
});
