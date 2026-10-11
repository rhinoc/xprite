import { describe, expect, it, vi } from "vitest";

import {
  ExporterRegistry,
  registerExporter,
  type ExporterContext,
  type ExporterDefinition,
} from "$/managers/files/exporter-registry";

const context = {
  document: { width: 1, height: 1 },
  preferences: { options: { craft: { code: "A1" } } },
} as unknown as ExporterContext;
function module(execute: ExporterDefinition<string, { code: string }>["execute"], enabled = true) {
  return registerExporter(
    {
      id: "craft",
      label: () => "Craft",
      initialSize: { width: 1, height: 1 },
      available: () => enabled,
      normalizeOptions(value) {
        return value &&
          typeof value === "object" &&
          typeof (value as { code?: unknown }).code === "string"
          ? (value as { code: string })
          : null;
      },
      createSource: (_context, options) => options?.code ?? "default",
      execute,
    },
    () => null,
  );
}

describe("exporter registry", () => {
  it("handles removal and malformed saved settings through module contracts", () => {
    const registry = new ExporterRegistry([module(async () => ({ names: [] }))]);
    expect(registry.get("craft")!.canRepeat(context, { code: "A1" })).toBe(true);
    expect(registry.get("craft")!.canRepeat(context, { code: 1 })).toBe(false);
    expect(new ExporterRegistry([]).available("craft", context)).toBe(false);
    expect(
      new ExporterRegistry([module(async () => ({ names: [] }), false)]).firstAvailable(context),
    ).toBeUndefined();
  });
  it("captures settings before async saving and remembers them only after success", async () => {
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const saved = vi.fn();
    const registry = new ExporterRegistry([
      module(async (_context, options) => {
        await gate;
        return { names: [options.code] };
      }),
    ]);
    const draft = { code: "A1" };
    const pending = registry.execute("craft", context, draft, { rememberExport: saved });
    draft.code = "A2";
    expect(saved).not.toHaveBeenCalled();
    complete();
    expect(await pending).toEqual({ names: ["A1"] });
    expect(saved).toHaveBeenCalledWith({ exporter: "craft", options: { code: "A1" } });
    const failing = new ExporterRegistry([
      module(async () => {
        throw new Error("Save failed");
      }),
    ]);
    await expect(
      failing.execute("craft", context, draft, { rememberExport: saved }),
    ).rejects.toThrow("Save failed");
    expect(saved).toHaveBeenCalledTimes(1);
  });
});
