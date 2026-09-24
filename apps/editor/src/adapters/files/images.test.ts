import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("browser-images", () => {
  it("browser-images behavior", async () => {
    // The file workflows use browser globals only at call time. This verifier
    // supplies a small canvas/document shim so their edge cases can be exercised
    // in CI without opening a browser or downloading a file.
    const compiled = await Promise.all(
      ["./images.ts", "../rendering/bitmap-font.ts"].map((relative) =>
        build({
          entryPoints: [fileURLToPath(new URL(relative, import.meta.url))],
          bundle: true,
          platform: "node",
          format: "esm",
          write: false,
        }),
      ),
    );
    const [imageCode, fontCode] = compiled.map((result) => result.outputFiles[0].text);
    const images = await import(
      `data:text/javascript;base64,${Buffer.from(imageCode).toString("base64")}`
    );
    const fonts = await import(
      `data:text/javascript;base64,${Buffer.from(fontCode).toString("base64")}`
    );

    const original = {
      document: globalThis.document,
      Image: globalThis.Image,
      OffscreenCanvas: globalThis.OffscreenCanvas,
      createImageBitmap: globalThis.createImageBitmap,
      showSaveFilePicker: globalThis.showSaveFilePicker,
      URL: globalThis.URL,
      location: globalThis.location,
      fetch: globalThis.fetch,
    };

    let canvasContexts = [];
    let canvasBlobs = [];
    let anchors = [];
    let createdUrls = [];
    let revokedUrls = [];

    class FakeContext {
      constructor({ pixels = new Uint8ClampedArray(), failRead = false } = {}) {
        this.pixels = pixels;
        this.failRead = failRead;
        this.lastImageData = null;
        this.imageSmoothingEnabled = true;
      }
      createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      }
      putImageData(imageData) {
        this.lastImageData = imageData;
      }
      getImageData() {
        if (this.failRead) throw new Error("readback blocked");
        return { data: this.pixels };
      }
      drawImage() {}
    }

    class FakeCanvas {
      constructor(width, height, contextOptions = {}) {
        this.width = width;
        this.height = height;
        this.context = new FakeContext(contextOptions);
        canvasContexts.push(this.context);
      }
      getContext() {
        return this.context;
      }
      toBlob(callback) {
        const blob = new Blob([JSON.stringify([...(this.context.lastImageData?.data ?? [])])], {
          type: "image/png",
        });
        canvasBlobs.push(blob);
        callback(blob);
      }
    }

    function setDocument() {
      globalThis.document = {
        createElement(kind) {
          if (kind === "canvas") return new FakeCanvas(0, 0);
          if (kind === "a") {
            const anchor = {
              href: "",
              download: "",
              rel: "",
              clicked: false,
              click() {
                this.clicked = true;
              },
              remove() {},
            };
            anchors.push(anchor);
            return anchor;
          }
          if (kind === "img") {
            const image = { naturalWidth: 2, naturalHeight: 1, onload: null, onerror: null };
            Object.defineProperty(image, "src", {
              set() {
                queueMicrotask(() => image.onload?.());
              },
            });
            return image;
          }
          throw new Error(`unexpected element ${kind}`);
        },
      };
    }

    function setObjectUrls() {
      class TestURL extends original.URL {}
      TestURL.createObjectURL = (value) => {
        const url = `blob:verify-${createdUrls.length}`;
        createdUrls.push({ url, value });
        return url;
      };
      TestURL.revokeObjectURL = (url) => {
        revokedUrls.push(url);
      };
      globalThis.URL = TestURL;
    }

    function resetCounters() {
      canvasContexts = [];
      canvasBlobs = [];
      anchors = [];
      createdUrls = [];
      revokedUrls = [];
    }

    function restoreGlobals() {
      globalThis.document = original.document;
      globalThis.Image = original.Image;
      globalThis.OffscreenCanvas = original.OffscreenCanvas;
      globalThis.createImageBitmap = original.createImageBitmap;
      globalThis.showSaveFilePicker = original.showSaveFilePicker;
      globalThis.URL = original.URL;
      globalThis.location = original.location;
      globalThis.fetch = original.fetch;
    }

    let checks = 0;
    function check(value, expected) {
      assert.deepEqual(value, expected);
      checks += 1;
    }
    async function rejects(promise, predicate) {
      await assert.rejects(promise, predicate);
      checks += 1;
    }

    try {
      setDocument();
      setObjectUrls();

      // createImageBitmap is preferred, and the resource is closed even when the
      // decoded dimensions are rejected before a canvas is allocated.
      let closeCount = 0;
      globalThis.OffscreenCanvas = FakeCanvas;
      globalThis.createImageBitmap = async () => ({
        width: 20,
        height: 1,
        close() {
          closeCount += 1;
        },
      });
      await rejects(
        images.decodeImage(new Blob(["x"], { type: "image/png" }), { maxDimension: 10 }),
        (error) => error?.name === "ImageDimensionError" && /20 × 1/.test(error.message),
      );
      check(closeCount, 1);

      // A canvas/readback failure still closes the bitmap before the fallback is attempted.
      resetCounters();
      closeCount = 0;
      globalThis.OffscreenCanvas = class extends FakeCanvas {
        constructor(width, height) {
          super(width, height, { failRead: true });
        }
      };
      globalThis.createImageBitmap = async () => ({
        width: 1,
        height: 1,
        close() {
          closeCount += 1;
        },
      });
      await rejects(images.decodeImage(new Blob(["x"])), /Unable to decode image blob/);
      check(closeCount, 1);

      // With createImageBitmap absent, the object URL/Image path still returns RGBA pixels.
      resetCounters();
      globalThis.OffscreenCanvas = FakeCanvas;
      globalThis.createImageBitmap = undefined;
      // FakeCanvas' default readback is empty, so provide the fallback context's pixels.
      globalThis.OffscreenCanvas = class extends FakeCanvas {
        constructor(width, height) {
          super(width, height, { pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]) });
        }
      };
      const decoded = await images.decodeImage(new Blob(["x"], { type: "image/png" }));
      check(
        [decoded.width, decoded.height, [...decoded.data]],
        [2, 1, [1, 2, 3, 255, 4, 5, 6, 128]],
      );
      check(revokedUrls.length, 1);

      // decodeAsset keeps the convenience path same-origin and forwards the
      // response blob to the exact same decoder.
      globalThis.location = { href: "https://app.test/editor", origin: "https://app.test" };
      let fetched = null;
      globalThis.fetch = async (url, init) => {
        fetched = { url, init };
        return {
          ok: true,
          status: 200,
          url: "https://app.test/asset.png",
          async blob() {
            return new Blob(["x"], { type: "image/png" });
          },
        };
      };
      const asset = await images.decodeAsset("/asset.png");
      check([asset.width, asset.height], [2, 1]);
      check(fetched, { url: "/asset.png", init: { credentials: "same-origin" } });
      await rejects(images.decodeAsset("https://evil.test/asset.png"), /same-origin/);
      const inlineAsset = "data:image/png;base64,eA==";
      globalThis.fetch = async (url) => ({
        ok: true,
        status: 200,
        url,
        blob: async () => new Blob(["x"], { type: "image/png" }),
      });
      const inlineDecoded = await images.decodeAsset(inlineAsset);
      check([inlineDecoded.width, inlineDecoded.height], [2, 1]);
      await rejects(images.decodeAsset("data:text/html;base64,eA=="), /same-origin/);
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        url: "https://evil.test/asset.png",
        blob: async () => new Blob(["x"], { type: "image/png" }),
      });
      await rejects(images.decodeAsset(inlineAsset), /redirected off origin/);

      // HTML canvas encoding receives the exact clamped RGBA bytes and emits PNG.
      resetCounters();
      globalThis.OffscreenCanvas = undefined;
      globalThis.createImageBitmap = undefined;
      const sourcePixels = { width: 1, height: 1, data: new Uint8ClampedArray([9, 8, 7, 6]) };
      const encoded = await images.encodePng(sourcePixels);
      check(encoded.type, "image/png");
      check([...canvasContexts[0].lastImageData.data], [9, 8, 7, 6]);

      // Picker is called before its promise yields, preserving a save-button gesture.
      resetCounters();
      let pickerCalled = false;
      let pickerResolved = false;
      let writeCount = 0;
      globalThis.showSaveFilePicker = () => {
        pickerCalled = true;
        return new Promise((resolve) => {
          queueMicrotask(() => {
            pickerResolved = true;
            resolve({
              name: "picked.png",
              async createWritable() {
                return {
                  async write(blob) {
                    assert.equal(blob.type, "image/png");
                    writeCount += 1;
                  },
                  async close() {},
                };
              },
            });
          });
        });
      };
      const pickerPromise = images.savePng(sourcePixels, "sprite");
      // savePng invokes the picker synchronously before its first await.
      check(pickerCalled, true);
      const pickerResult = await pickerPromise;
      check(pickerCalled, true);
      check(pickerResolved, true);
      check(writeCount, 1);
      check(pickerResult, { method: "picker", name: "picked.png" });
      check(anchors.length, 0);

      // A write failure propagates after a picker opens; it must not silently
      // create a second download with a different destination.
      resetCounters();
      globalThis.showSaveFilePicker = async () => ({
        name: "broken.png",
        async createWritable() {
          return {
            async write() {
              throw new Error("disk full");
            },
            async close() {},
          };
        },
      });
      await rejects(images.savePng(sourcePixels, "broken"), /disk full/);
      check(anchors.length, 0);
      check(createdUrls.length, 0);

      // AbortError is preserved verbatim and never switches to a download.
      resetCounters();
      const abort = new DOMException("cancelled", "AbortError");
      globalThis.showSaveFilePicker = () => Promise.reject(abort);
      await rejects(images.savePng(sourcePixels, "cancel"), (error) => error === abort);
      check(anchors.length, 0);
      check(createdUrls.length, 0);

      // Explicit download mode bypasses an available picker and reuses PNG encoding.
      resetCounters();
      let forcedPickerCalled = false;
      globalThis.showSaveFilePicker = () => {
        forcedPickerCalled = true;
        throw new Error("download mode must not open a picker");
      };
      const forcedDownload = await images.savePng(sourcePixels, "forced", { mode: "download" });
      check(forcedDownload, { method: "download", name: "forced.png" });
      check(forcedPickerCalled, false);
      check(anchors[0].clicked, true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      check(revokedUrls, ["blob:verify-0"]);

      // No picker means a click download; URL revocation is deferred through the
      // download dispatch, then happens on the next task.
      resetCounters();
      globalThis.showSaveFilePicker = undefined;
      const downloadResult = await images.savePng(sourcePixels, "download");
      check(downloadResult, { method: "download", name: "download.png" });
      check(anchors[0].clicked, true);
      check(revokedUrls.length, 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      check(revokedUrls, ["blob:verify-0"]);

      // Atlas extraction preserves alpha and converts JSON code-point keys to text keys.
      const font = fonts.bitmapFontFromAtlas(
        { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 128, 0, 0, 0, 0]) },
        { 65: [0, 0, 2, 1] },
      );
      check(font.height, 1);
      check(font.glyphs.A.advance, 2);
      check([...font.glyphs.A.alpha], [128, 0]);
    } finally {
      restoreGlobals();
    }

    console.log(
      `${checks} browser image workflow checks passed: bitmap cleanup, dimension guards, Image fallback, PNG bytes, picker activation/cancellation, forced download mode, deferred download cleanup and glyph alpha conversion.`,
    );
  }, 60_000);
});
