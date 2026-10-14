import { describe, expect, it } from "vitest";

import {
  WINDOW_SHADE_STORAGE_PREFIX,
  initialWindowShade,
  readWindowShade,
  writeWindowShade,
} from "$/managers/window-shade/window-shade";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("tool window shade", () => {
  it("remembers each window per tool", () => {
    const storage = memoryStorage();
    writeWindowShade(storage, "/tools/viewer/", "help", true);
    writeWindowShade(storage, "/tools/viewer/", "animation", false);
    writeWindowShade(storage, "/tools/pixelate/", "help", false);
    expect(readWindowShade(storage, "/tools/viewer/")).toEqual({ help: true, animation: false });
    expect(readWindowShade(storage, "/tools/pixelate/")).toEqual({ help: false });
    expect(readWindowShade(storage, "/tools/fuse-beads/")).toEqual({});
  });

  it("ignores missing, corrupt or foreign stored values", () => {
    const storage = memoryStorage();
    expect(readWindowShade(undefined, "/tools/viewer/")).toEqual({});
    storage.values.set(`${WINDOW_SHADE_STORAGE_PREFIX}/tools/viewer/`, "{oops");
    expect(readWindowShade(storage, "/tools/viewer/")).toEqual({});
    storage.values.set(
      `${WINDOW_SHADE_STORAGE_PREFIX}/tools/viewer/`,
      '{"help":"yes","main":true}',
    );
    expect(readWindowShade(storage, "/tools/viewer/")).toEqual({ main: true });
    expect(() => writeWindowShade(undefined, "/tools/viewer/", "help", true)).not.toThrow();
  });

  it("rolls up optional windows on cramped screens unless the user chose otherwise", () => {
    const base = { stored: undefined, defaultCollapsed: false, collapseWhenCramped: true };
    expect(initialWindowShade({ ...base, cramped: true })).toBe(true);
    expect(initialWindowShade({ ...base, cramped: false })).toBe(false);
    expect(initialWindowShade({ ...base, cramped: true, stored: false })).toBe(false);
    expect(
      initialWindowShade({ ...base, collapseWhenCramped: false, cramped: true, stored: undefined }),
    ).toBe(false);
    expect(
      initialWindowShade({ ...base, defaultCollapsed: true, cramped: false, stored: undefined }),
    ).toBe(true);
  });
});
