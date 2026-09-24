import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("export-dialog-flow [feature-7-12]", () => {
  it("export-dialog-flow behavior", async () => {
    // Execute the real shared component with a small deterministic hook dispatcher.
    // UI primitives are element stubs; callbacks/state and browser prefs are real.
    const hookSource = `export const useState=(value)=>globalThis.__exportDialogHooks.state(value);export const useEffect=()=>{};export const useSyncExternalStore=(_,get)=>get();`;
    const result = await build({
      entryPoints: ["apps/editor/src/components/dialogs/export-file-dialog/index.tsx"],
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "dialog-harness",
          setup(build) {
            build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "harness" }));
            build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
              path: "jsx",
              namespace: "harness",
            }));
            build.onResolve(
              { filter: /^\$\/managers\/dialogs\/export-file-dialog-model$/ },
              () => ({ path: "export-file-model", namespace: "harness" }),
            );
            build.onResolve(
              { filter: /^\$\/components\/(?:dialogs\/)?(form-dialog|alert)$/ },
              (args) => ({
                path: args.path.slice("$/components/".length),
                namespace: "harness",
              }),
            );
            build.onResolve({ filter: /\/ui\/(form-dialog|alert)$/ }, (args) => ({
              path: args.path,
              namespace: "harness",
            }));
            build.onResolve({ filter: /\.css$/ }, (args) => ({
              path: args.path,
              namespace: "styles",
            }));
            build.onLoad({ filter: /.*/, namespace: "harness" }, (args) => ({
              contents:
                args.path === "react"
                  ? hookSource
                  : args.path === "jsx"
                    ? `export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`
                    : args.path === "export-file-model"
                      ? `export const MAX_EXPORT_LOOP_COUNT=65536;export const MAX_WEBP_EXPORT_LOOP_COUNT=65535;export const ExportOutputFormat={Png:"png",Gif:"gif",Apng:"apng",Jpeg:"jpg",Webp:"webp"};export const ExportTagDirection={Forward:"forward",Reverse:"reverse",PingPong:"ping-pong",PingPongReverse:"ping-pong-reverse"};export function useExportFileDialogModel(){const document=globalThis.__exportDialogDocument;return{document,imageEncoding:globalThis.__exportImageEncoding??{jpeg:true,webp:true,webpLossless:true,webpLossy:true,checked:true},createInitialOptions:()=>({name:"animation.gif",scalePercent:100,area:"canvas",layers:"visible",frame:0,frames:"all",loopCount:document.loopCount}),inspect:()=>({valid:true,frameCount:2})}}`
                      : `export function FormDialog(){};export function Alert(){}`,
              loader: "js",
            }));
            build.onLoad({ filter: /.*/, namespace: "styles" }, () => ({
              contents: "export default {};",
              loader: "js",
            }));
          },
        },
      ],
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "export-dialog-flow-")),
      bundle = path.join(directory, "dialog.mjs");
    fs.writeFileSync(bundle, result.outputFiles[0].contents);
    const { ExportFileDialog } = await import(pathToFileURL(bundle).href);
    fs.rmSync(directory, { recursive: true, force: true });
    const saved = new Map(),
      previousStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => saved.get(k) ?? null,
      setItem: (k, v) => saved.set(k, v),
    };
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const document = {
      name: "animation.aseprite",
      width: 1,
      height: 1,
      hasSelection: false,
      activeFrame: 0,
      indexed: false,
      opaqueIndexed: false,
      tags: [],
      pixelWidth: 1,
      pixelHeight: 1,
      selection: null,
      layer: { name: "Layer", pixels: image, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "one", name: "Layer", visible: true, locked: false, flags: 3, opacity: 255 },
        ],
        frames: [
          { duration: 100, cels: [] },
          { duration: 100, cels: [] },
        ],
      },
    };
    Object.assign(globalThis, { __exportDialogDocument: document });
    function mount() {
      let state = [],
        cursor = 0,
        closed = 0,
        exports = [];
      globalThis.__exportDialogHooks = {
        state(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
          return [
            state[i],
            (value) => (state[i] = typeof value === "function" ? value(state[i]) : value),
          ];
        },
      };
      return {
        render() {
          cursor = 0;
          return ExportFileDialog({
            onClose: () => closed++,
            onExport: (o) => exports.push(o),
            documentKey: "test-slot",
          }).props;
        },
        get closed() {
          return closed;
        },
        exports,
      };
    }
    for (const reason of ["button", "escape-or-close"]) {
      const dialog = mount();
      let p = dialog.render();
      assert.equal(p.title, "Export File");
      p.actions.find((a) => a.label === "Export").onClick();
      p = dialog.render();
      assert.equal(p.title, "GIF Options");
      p.fields.find((f) => f.key === "dontShow").onChange(true);
      p.fields.find((f) => f.key === "interlaced").onChange(true);
      p = dialog.render();
      if (reason === "button") p.actions.find((a) => a.label === "Cancel").onClick();
      else p.onOpenChange(false);
      assert.equal(dialog.closed, 1, `${reason} exits the whole export flow`);
      assert.equal(dialog.exports.length, 0);
      assert.equal(saved.size, 0, `${reason} discards all GIF format drafts including Don't Show`);
    }
    const accepted = mount();
    accepted
      .render()
      .actions.find((a) => a.label === "Export")
      .onClick();
    let p = accepted.render();
    p.fields.find((f) => f.key === "dontShow").onChange(true);
    p.fields.find((f) => f.key === "interlaced").onChange(true);
    p.fields.find((f) => f.key === "loop").onChange(false);
    p = accepted.render();
    p.actions.find((a) => a.label === "OK").onClick();
    assert.equal(accepted.closed, 0);
    assert.equal(accepted.exports.length, 1);
    assert.equal(accepted.exports[0].gifInterlaced, true);
    assert.equal(accepted.exports[0].loopCount, 1);
    assert.equal(saved.size, 1);
    const next = mount();
    next
      .render()
      .actions.find((a) => a.label === "Export")
      .onClick();
    assert.equal(next.exports.length, 1, "global Dont Show skips GIF Options next time");
    assert.equal(next.exports[0].gifInterlaced, true);
    assert.equal(next.exports[0].loopCount, 1);
    const countedDocument = document as typeof document & { loopCount?: number };
    countedDocument.loopCount = 3;
    const counted = mount();
    let countDraft = counted.render();
    assert.equal(countDraft.fields.find((field) => field.key === "loopCount").value, 3);
    countDraft.fields.find((field) => field.key === "loopCount").onChange(5);
    countDraft = counted.render();
    countDraft.actions.find((action) => action.label === "Export").onClick();
    assert.equal(counted.exports[0].loopCount, 5);
    assert.equal(
      "loop" in counted.exports[0],
      false,
      "the numeric count is the sole export policy",
    );
    delete countedDocument.loopCount;
    for (const format of ["jpg", "webp"]) {
      const staticDialog = mount();
      let draft = staticDialog.render();
      draft.fields.find((field) => field.key === "format").onChange(format);
      draft = staticDialog.render();
      const frameField = draft.fields.find((field) => field.key === "frames");
      assert.equal(frameField.value, format === "jpg" ? "current" : "all");
      assert.equal(
        frameField.options.find((option) => option.value === "all").disabled,
        format === "jpg",
      );
      assert.equal(
        frameField.options.find((option) => option.value === "selected").disabled,
        format === "jpg",
      );
      assert.equal(draft.fields.find((field) => field.key === "anidir").disabled, format === "jpg");
      if (format === "webp")
        draft.fields.find((field) => field.key === "webpCompression").onChange("lossy");
      draft.actions.find((action) => action.label === "Export").onClick();
      draft = staticDialog.render();
      assert.equal(draft.title, format === "jpg" ? "JPEG Options" : "WebP Options");
      draft.fields.find((field) => field.key === "quality").onChange(72);
      if (format === "jpg")
        draft.fields.find((field) => field.key === "jpegMatte").onChange("#12345680");
      draft = staticDialog.render();
      draft.actions.find((action) => action.label === "Cancel").onClick();
      assert.equal(staticDialog.exports.length, 0);
      assert.equal(saved.size, 1, "canceling image options never persists format drafts");
      draft = staticDialog.render();
      draft.actions.find((action) => action.label === "Export").onClick();
      draft = staticDialog.render();
      draft.actions.find((action) => action.label === "Export").onClick();
      assert.equal(staticDialog.exports.length, 1);
      assert.equal(staticDialog.exports[0].frames, format === "jpg" ? "current" : "all");
      assert.equal(staticDialog.exports[0].name, `animation.${format}`);
      assert.equal(staticDialog.exports[0].imageQualityPercent, 72);
      if (format === "jpg") assert.equal(staticDialog.exports[0].ignoreEmpty, false);
      else assert.equal(staticDialog.exports[0].webpCompression, "lossy");
      assert.equal(staticDialog.exports[0].forTwitter, false);
      if (format === "jpg") assert.equal(staticDialog.exports[0].jpegMatte, "#123456");
      assert.equal(
        saved.size,
        1,
        "image preferences are committed by the manager after a successful save",
      );
    }
    globalThis.__exportImageEncoding = { jpeg: false, webp: false, checked: true };
    const unsupportedFormats = mount()
      .render()
      .fields.find((field) => field.key === "format").options;
    for (const format of ["jpg", "webp"]) {
      const option = unsupportedFormats.find((option) => option.value === format);
      assert.equal(option.disabled, true);
      assert.match(option.label, /unavailable in this browser/);
    }
    delete globalThis.__exportImageEncoding;
    globalThis.localStorage = previousStorage;
    delete globalThis.__exportDialogHooks;
    console.log(
      "Real shared Export dialog callbacks: GIF Cancel/Escape exit to canvas without prefs/export; OK persists global settings and Dont Show skips the next format dialog.",
    );
  }, 60_000);
});
