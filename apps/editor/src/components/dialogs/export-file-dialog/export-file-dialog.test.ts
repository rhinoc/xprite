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
    const hookSource = `export const useState=(value)=>globalThis.__exportDialogHooks.state(value);export const useEffect=(fn,deps)=>globalThis.__exportDialogHooks.effect(fn,deps);export const useRef=(current)=>globalThis.__exportDialogHooks.ref(current);export const useSyncExternalStore=(_,get)=>get();`;
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
            build.onResolve({ filter: /^\$\/managers\/files\/export-file-options$/ }, () => ({
              path: "export-output-format",
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
                    : args.path === "export-output-format"
                      ? `export const ExportOutputFormat={Png:"png",Gif:"gif",Apng:"apng",Jpeg:"jpg",Webp:"webp"};`
                      : args.path === "export-file-model"
                        ? `export const MAX_EXPORT_LOOP_COUNT=65536;export const MAX_WEBP_EXPORT_LOOP_COUNT=65535;export const ExportTagDirection={Forward:"forward",Reverse:"reverse",PingPong:"ping-pong",PingPongReverse:"ping-pong-reverse"};export function useExportFileDialogModel(){const document=globalThis.__exportDialogDocument;return{document,imageEncoding:globalThis.__exportImageEncoding??{jpeg:true,webp:true,webpLossless:true,webpLossy:true,checked:true},createInitialOptions:()=>({name:"animation.gif",scalePercent:100,area:"canvas",layers:"visible",frame:0,frames:"all",loopCount:document.loopCount,...(globalThis.__exportInitialOptions??{})}),inspect:()=>globalThis.__exportInspection??({valid:true,frameCount:document.frameCount??2})}}`
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
      tags: [{ name: "Reveal" }],
      pixelWidth: 1,
      pixelHeight: 1,
      frameCount: 20,
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
    function mount(extraProps: Record<string, unknown> = {}) {
      const state: unknown[] = [];
      const refs: { current: unknown }[] = [];
      const effectDeps: (readonly unknown[] | undefined)[] = [];
      let stateCursor = 0,
        refCursor = 0,
        effectCursor = 0,
        closed = 0;
      const exports: Record<string, unknown>[] = [];
      const pendingEffects: (() => void)[] = [];
      globalThis.__exportDialogHooks = {
        state(initial: unknown) {
          const i = stateCursor++;
          if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
          return [
            state[i],
            (value: unknown) => (state[i] = typeof value === "function" ? value(state[i]) : value),
          ];
        },
        ref(initial: unknown) {
          const i = refCursor++;
          if (!(i in refs)) refs[i] = { current: initial };
          return refs[i];
        },
        effect(fn: () => void, deps?: readonly unknown[]) {
          const i = effectCursor++;
          const prev = effectDeps[i];
          const changed =
            !prev ||
            !deps ||
            deps.length !== prev.length ||
            deps.some((d, j) => !Object.is(d, prev[j]));
          if (changed) {
            effectDeps[i] = deps;
            pendingEffects.push(fn);
          }
        },
      };
      return {
        render(overrideProps: Record<string, unknown> = {}) {
          let result;
          for (let pass = 0; pass < 4; pass++) {
            stateCursor = 0;
            refCursor = 0;
            effectCursor = 0;
            pendingEffects.length = 0;
            result = ExportFileDialog({
              onClose: () => closed++,
              onExport: (o: Record<string, unknown>) => exports.push(o),
              documentKey: "test-slot",
              ...extraProps,
              ...overrideProps,
            }).props;
            if (!pendingEffects.length) break;
            const snapshot = [...state];
            for (const fn of pendingEffects.splice(0)) fn();
            if (state.every((value, index) => Object.is(value, snapshot[index]))) break;
          }
          return result;
        },
        get closed() {
          return closed;
        },
        exports,
      };
    }
    globalThis.__exportInspection = {
      valid: false,
      frameCount: 0,
      error: "Output 20480 × 2560 exceeds the limit. Reduce Resize (%).",
    };
    const rejected = mount();
    const invalidForm = rejected.render();
    assert.match(invalidForm.message, /20480 × 2560.*Reduce Resize/);
    assert.equal(invalidForm.actions.find((action) => action.label === "Export").disabled, true);
    invalidForm.actions.find((action) => action.label === "Export").onClick();
    assert.equal(rejected.exports.length, 0);
    delete globalThis.__exportInspection;
    for (const reason of ["button", "escape-or-close"]) {
      const dialog = mount();
      let p = dialog.render();
      assert.equal(p.title, "Export File");
      assert.equal(
        p.fields.some((f) => f.key === "loop"),
        false,
        "GIF omits redundant Animation Loop checkbox since Play Count controls looping",
      );
      assert.equal(
        p.fields.some((f) => f.key === "dontShow"),
        false,
        "1-step inline GIF flow omits step-2 Don't Show alert checkbox",
      );
      p.fields.find((f) => f.key === "interlaced").onChange(true);
      p = dialog.render();
      if (reason === "button") p.actions.find((a) => a.label === "Cancel").onClick();
      else p.onOpenChange(false);
      assert.equal(dialog.closed, 1, `${reason} exits the export flow`);
      assert.equal(dialog.exports.length, 0);
      assert.equal(saved.size, 0, `${reason} discards all inline GIF drafts without saving prefs`);
    }
    const accepted = mount();
    let p = accepted.render();
    p.fields.find((f) => f.key === "interlaced").onChange(true);
    p.fields.find((f) => f.key === "loopCount").onChange(1);
    p = accepted.render();
    p.actions.find((a) => a.label === "Export").onClick();
    assert.equal(accepted.closed, 0);
    assert.equal(accepted.exports.length, 1, "GIF exports in one step with inline options");
    assert.equal(accepted.exports[0].gifInterlaced, true);
    assert.equal(accepted.exports[0].loopCount, 1);
    assert.equal(saved.size, 1);
    const next = mount();
    const nextForm = next.render();
    assert.equal(nextForm.fields.find((f) => f.key === "interlaced").value, true);
    assert.equal(nextForm.fields.find((f) => f.key === "loopCount").value, 1);
    nextForm.actions.find((a) => a.label === "Export").onClick();
    assert.equal(next.exports.length, 1, "saved GIF preferences carry into the next export");
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
      assert.equal(
        draft.fields.some((field) => field.key === "interlaced"),
        false,
        `GIF-only options are hidden on ${format}`,
      );
      assert.equal(
        draft.fields.some((field) => field.key === "jpegMatte"),
        format === "jpg",
        `Background color picker is inline only for JPEG`,
      );
      if (format === "webp") {
        assert.equal(
          draft.fields.find((field) => field.key === "quality").disabled,
          true,
          "WebP quality is disabled in Lossless mode",
        );
        draft.fields.find((field) => field.key === "webpCompression").onChange("lossy");
        draft = staticDialog.render();
        assert.equal(draft.fields.find((field) => field.key === "quality").disabled, false);
      }
      draft.fields.find((field) => field.key === "quality").onChange(72);
      if (format === "jpg")
        draft.fields.find((field) => field.key === "jpegMatte").onChange("#12345680");
      draft = staticDialog.render();
      assert.equal(
        draft.actions.map((action) => action.label).join(","),
        "Export,Cancel",
        `${format} uses unified 1-step Export / Cancel actions`,
      );
      draft.actions.find((action) => action.label === "Export").onClick();
      assert.equal(staticDialog.exports.length, 1, `${format} exports in one step`);
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

    // Bug 1: Switching GIF -> JPEG -> APNG/GIF/WebP/PNG must restore multi-frame scope
    // and disable Animation Direction + animation-only checkboxes while JPEG is selected.
    for (const target of ["apng", "gif", "webp", "png"]) {
      const switchDialog = mount();
      let form = switchDialog.render();
      assert.equal(form.fields.find((field) => field.key === "frames").value, "all");
      assert.equal(form.fields.find((field) => field.key === "anidir").disabled, false);

      form.fields.find((field) => field.key === "format").onChange("jpg");
      form = switchDialog.render();
      const jpegFrames = form.fields.find((field) => field.key === "frames");
      assert.equal(jpegFrames.value, "current");
      assert.equal(jpegFrames.options.find((option) => option.value === "all").disabled, true);
      assert.equal(
        jpegFrames.options.find((option) => option.value === "tag:Reveal").disabled,
        true,
      );
      assert.equal(form.fields.find((field) => field.key === "anidir").disabled, true);
      assert.equal(form.fields.find((field) => field.key === "forTwitter").disabled, true);
      assert.equal(form.fields.find((field) => field.key === "ignoreEmpty").disabled, true);
      // Even if frames onChange fires while on JPEG, the multi-frame choice must stay intact.
      jpegFrames.onChange("current");
      form = switchDialog.render();

      form.fields.find((field) => field.key === "format").onChange(target);
      form = switchDialog.render();
      assert.equal(
        form.fields.find((field) => field.key === "frames").value,
        "all",
        `switching GIF -> JPEG -> ${target} restores All frames`,
      );
      assert.equal(form.fields.find((field) => field.key === "anidir").disabled, false);
      assert.equal(form.fields.find((field) => field.key === "ignoreEmpty").disabled, false);
      assert.equal(
        form.fields.find((field) => field.key === "forTwitter").disabled,
        target === "webp",
      );
      if (target === "apng") {
        form.actions.find((action) => action.label === "Export").onClick();
        assert.equal(switchDialog.exports.length, 1);
        assert.equal(switchDialog.exports[0].frames, "all");
        assert.equal(switchDialog.exports[0].name, "animation.apng");
      }
    }

    // Custom multi-frame selections (selected frames, tag, or explicit current frame) survive JPEG round-trips.
    for (const choice of ["selected", "tag:Reveal", "current"]) {
      const customDialog = mount();
      let form = customDialog.render();
      form.fields.find((field) => field.key === "frames").onChange(choice);
      form = customDialog.render();
      form.fields.find((field) => field.key === "format").onChange("jpg");
      form = customDialog.render();
      assert.equal(form.fields.find((field) => field.key === "frames").value, "current");
      assert.equal(form.fields.find((field) => field.key === "anidir").disabled, true);
      form.fields.find((field) => field.key === "format").onChange("apng");
      form = customDialog.render();
      assert.equal(form.fields.find((field) => field.key === "frames").value, choice);
      assert.equal(form.fields.find((field) => field.key === "anidir").disabled, false);
    }

    // Opening on a remembered single-frame JPEG export on a multi-frame document still exports
    // Current frame for JPEG, and restores All frames when switching to APNG.
    Object.assign(globalThis, {
      __exportInitialOptions: { name: "animation.jpg", frames: "current" },
    });
    const rememberedJpeg = mount();
    let jpegForm = rememberedJpeg.render();
    assert.equal(jpegForm.fields.find((field) => field.key === "frames").value, "current");
    assert.equal(jpegForm.fields.find((field) => field.key === "anidir").disabled, true);
    jpegForm.fields.find((field) => field.key === "format").onChange("apng");
    jpegForm = rememberedJpeg.render();
    assert.equal(jpegForm.fields.find((field) => field.key === "frames").value, "all");
    assert.equal(jpegForm.fields.find((field) => field.key === "anidir").disabled, false);
    delete (globalThis as Record<string, unknown>).__exportInitialOptions;

    // Embedded ExportDialog path: formatRequest transitions GIF -> JPEG -> APNG and draft restoration
    // across panel unmount/remount.
    let savedDraft: unknown;
    const embedded = mount({
      embedded: true,
      onDraftChange: (next: unknown) => {
        savedDraft = next;
      },
    });
    let embeddedForm = embedded.render();
    embeddedForm.fields.find((field) => field.key === "frames").onChange("selected");
    embeddedForm.fields.find((field) => field.key === "resize").onChange("200.00");
    embeddedForm = embedded.render({ formatRequest: { format: "jpg" } });
    assert.equal(embeddedForm.fields.find((field) => field.key === "frames").value, "current");
    assert.equal(embeddedForm.fields.find((field) => field.key === "anidir").disabled, true);
    embeddedForm = embedded.render({ formatRequest: { format: "apng" } });
    assert.equal(embeddedForm.fields.find((field) => field.key === "frames").value, "selected");
    assert.equal(embeddedForm.fields.find((field) => field.key === "anidir").disabled, false);
    assert.ok(savedDraft, "embedded ExportFileDialog publishes draft state for unmount/remount");

    // Remounting from the saved draft (e.g. after switching to Sprite Sheet and back to APNG) preserves settings.
    const remounted = mount({
      embedded: true,
      initialDraft: savedDraft,
      formatRequest: { format: "apng" },
    });
    const remountedForm = remounted.render();
    assert.equal(remountedForm.fields.find((field) => field.key === "frames").value, "selected");
    assert.equal(remountedForm.fields.find((field) => field.key === "resize").value, "200.00");
    remountedForm.actions.find((action) => action.label === "Export").onClick();
    assert.equal(remounted.exports.length, 1);
    assert.equal(remounted.exports[0].frames, "selected");
    assert.equal(remounted.exports[0].scalePercent, 200);
    assert.equal(remounted.exports[0].name, "animation.apng");

    globalThis.localStorage = previousStorage;
    delete globalThis.__exportDialogHooks;
    console.log(
      "Real shared Export dialog callbacks: GIF Cancel/Escape exit to canvas without prefs/export; OK persists global settings and Dont Show skips the next format dialog.",
    );
  }, 60_000);
});
