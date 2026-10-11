import { describe, expect, it } from "vitest";

import { createJsonStorage, JsonWriteResult } from "$/json-storage";

describe("JSON storage persistence", () => {
  it("retries a non-throwing failed write after storage becomes available", () => {
    const values = new Map<string, string>();
    let available = false;
    const storage = createJsonStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (!available) return false;
        values.set(key, value);
        return true;
      },
    });
    const preferences = { enabled: true };
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Unavailable);
    expect(values.has("preferences")).toBe(false);
    available = true;
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Saved);
    expect(storage.readJson("preferences")).toEqual(preferences);
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Unchanged);
  });

  it("restores a record changed or removed outside this storage facade", () => {
    const values = new Map<string, string>();
    const storage = createJsonStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        values.set(key, value);
      },
    });
    const preferences = { enabled: true };
    storage.writeJson("preferences", preferences);
    values.delete("preferences");
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Saved);
    values.set("preferences", "invalid JSON");
    expect(storage.readJson("preferences")).toBeNull();
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Saved);
    values.delete("preferences");
    expect(storage.readJson("preferences")).toBeNull();
    expect(storage.writeJson("preferences", preferences)).toBe(JsonWriteResult.Saved);
  });

  it("retains the durable value when a later write fails", () => {
    const values = new Map<string, string>();
    let available = true;
    const storage = createJsonStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (!available) return false;
        values.set(key, value);
        return true;
      },
    });
    const saved = { enabled: false };
    storage.writeJson("preferences", saved);
    available = false;
    expect(storage.writeJson("preferences", { enabled: true })).toBe(JsonWriteResult.Unavailable);
    expect(storage.writeJson("preferences", saved)).toBe(JsonWriteResult.Unchanged);
    expect(storage.readJson("preferences")).toEqual(saved);
  });
});
