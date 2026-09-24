import { describe, expect, it, vi } from "vitest";

import { exportDocumentAnimation, repeatLastExport } from "$/managers/files/export-animation";
import {
  ImageExportFormat,
  readImageExportPreferences,
} from "$/managers/files/export-format-preferences";
import { lastDocumentExport } from "$/managers/files/export-preferences";
import type { WebpExportPort } from "$/managers/ports/webp-export";
import { DocumentPreferencesManager } from "$/managers/preferences/document-preferences";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  assembleWebpAnimation,
  encodeWebpLossless,
  parseWebpAnimation,
  rasterAnimationProject,
  WebpCompression,
} from "@xprite/editor-core/import-export";

function document(): EditorDocument {
  const project = rasterAnimationProject({
    width: 1,
    height: 1,
    loopCount: 3,
    frames: [255, 20].map((red, index) => ({
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray([red, 0, 0, 128]) },
      durationMs: index ? 81 : 37,
    })),
  });
  return {
    name: "source.aseprite",
    width: 1,
    height: 1,
    timeline: project.timeline,
    selection: null,
    layer: { name: "Layer 1", pixels: project.image, x: 0, y: 0, visible: true, locked: false },
  };
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const options = {
  name: "result.webp",
  scalePercent: 100,
  area: "canvas" as const,
  layers: "visible" as const,
  frame: 0,
  frames: "all" as const,
  webpCompression: WebpCompression.Lossless,
};

describe("WebP export workflow", () => {
  it("delivers all frames, remembers only successful settings and repeats through the same port", async () => {
    const source = document(),
      before = structuredClone(source),
      store = storage(),
      preferences = new DocumentPreferencesManager(store);
    const rememberExport = (record: Parameters<DocumentPreferencesManager["setExport"]>[1]) =>
      preferences.setExport("slot", record);
    const getLastExport = () => lastDocumentExport(preferences.get("slot").exports ?? {});
    const encode = vi.fn<WebpExportPort["encode"]>(
      async (frames, settings) =>
        new Blob(
          [
            assembleWebpAnimation(
              frames.map((frame) => ({
                bytes: encodeWebpLossless(frame.pixels),
                duration: frame.duration,
              })),
              1,
              1,
              settings.loopCount,
            ).buffer as ArrayBuffer,
          ],
          { type: "image/webp" },
        ),
    );
    const webp = { supportsLossless: () => true, encode },
      save = vi.fn(async () => {});
    const result = await exportDocumentAnimation(source, options, {
      webp,
      save,
      storage: store,
      rememberExport,
    });
    expect(encode.mock.calls[0][0]).toHaveLength(2);
    expect(encode.mock.calls[0][1]).toMatchObject({
      animated: true,
      loopCount: 3,
      compression: WebpCompression.Lossless,
    });
    expect(
      parseWebpAnimation(new Uint8Array(await result.artifacts[0].blob.arrayBuffer()))?.frames.map(
        (frame) => frame.durationMs,
      ),
    ).toEqual([37, 81]);
    expect(readImageExportPreferences(ImageExportFormat.Webp, store).webpCompression).toBe(
      WebpCompression.Lossless,
    );
    expect(getLastExport()?.options).toMatchObject(options);
    expect(lastDocumentExport(preferences.get("other-slot").exports ?? {})).toBeNull();
    expect(source).toEqual(before);
    await repeatLastExport(source, { webp, save, storage: store, rememberExport, getLastExport });
    expect(encode).toHaveBeenCalledTimes(2);
    const failure = {
      supportsLossless: () => true,
      encode: vi.fn(async () => {
        throw new Error("Encoder failed");
      }),
    };
    await expect(
      exportDocumentAnimation(
        source,
        { ...options, webpCompression: WebpCompression.Lossy },
        { webp: failure, save, storage: store, rememberExport },
      ),
    ).rejects.toThrow("Encoder failed");
    expect(readImageExportPreferences(ImageExportFormat.Webp, store).webpCompression).toBe(
      WebpCompression.Lossless,
    );
    expect(getLastExport()?.options).toMatchObject(options);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("captures frame pixels and play count before asynchronous encoding, and treats current-frame output as static", async () => {
    const source = document();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured!: Parameters<WebpExportPort["encode"]>[0];
    let settings!: Parameters<WebpExportPort["encode"]>[1];
    const webp: WebpExportPort = {
      supportsLossless: () => true,
      async encode(frames, config) {
        captured = frames;
        settings = config;
        await gate;
        return new Blob(
          [
            assembleWebpAnimation(
              frames.map((frame) => ({
                bytes: encodeWebpLossless(frame.pixels),
                duration: frame.duration,
              })),
              1,
              1,
              config.loopCount,
            ).buffer as ArrayBuffer,
          ],
          { type: "image/webp" },
        );
      },
    };
    const pending = exportDocumentAnimation(source, options, { webp, save: async () => {} });
    source.timeline!.loopCount = 1;
    source.layer.pixels.data[0] = 12;
    expect(captured[0].pixels.data[0]).toBe(255);
    expect(settings.loopCount).toBe(3);
    release();
    await pending;
    const single = {
      supportsLossless: () => true,
      encode: vi.fn<WebpExportPort["encode"]>(
        async (frames) =>
          new Blob([encodeWebpLossless(frames[0].pixels).buffer as ArrayBuffer], {
            type: "image/webp",
          }),
      ),
    };
    await exportDocumentAnimation(
      source,
      { ...options, frames: "current" },
      { webp: single, save: async () => {} },
    );
    expect(single.encode.mock.calls[0][0]).toHaveLength(1);
    expect(single.encode.mock.calls[0][1].animated).toBe(false);
  });
});
