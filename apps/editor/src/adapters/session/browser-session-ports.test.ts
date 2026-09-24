import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("session-browser-ports", () => {
  it("session-browser-ports behavior", async () => {
    const pixels = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([1, 2, 3, 255]),
    };
    const calls = [];
    globalThis.__sessionPortsTest = { pixels, calls };
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/adapters/session/browser-session-ports.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      plugins: [
        {
          name: "browser-port-boundaries",
          setup(builder) {
            builder.onResolve(
              { filter: /^\$\/(adapters\/files\/images|adapters\/workers\/import-client)$/ },
              (args) => ({
                path: args.path,
                namespace: "session-port-stub",
              }),
            );
            builder.onLoad({ filter: /.*/, namespace: "session-port-stub" }, (args) => ({
              loader: "js",
              contents:
                args.path === "$/adapters/files/images"
                  ? `
    const {calls,pixels}=globalThis.__sessionPortsTest;
    export const SavePngMode={Auto:'auto',Picker:'picker',Download:'download'};
    export function decodeImage(file){calls.push(['file',file]);return Promise.resolve(pixels);}
    export function decodeAsset(url){calls.push(['asset',url]);return Promise.resolve(pixels);}
    export function savePng(image,name,options){calls.push(['write',image,name,options]);return Promise.resolve({method:'download',name});}
  `
                  : `
    const {calls,pixels}=globalThis.__sessionPortsTest;
    export class ImageImportWorkerClient {
      constructor(){calls.push(['worker']);}
      analyze(image){calls.push(['analyze',image]);return Promise.resolve({classification:'likely-pixel-art'});}
      pixelate(image,options){calls.push(['pixelate',image,options]);return Promise.resolve(pixels);}
      close(){calls.push(['close']);}
    }
  `,
            }));
          },
        },
      ],
    });
    const { BrowserSessionPorts } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
    );
    try {
      const ports = new BrowserSessionPorts();
      assert.equal(calls.length, 0, "constructing ports has no browser side effects");
      const file = new File(["pixels"], "sample.png", { type: "image/png" }),
        source = ports.registerFile(file);
      assert.equal(source.name, file.name);
      assert.equal(typeof source.source, "string");
      assert.equal(await ports.decode(source.source), pixels);
      assert.equal(calls[0][1], file);
      ports.releaseSource(source.source);
      await assert.rejects(ports.decode(source.source), /no longer available/);
      const asset = ports.registerAsset("/fixture.png", "Fixture.png");
      assert.notEqual(asset.source, source.source);
      await ports.decode(asset.source);
      assert.equal(calls.at(-1)[1], "/fixture.png");
      assert.equal(calls.filter((c) => c[0] === "worker").length, 0);
      await ports.analyze(pixels);
      await ports.pixelate(pixels, { targetWidth: 1 });
      assert.equal(calls.filter((c) => c[0] === "worker").length, 1, "worker lazily reused");
      for (const intent of ["save", "save-as", "export"]) {
        const count = calls.length,
          result = ports.write(pixels, "a.png", intent);
        assert.equal(calls.length, count + 1, "write called synchronously in activation stack");
        assert.equal(calls.at(-1)[3].mode, intent === "export" ? "download" : "auto");
        await result;
      }
      ports.dispose();
      ports.dispose();
      assert.equal(calls.filter((c) => c[0] === "close").length, 1);
      assert.throws(() => ports.registerFile(file), /closed/);
      assert.throws(() => ports.analyze(pixels), /closed/);
      await assert.rejects(ports.decode(asset.source), /no longer available/);
      await assert.rejects(ports.write(pixels, "late.png", "save"), /closed/);
      console.log(
        "Session browser ports: source handles, lazy worker, synchronous write, and disposal verified.",
      );
    } finally {
      delete globalThis.__sessionPortsTest;
    }
  }, 60_000);
});
