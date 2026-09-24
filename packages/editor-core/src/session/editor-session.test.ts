import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-session", () => {
  it("editor-session behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      EditorSession,
      RasterEditor,
      createBlankImage,
      decodeAsepriteSync,
      projectFromAseprite,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = (red = 10, width = 2, height = 2) => {
      const result = createBlankImage(width, height);
      for (let i = 0; i < result.data.length; i += 4) result.data.set([red, 20, 30, 255], i);
      return result;
    };
    const deferred = () => {
      let resolve, reject;
      const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      return { promise, resolve, reject };
    };
    const flush = async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve();
    };
    const source = (name = "Imported") => ({ source: name, name });
    const paletteFixture = decodeAsepriteSync(
      new Uint8Array(fs.readFileSync("apps/editor/assets/examples/xprite/xprite.ase")),
      { inflate: (bytes) => new Uint8Array(inflateSync(bytes)) },
    );
    function harness(overrides = {}, options) {
      const core = new RasterEditor(image(), "Original");
      const calls = [],
        released = [];
      let disposed = 0;
      const ports = {
        decode: async (token) => {
          calls.push(["decode", token]);
          return image(77);
        },
        analyze: async (pixels) => {
          calls.push(["analyze", pixels.width]);
          return { classification: "likely-pixel-art" };
        },
        pixelate: async (pixels, opts) => {
          calls.push(["pixelate", opts]);
          return image(99);
        },
        write: async (pixels, name, intent) => {
          calls.push(["write", pixels, name, intent]);
          return { method: "download", name };
        },
        releaseSource: (token) => released.push(token),
        dispose: () => disposed++,
        ...overrides,
      };
      const session = new EditorSession(core, ports, options);
      return {
        core,
        session,
        calls,
        released,
        get disposed() {
          return disposed;
        },
      };
    }
    const dirty = (core) =>
      core.color.setPalette([
        [10, 20, 30, 255],
        [1, 2, 3, 255],
      ]);
    let scenarios = 0;
    async function test(name, run) {
      await run();
      scenarios++;
      console.log(`✓ ${name}`);
    }
    await test("constructor is inert and snapshots are stable metadata", () => {
      let h = harness();
      assert.equal(h.calls.length, 0);
      assert.equal(h.session.getSnapshot(), h.session.getSnapshot());
      assert.equal(JSON.stringify(h.session.getSnapshot()).includes('"data"'), false);
      let notifications = 0;
      let off = h.session.subscribe(() => notifications++);
      h.session.reportError(new Error("No font"));
      assert.equal(notifications, 1);
      assert.equal(h.session.getSnapshot().prompt, "error");
      h.session.clearError();
      off();
      h.session.setNewSize({ width: 9 });
      assert.equal(notifications, 2);
      h.session.dispose();
    });
    await test("per-frame palettes import as an Aseprite project", async () => {
      const h = harness({
        decodeProject: async () =>
          projectFromAseprite({
            ...paletteFixture,
            palette: { ...paletteFixture.palette, frameIndex: 1 },
          }),
      });
      assert.equal(await h.session.requestImport(source("animated-palette.aseprite")), "created");
      assert.equal(h.core.getSnapshot().document.format, "aseprite");
      assert.ok(h.core.getSnapshot().document.timeline.frames[0].palette?.length);
      assert.equal(h.session.getSnapshot().error, null);
      h.session.dispose();
    });
    await test("bootstrap records recents but never activates document over Home", async () => {
      let h = harness();
      await h.session.initialize(source("Sample"), {
        foreground: [255, 255, 255, 255],
        background: [0, 0, 0, 255],
        palette: [[77, 20, 30, 255]],
      });
      assert.equal(h.core.getSnapshot().document.name, "Sample");
      assert.equal(h.session.getSnapshot().documentActivation, 0);
      assert.equal(h.session.getSnapshot().recentFiles[0].name, "Sample");
      assert.deepEqual(h.released, ["Sample"]);
      h.session.dispose();
    });
    await test("bootstrap cannot overwrite a later user import; strict replay releases unused token", async () => {
      const slow = deferred();
      let h = harness({
        decode: (token) => (token === "Sample" ? slow.promise : Promise.resolve(image(44))),
      });
      const first = h.session.initialize(source("Sample"));
      const replay = h.session.initialize(source("Replay"));
      await h.session.requestImport(source("New"));
      slow.resolve(image(11));
      await Promise.all([first, replay]);
      assert.equal(h.core.getSnapshot().document.name, "New");
      assert.equal(h.session.getSnapshot().documentActivation, 1);
      assert.deepEqual(h.released.sort(), ["New", "Replay", "Sample"]);
    });
    await test("bootstrap first requested after user work cannot replace that work", async () => {
      for (const first of ["new", "import"]) {
        let h = harness();
        if (first === "new") h.session.requestNew({ width: 3, height: 4 });
        else await h.session.requestImport(source("User image"));
        const before = h.core.getSnapshot();
        await h.session.initialize(source("Late sample"));
        assert.equal(h.core.getSnapshot().document.name, before.document.name);
        assert.equal(h.core.getSnapshot().pixelRevision, before.pixelRevision);
        assert.equal(
          h.calls.some((call) => call[0] === "decode" && call[1] === "Late sample"),
          false,
        );
        assert.ok(h.released.includes("Late sample"));
      }
    });
    await test("older bootstrap cannot release an opaque source adopted by a replacement", async () => {
      const slow = deferred();
      let decodes = 0;
      let h = harness({
        decode: () => (++decodes === 1 ? slow.promise : Promise.resolve(image(77))),
      });
      const initial = h.session.initialize(source("Shared"));
      dirty(h.core);
      await h.session.requestImport(source("Shared"));
      slow.resolve(image(1));
      await initial;
      assert.deepEqual(h.released, []);
      await h.session.confirmReplacement();
      assert.deepEqual(h.released, ["Shared"]);
      assert.equal(h.core.getSnapshot().document.name, "Shared");
    });
    await test("current decode failure releases its source and preserves existing document", async () => {
      let h = harness({
        decode: async () => {
          throw new Error("Invalid PNG");
        },
      });
      assert.equal(await h.session.requestImport(source()), "error");
      assert.equal(h.session.getSnapshot().error.message, "Invalid PNG");
      assert.equal(h.session.getSnapshot().busy, false);
      assert.equal(h.core.getSnapshot().document.name, "Original");
      assert.deepEqual(h.released, ["Imported"]);
      assert.equal(
        h.calls.some((call) => call[0] === "analyze"),
        false,
      );
    });
    await test("dirty replacement waits before decode, cancel preserves artwork", async () => {
      let h = harness();
      dirty(h.core);
      assert.equal(await h.session.requestImport(source()), "confirmation");
      assert.equal(h.calls.length, 0);
      h.session.cancelReplacement();
      assert.equal(h.core.getSnapshot().document.name, "Original");
      assert.equal(h.core.getSnapshot().dirty, true);
      assert.deepEqual(h.released, ["Imported"]);
    });
    await test("confirm import replaces only the approved current document", async () => {
      let h = harness();
      dirty(h.core);
      await h.session.requestImport(source());
      assert.equal(await h.session.confirmReplacement(), "created");
      assert.equal(h.core.getSnapshot().document.name, "Imported");
      assert.equal(h.core.getSnapshot().dirty, false);
      assert.equal(h.session.getSnapshot().documentActivation, 1);
    });
    await test("edits during decode require a new confirmation; decoded candidate is reused", async () => {
      const d = deferred();
      let decodes = 0;
      let h = harness({
        decode: () => {
          decodes++;
          return d.promise;
        },
      });
      let request = h.session.requestImport(source());
      h.core.timeline.renameLayer("Edited during decode");
      d.resolve(image(88));
      assert.equal(await request, "confirmation");
      assert.equal(h.core.getSnapshot().document.name, "Original");
      assert.equal(await h.session.confirmReplacement(), "created");
      assert.equal(decodes, 1);
    });
    await test("palette edits during analysis are protected while pure view changes are not", async () => {
      const a = deferred();
      let h = harness({ analyze: () => a.promise });
      let request = h.session.requestImport(source());
      await flush();
      dirty(h.core);
      a.resolve({ classification: "likely-pixel-art" });
      assert.equal(await request, "confirmation");
      h.session.cancelReplacement();
      const a2 = deferred();
      h = harness({ analyze: () => a2.promise });
      request = h.session.requestImport(source());
      await flush();
      h.core.canvas.setView({ pan: { x: 30, y: 10 } });
      a2.resolve({ classification: "likely-pixel-art" });
      assert.equal(await request, "created");
    });
    await test("newest import wins and stale failures cannot clear newer busy state", async () => {
      const a = deferred(),
        b = deferred();
      let h = harness({ decode: (t) => (t === "A" ? a.promise : b.promise) });
      const first = h.session.requestImport(source("A"));
      const second = h.session.requestImport(source("B"));
      a.reject(new Error("obsolete"));
      assert.equal(await first, "ignored");
      assert.equal(h.session.getSnapshot().busy, true);
      assert.equal(h.session.getSnapshot().error, null);
      b.resolve(image());
      await second;
      assert.equal(h.core.getSnapshot().document.name, "B");
      assert.equal(h.session.getSnapshot().busy, false);
      assert.deepEqual(h.released.sort(), ["A", "B"]);
    });
    await test("photo/uncertain import exposes metadata and retains chosen pixelation options", async () => {
      let h = harness({
        decode: async () => image(1, 80, 40),
        analyze: async () => ({ classification: "uncertain" }),
      });
      await h.session.requestImport(source());
      let state = h.session.getSnapshot();
      assert.deepEqual(state.pendingImport, {
        name: "Imported",
        width: 80,
        height: 40,
        classification: "uncertain",
      });
      assert.equal("pixels" in state.pendingImport, false);
      assert.deepEqual(state.pixelationOptions, {
        targetWidth: 10,
        targetHeight: 5,
        maxColors: 32,
        method: "nearest",
        preserveDimensions: false,
      });
      h.session.setPixelationOptions({
        method: "box",
        maxColors: 8,
        preserveDimensions: true,
      });
      await h.session.pixelate();
      assert.equal(h.calls.find((c) => c[0] === "pixelate")[1].method, "box");
      assert.equal(h.core.getSnapshot().document.name, "Imported");
    });
    await test("Keep original invalidates an already running pixelation", async () => {
      const p = deferred();
      let h = harness({
        decode: async () => image(22),
        analyze: async () => ({ classification: "likely-photo" }),
        pixelate: () => p.promise,
      });
      await h.session.requestImport(source());
      const operation = h.session.pixelate();
      assert.equal(h.session.acceptOriginal(), "created");
      p.resolve(image(99));
      assert.equal(await operation, "ignored");
      assert.equal(h.core.canvas.composite().data[0], 22);
      assert.equal(h.session.getSnapshot().busy, false);
    });
    await test("cancelled pixelation does not publish errors over a newer import", async () => {
      const p = deferred(),
        d = deferred();
      let h = harness({
        decode: (t) => (t === "B" ? d.promise : Promise.resolve(image())),
        analyze: async () => ({ classification: "likely-photo" }),
        pixelate: () => p.promise,
      });
      await h.session.requestImport(source("A"));
      const old = h.session.pixelate();
      h.session.cancelImport();
      const next = h.session.requestImport(source("B"));
      p.reject(new Error("old pixelation"));
      await old;
      assert.equal(h.session.getSnapshot().busy, true);
      assert.equal(h.session.getSnapshot().error, null);
      d.resolve(image(4));
      await next;
      assert.equal(h.session.getSnapshot().pendingImport.name, "B");
    });
    await test("pixelation errors suspend, rather than discard, the pending options", async () => {
      let h = harness({
        analyze: async () => ({ classification: "likely-photo" }),
        pixelate: async () => {
          throw new Error("allocation refused");
        },
      });
      await h.session.requestImport(source());
      assert.equal(await h.session.pixelate(), "error");
      assert.equal(h.session.getSnapshot().prompt, "error");
      assert.equal(h.session.getSnapshot().busy, false);
      h.session.clearError();
      assert.equal(h.session.getSnapshot().prompt, "pixelation");
      assert.equal(h.core.getSnapshot().document.name, "Original");
    });
    await test("edits during pixelation protect the document and retain generated result for confirmation", async () => {
      const p = deferred();
      let h = harness({
        analyze: async () => ({ classification: "likely-photo" }),
        pixelate: () => p.promise,
      });
      await h.session.requestImport(source());
      const operation = h.session.pixelate();
      dirty(h.core);
      p.resolve(image(66));
      assert.equal(await operation, "confirmation");
      assert.equal(h.core.getSnapshot().document.name, "Original");
      await h.session.confirmReplacement();
      assert.equal(h.core.canvas.composite().data[0], 66);
    });
    await test("failed post-pixelation installation is reported after generation invalidation", async () => {
      let h = harness({
        analyze: async () => ({ classification: "likely-photo" }),
        pixelate: async () => ({
          width: 0,
          height: 2,
          data: new Uint8ClampedArray(),
        }),
      });
      await h.session.requestImport(source());
      assert.equal(await h.session.pixelate(), "error");
      assert.equal(h.session.getSnapshot().error.operation, "pixelate");
      assert.equal(h.session.getSnapshot().busy, false);
      assert.equal(h.core.getSnapshot().document.name, "Original");
    });
    await test("cancelling a New draft restores only the last accepted dimensions", () => {
      const h = harness();
      h.session.setNewSize({ width: 99, height: 77 });
      h.session.resetNewSizeDraft();
      assert.deepEqual(h.session.getSnapshot().newSize, { width: 64, height: 64 });
      assert.equal(h.core.getSnapshot().document.name, "Original");
      assert.equal(h.session.requestNew({ width: 3, height: 4 }), "created");
      h.session.setNewSize({ width: 12, height: 13 });
      h.session.resetNewSizeDraft();
      assert.deepEqual(h.session.getSnapshot().newSize, { width: 3, height: 4 });
    });
    await test("OK commits New dimensions even when later replacement is cancelled", () => {
      const h = harness();
      dirty(h.core);
      assert.equal(h.session.requestNew({ width: 5, height: 6 }), "confirmation");
      h.session.cancelReplacement();
      h.session.setNewSize({ width: 90, height: 91 });
      h.session.resetNewSizeDraft();
      assert.deepEqual(h.session.getSnapshot().newSize, { width: 5, height: 6 });
      assert.equal(h.core.getSnapshot().document.name, "Original");
      assert.equal(h.core.getSnapshot().dirty, true);
    });
    await test("invalid New retains its submitted draft for correcting the error", () => {
      const h = harness();
      assert.equal(h.session.requestNew({ width: 0, height: 4 }), "error");
      assert.deepEqual(h.session.getSnapshot().newSize, { width: 0, height: 4 });
      assert.equal(h.core.getSnapshot().document.name, "Original");
    });
    await test("new dimensions travel with the replacement intent and allocation errors preserve image", async () => {
      let h = harness();
      dirty(h.core);
      assert.equal(h.session.requestNew({ width: 3, height: 4 }), "confirmation");
      h.session.setNewSize({ width: 9 });
      await h.session.confirmReplacement();
      assert.equal(h.core.getSnapshot().document.width, 3);
      assert.equal(h.core.getSnapshot().document.height, 4);
      assert.equal(h.session.getSnapshot().recentFiles.length, 0);
      assert.equal(h.session.requestNew({ width: 0, height: 4 }), "error");
      assert.equal(h.core.getSnapshot().document.width, 3);
    });
    await test("new document supersedes an import still decoding", async () => {
      const d = deferred();
      let h = harness({ decode: () => d.promise });
      const old = h.session.requestImport(source());
      h.session.requestNew({ width: 3, height: 3 });
      d.resolve(image(50));
      await old;
      assert.equal(h.core.getSnapshot().document.name, "Sprite-0001.png");
      assert.equal(h.core.getSnapshot().document.width, 3);
    });
    await test("recent activation preserves same-name edits; other recent replacement is guarded", async () => {
      let h = harness();
      await h.session.initialize(source("A"));
      await h.session.requestImport(source("B"));
      const recent = h.session.getSnapshot().recentFiles,
        aid = recent.find((i) => i.name === "A").id,
        bid = recent.find((i) => i.name === "B").id;
      dirty(h.core);
      assert.equal(h.session.openRecent(bid), "activated");
      assert.equal(h.session.getSnapshot().documentActivationKind, "activate");
      assert.equal(h.core.getSnapshot().dirty, true);
      assert.equal(h.session.openRecent(aid), "confirmation");
      await h.session.confirmReplacement();
      assert.equal(h.core.getSnapshot().document.name, "A");
      assert.equal(h.session.getSnapshot().documentActivationKind, "replace");
      assert.deepEqual(
        h.session.getSnapshot().recentFiles.map((i) => i.id),
        recent.map((i) => i.id),
      );
    });
    await test("recent snapshots remain bounded by count and bytes", async () => {
      let h = harness({}, { maxBytes: 32, maxItems: 2 });
      await h.session.requestImport(source("A"));
      await h.session.requestImport(source("B"));
      await h.session.requestImport(source("C"));
      assert.deepEqual(
        h.session.getSnapshot().recentFiles.map((i) => i.name),
        ["C", "B"],
      );
    });
    await test("write begins synchronously and concurrent saves are excluded", async () => {
      const w = deferred();
      let count = 0;
      let h = harness({
        write: () => {
          count++;
          return w.promise;
        },
      });
      dirty(h.core);
      const save = h.session.save();
      assert.equal(count, 1);
      assert.equal(h.session.getSnapshot().saving, true);
      assert.equal(await h.session.save("export"), "ignored");
      assert.equal(count, 1);
      w.resolve({ method: "download", name: "Original.png" });
      await save;
      assert.equal(h.core.getSnapshot().dirty, false);
      assert.equal(h.session.getSnapshot().saving, false);
      assert.equal(h.session.getSnapshot().notice, "Downloaded Original.png");
      h.session.clearNotice();
      assert.equal(h.session.getSnapshot().notice, "");
    });
    await test("Export Copy retains dirty while Save As advances the saved checkpoint", async () => {
      let h = harness();
      dirty(h.core);
      await h.session.save("export");
      assert.equal(h.core.getSnapshot().dirty, true);
      await h.session.save("save-as");
      assert.equal(h.core.getSnapshot().dirty, false);
      assert.deepEqual(
        h.calls.filter((c) => c[0] === "write").map((c) => c[3]),
        ["export", "save-as"],
      );
    });
    await test("cancelled and failed writes neither mark saved nor strand the save lock", async () => {
      for (const [behavior, expected, outcome] of [
        [async () => ({ cancelled: true }), null, "cancelled"],
        [
          async () => {
            const error = new Error("cancel");
            error.name = "AbortError";
            throw error;
          },
          null,
          "cancelled",
        ],
        [
          async () => {
            throw new Error("Disk full");
          },
          "Disk full",
          "error",
        ],
      ]) {
        let h = harness({ write: behavior });
        dirty(h.core);
        assert.equal(await h.session.save(), outcome);
        assert.equal(h.core.getSnapshot().dirty, true);
        assert.equal(h.session.getSnapshot().saving, false);
        assert.equal(h.session.getSnapshot().error?.message ?? null, expected);
      }
    });
    await test("palette and layer edits during saving are not marked saved", async () => {
      for (const change of [
        (core) => core.color.setPalette([[9, 8, 7, 255]]),
        (core) => core.timeline.setLayerLocked(true),
      ]) {
        const w = deferred();
        let h = harness({ write: () => w.promise });
        dirty(h.core);
        const save = h.session.save();
        change(h.core);
        w.resolve({ method: "picker", name: "Original.png" });
        await save;
        assert.equal(h.core.getSnapshot().dirty, true);
      }
    });
    await test("later pixel edits do not mutate the exported snapshot or clear dirty", async () => {
      const w = deferred();
      let written;
      let h = harness({
        write: (pixels) => {
          written = pixels;
          return w.promise;
        },
      });
      const save = h.session.save();
      h.core.drawing.settings.setSettings({
        tool: "pencil",
        foreground: [222, 0, 0, 255],
        brush: { shape: "square", size: 1, angle: 0 },
      });
      h.core.pointerDown({ x: 0, y: 0 });
      h.core.pointerUp({ x: 0, y: 0 });
      assert.equal(written.data[0], 10);
      w.resolve({ method: "picker", name: "Original.png" });
      await save;
      assert.equal(h.core.getSnapshot().dirty, true);
    });
    const font = {
      height: 1,
      lineHeight: 1,
      glyphs: {
        A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
      },
    };
    await test("text acceptance validates, stages floating pixels, and save commits them", async () => {
      let h = harness();
      assert.equal(
        h.session.acceptText("A", 1, [255, 0, 0, 255], { width: 10, height: 10 }),
        false,
      );
      h.core.drawing.settings.setSettings({ font });
      h.session.clearError();
      assert.equal(h.session.validateText("missing"), "The bundled font does not contain U+006D.");
      assert.equal(h.session.acceptText("A", 1, [255, 0, 0, 255], { width: 10, height: 10 }), true);
      assert.ok(h.core.getSnapshot().floatingPaste);
      await h.session.save();
      assert.equal(h.core.getSnapshot().floatingPaste, null);
      assert.equal(h.core.getSnapshot().dirty, false);
      assert.equal(h.session.acceptText("", 2, [255, 0, 0, 255], { width: 10, height: 10 }), true);
      assert.equal(h.core.getSnapshot().settings.text, "");
    });
    await test("disposal during decode/analyze/pixelate prevents every late mutation", async () => {
      for (const stage of ["decode", "analyze", "pixelate"]) {
        const gate = deferred();
        let h = harness({
          [stage]: () => gate.promise,
          ...(stage === "pixelate"
            ? { analyze: async () => ({ classification: "likely-photo" }) }
            : {}),
        });
        let operation = h.session.requestImport(source());
        if (stage === "analyze") await flush();
        if (stage === "pixelate") {
          await operation;
          operation = h.session.pixelate();
        }
        const before = h.core.getSnapshot().revision;
        let events = 0;
        h.session.subscribe(() => events++);
        h.session.dispose();
        h.session.dispose();
        gate.resolve(stage === "analyze" ? { classification: "likely-pixel-art" } : image(7));
        await operation;
        assert.equal(h.core.getSnapshot().revision, before);
        assert.equal(events, 0);
        assert.equal(h.disposed, 1);
      }
    });
    await test("disposal during save suppresses saved state and notices", async () => {
      const w = deferred();
      let h = harness({ write: () => w.promise });
      dirty(h.core);
      const save = h.session.save();
      h.session.dispose();
      w.resolve({ method: "download", name: "Old.png" });
      assert.equal(await save, "ignored");
      assert.equal(h.core.getSnapshot().dirty, true);
      assert.equal(h.session.getSnapshot().notice, "");
    });
    await test("bootstrap preferences cannot overwrite a later user color choice", async () => {
      const gate = deferred();
      const h = harness({ decode: () => gate.promise });
      const boot = h.session.initialize(source("Sample"), {
        foreground: [255, 255, 255, 255],
      });
      assert.deepEqual(h.core.getSnapshot().settings.foreground, [255, 255, 255, 255]);
      h.core.drawing.settings.setSettings({ foreground: [1, 2, 3, 255] });
      gate.resolve(image());
      await boot;
      assert.deepEqual(h.core.getSnapshot().settings.foreground, [1, 2, 3, 255]);
    });
    await test("IO availability protects interactive workflows and concurrent writers", async () => {
      const read = deferred();
      const h = harness({ decode: () => read.promise });
      assert.equal(h.session.canStartInteraction(), true);
      assert.equal(h.session.canSave(), true);
      const pending = h.session.requestImport(source());
      assert.equal(h.session.canStartInteraction(), false);
      assert.equal(h.session.canSave(), false);
      h.session.cancelImport();
      assert.equal(h.session.canStartInteraction(), true);
      read.resolve(image());
      await pending;
      const write = deferred();
      const w = harness({ write: () => write.promise });
      const saving = w.session.save();
      assert.equal(w.session.canStartInteraction(), false);
      assert.equal(w.session.canSave(), false);
      write.resolve({ cancelled: true });
      await saving;
      assert.equal(w.session.canStartInteraction(), true);
      assert.equal(w.session.canSave(), true);
    });
    await test("Save As renames metadata atomically; Export records its own name without renaming", async () => {
      const h = harness({
        write: async () => ({ method: "download", name: "Renamed.png" }),
      });
      dirty(h.core);
      const before = h.core.getSnapshot();
      await h.session.save("save-as");
      assert.equal(h.core.getSnapshot().document.name, "Renamed.png");
      assert.equal(before.document.name, "Original");
      assert.equal(h.core.getSnapshot().dirty, false);
      assert(h.session.getSnapshot().recentFiles.some((x) => x.name === "Renamed.png"));
      h.core.history.undo();
      assert.equal(h.core.getSnapshot().document.name, "Renamed.png");
      assert.equal(h.core.getSnapshot().dirty, true);
      const x = harness({
        write: async () => ({ method: "download", name: "Copy.png" }),
      });
      dirty(x.core);
      await x.session.save("export");
      assert.equal(x.core.getSnapshot().document.name, "Original");
      assert.equal(x.core.getSnapshot().dirty, true);
      assert(x.session.getSnapshot().recentFiles.some((x) => x.name === "Copy.png"));
    });
    await test("a completed old save records its snapshot without renaming a newer document", async () => {
      const gate = deferred();
      const h = harness({ write: () => gate.promise });
      dirty(h.core);
      const saving = h.session.save("save-as");
      assert.equal(h.session.requestNew({ width: 3, height: 3 }), "confirmation");
      await h.session.confirmReplacement();
      gate.resolve({ method: "download", name: "Old Saved.png" });
      await saving;
      assert.equal(h.core.getSnapshot().document.name, "Sprite-0001.png");
      assert.equal(h.core.getSnapshot().document.width, 3);
      assert.equal(h.core.getSnapshot().dirty, false);
      assert(h.session.getSnapshot().recentFiles.some((x) => x.name === "Old Saved.png"));
    });
    await test("Aseprite save snapshots the project before deferred writes", async () => {
      const write = deferred();
      let payload;
      let persisted;
      const h = harness({
        writeProject: (project) => {
          payload = project;
          return write.promise;
        },
        saveRecentImages: async (items) => {
          persisted = items;
        },
      });
      const document = h.core.getSnapshot().document;
      document.timeline = {
        ...document.timeline,
        asepriteSource: {
          width: 2,
          height: 2,
          depth: 32,
          frames: [],
          layers: [],
          flags: 0,
          header: {
            fileSize: 0,
            magic: 0xa5e0,
            speed: 100,
            next: 0,
            frit: 0,
            transparentIndex: 0,
            ncolors: 256,
            pixelWidth: 1,
            pixelHeight: 1,
            gridX: 0,
            gridY: 0,
            gridWidth: 16,
            gridHeight: 16,
            ignore: [0, 0, 0],
          },
          tags: [],
          chunks: [],
          format: "aseprite",
        },
      };
      h.core.document.loadTimeline(
        document.timeline,
        document.width,
        document.height,
        document.name,
        document.palette,
      );
      const saving = h.session.save();
      await flush();
      assert.ok(payload, "Aseprite writer receives a project before its await");
      const writtenByte = payload.timeline.frames[0].cels[0].pixels.data[0];
      h.core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 91, 255] });
      h.core.pointerDown({ x: 0, y: 0 });
      h.core.pointerUp();
      write.resolve({ method: "download", name: "Original.aseprite" });
      assert.equal(await saving, "created");
      assert.equal(payload.timeline.frames[0].cels[0].pixels.data[0], writtenByte);
      assert.equal(persisted[0].project.timeline.frames[0].cels[0].pixels.data[0], writtenByte);
      assert.equal(h.core.getSnapshot().dirty, true);
      assert.equal(h.core.getSnapshot().document.name, "Original");
      h.session.dispose();
    });
    await test("persistent recents hydrate before a new import and retain exact RGBA across sessions", async () => {
      let persisted = [{ name: "Stored.png", image: image(91) }];
      const ports = {
        loadRecentImages: async () =>
          persisted.map((item) => ({
            name: item.name,
            image: { ...item.image, data: new Uint8ClampedArray(item.image.data) },
          })),
        saveRecentImages: async (items) => {
          persisted = items.map((item) => ({
            name: item.name,
            image: { ...item.image, data: new Uint8ClampedArray(item.image.data) },
          }));
        },
      };
      const first = harness(ports);
      await first.session.requestImport(source("Fresh.png"));
      await first.session.flushPersistence();
      assert.deepEqual(
        persisted.map((item) => item.name),
        ["Fresh.png", "Stored.png"],
      );
      const second = harness(ports);
      await second.session.restoreRecent();
      const stored = second.session
        .getSnapshot()
        .recentFiles.find((item) => item.name === "Stored.png");
      assert.ok(stored);
      assert.equal(second.session.openRecent(stored.id), "created");
      assert.equal(second.core.canvas.composite().data[0], 91);
    });
    await test("bootstrap cannot replace persisted recent bytes or use a same-name shortcut", async () => {
      const h = harness({
        loadRecentImages: async () => [{ name: "Sample", image: image(199) }],
        saveRecentImages: async () => {
          throw new Error("bootstrap must not overwrite recents");
        },
      });
      await h.session.initialize(source("Sample"));
      assert.equal(h.core.canvas.composite().data[0], 77);
      assert.equal(h.session.getSnapshot().error, null);
      const recent = h.session.getSnapshot().recentFiles[0];
      h.session.openRecent(recent.id);
      assert.equal(h.core.canvas.composite().data[0], 199);
    });
    await test("unremembered examples skip recents but later imports hydrate before writing", async () => {
      let reads = 0;
      const pending = deferred();
      const saved = [];
      const h = harness({
        loadRecentImages: () => {
          reads++;
          return pending.promise;
        },
        saveRecentImages: async (images) => {
          saved.push(images);
        },
      });
      await h.session.initialize(source("Example"), { rememberInitial: false });
      assert.equal(reads, 0);
      assert.equal(h.core.getSnapshot().document.name, "Example");
      assert.equal(saved.length, 0);
      const importing = h.session.requestImport(source("New.png"));
      await flush();
      assert.equal(reads, 1);
      assert.equal(saved.length, 0, "pending hydration cannot erase older recent files");
      pending.resolve([{ id: "old", name: "Old.png", image: image(199) }]);
      await importing;
      await h.session.flushPersistence();
      assert.ok(saved.at(-1).some((item) => item.name === "Old.png"));
      assert.ok(saved.at(-1).some((item) => item.name === "New.png"));
    });
    await test("failed recent hydration never clears existing durable storage", async () => {
      let writes = 0;
      const h = harness({
        loadRecentImages: async () => {
          throw new Error("Storage blocked");
        },
        saveRecentImages: async () => {
          writes++;
        },
      });
      await h.session.requestImport(source());
      await h.session.flushPersistence();
      assert.equal(writes, 0);
      assert.equal(h.core.getSnapshot().document.name, "Imported");
      assert.equal(h.session.getSnapshot().error.message, "Storage blocked");
    });
    await test("durable writes serialize and remain queued after UI disposal", async () => {
      const firstWrite = deferred();
      const writes = [];
      let count = 0;
      const h = harness({
        loadRecentImages: async () => [],
        saveRecentImages: async (items) => {
          writes.push(items.map((item) => item.name));
          if (++count === 1) await firstWrite.promise;
        },
      });
      const a = h.session.requestImport(source("A"));
      await flush();
      const b = h.session.requestImport(source("B"));
      await flush();
      h.session.dispose();
      firstWrite.resolve();
      await Promise.all([a, b]);
      await h.session.flushPersistence();
      assert.deepEqual(writes.at(-1), ["B", "A"]);
    });
    await test("dirty Close has Cancel and Don't Save outcomes without fake tab-only closure", async () => {
      const h = harness();
      dirty(h.core);
      assert.equal(h.session.requestClose(), "confirmation");
      assert.equal(h.session.getSnapshot().replacement.kind, "close");
      h.session.cancelReplacement();
      assert.ok(h.core.getSnapshot().document);
      assert.equal(h.core.getSnapshot().dirty, true);
      h.session.requestClose();
      assert.equal(await h.session.confirmReplacement(), "closed");
      assert.equal(h.core.getSnapshot().document, null);
      assert.equal(h.core.getSnapshot().canUndo, false);
      assert.equal(h.session.getSnapshot().documentActivationKind, "close");
    });
    await test("selection previews do not request a file-save confirmation", () => {
      const selection = harness();
      selection.core.drawing.settings.setSettings({ tool: "marquee" });
      selection.core.pointerDown({ x: 0, y: 0 });
      selection.core.pointerMove({ x: 1, y: 1 });
      assert.equal(selection.session.hasUnsavedChanges(), false);
      assert.equal(selection.session.requestClose(), "closed");
      const painting = harness();
      painting.core.pointerDown({ x: 0, y: 0 });
      assert.equal(
        painting.session.hasUnsavedChanges(),
        true,
        "an active paint transaction still needs a save guard",
      );
      assert.equal(painting.session.requestClose(), "confirmation");
      painting.session.cancelReplacement();
      const slice = harness();
      slice.core.drawing.settings.setSettings({ tool: "slice" });
      slice.core.pointerDown({ x: 0, y: 0, button: 0 });
      slice.core.pointerMove({ x: 1, y: 1, button: 0 });
      slice.core.pointerUp({ x: 1, y: 1, button: 0 });
      slice.core.history.markSaved();
      slice.core.pointerDown({ x: 0, y: 0, button: 0 });
      slice.core.pointerMove({ x: 1, y: 0, button: 0 });
      assert.equal(
        slice.core.getSnapshot().dirty,
        false,
        "an active slice drag has not committed history",
      );
      assert.equal(
        slice.session.hasUnsavedChanges(),
        true,
        "a slice metadata drag still needs a save guard",
      );
      slice.core.cancelPointerGesture();
    });
    await test("Save then Close waits for a successful write; picker cancellation keeps the document", async () => {
      const w = deferred();
      const h = harness({ write: () => w.promise });
      dirty(h.core);
      h.session.requestClose();
      const close = h.session.saveAndContinue();
      assert.ok(h.core.getSnapshot().document);
      w.resolve({ method: "download", name: "Original.png" });
      assert.equal(await close, "closed");
      assert.equal(h.core.getSnapshot().document, null);
      const cancelled = harness({ write: async () => ({ cancelled: true }) });
      dirty(cancelled.core);
      cancelled.session.requestClose();
      assert.equal(await cancelled.session.saveAndContinue(), "cancelled");
      assert.ok(cancelled.core.getSnapshot().document);
      assert.ok(cancelled.session.getSnapshot().replacement);
    });
    await test("new edits during Save prevent Close, and failed writes keep the warning intent", async () => {
      const w = deferred();
      const h = harness({ write: () => w.promise });
      dirty(h.core);
      h.session.requestClose();
      const close = h.session.saveAndContinue();
      h.core.timeline.setLayerLocked(true);
      w.resolve({ method: "download", name: "Original.png" });
      assert.equal(await close, "confirmation");
      assert.ok(h.core.getSnapshot().document);
      assert.equal(h.core.getSnapshot().dirty, true);
      const failed = harness({
        write: async () => {
          throw new Error("Disk full");
        },
      });
      dirty(failed.core);
      failed.session.requestClose();
      assert.equal(await failed.session.saveAndContinue(), "error");
      assert.equal(failed.session.getSnapshot().error.message, "Disk full");
      failed.session.clearError();
      assert.equal(failed.session.getSnapshot().prompt, "replacement");
    });
    await test("Save/Don't Save/Cancel also protects New and import replacement", async () => {
      const h = harness();
      dirty(h.core);
      h.session.requestNew({ width: 4, height: 3 });
      assert.equal(await h.session.saveAndContinue(), "created");
      assert.equal(h.core.getSnapshot().document.width, 4);
      dirty(h.core);
      await h.session.requestImport(source());
      h.session.cancelReplacement();
      assert.equal(h.core.getSnapshot().document.width, 4);
      await h.session.requestImport(source());
      await h.session.confirmReplacement();
      assert.equal(h.core.getSnapshot().document.name, "Imported");
    });
    await test("Exit closes the document and emits an explicit browser-exit request", () => {
      const h = harness();
      assert.equal(h.session.requestClose(true), "closed");
      assert.equal(h.core.getSnapshot().document, null);
      assert.equal(h.session.getSnapshot().exitRequests, 1);
    });
    await test("pending inline text is protected by Close and committed before saving", async () => {
      const h = harness();
      h.core.drawing.settings.setSettings({ font, tool: "text", foreground: [200, 0, 0, 255] });
      assert.ok(h.core.drawing.text.beginInlineText({ x: 0, y: 0, width: 2, height: 2 }));
      h.core.drawing.text.updateInlineText({ text: "A" });
      assert.equal(h.session.hasUnsavedChanges(), true);
      assert.equal(h.session.requestClose(), "confirmation");
      h.session.cancelReplacement();
      await h.session.save();
      assert.equal(h.core.getSnapshot().inlineText, null);
      assert.equal(h.core.getSnapshot().dirty, false);
      assert.ok(h.core.canvas.composite().data.includes(200));
    });
    await test("same-name files keep distinct persistent identities while repeated Save updates one file", async () => {
      let persisted = [];
      const shared = {
        loadRecentImages: async () => structuredClone(persisted),
        saveRecentImages: async (items) => {
          persisted = structuredClone(items);
        },
        decode: async (token) => image(token === "first" ? 11 : 99),
      };
      const h = harness(shared);
      await h.session.requestImport({ source: "first", name: "same.png" });
      await h.session.requestImport({ source: "second", name: "same.png" });
      const ids = h.session.getSnapshot().recentFiles.map((item) => item.id);
      assert.equal(new Set(ids).size, 2);
      await h.session.save();
      await h.session.save();
      assert.equal(h.session.getSnapshot().recentFiles.length, 2);
      await h.session.flushPersistence();
      const reloaded = harness(shared);
      await reloaded.session.restoreRecent();
      assert.deepEqual(
        reloaded.session.getSnapshot().recentFiles.map((item) => item.id),
        ids,
      );
      reloaded.session.openRecent(ids[1]);
      assert.equal(reloaded.core.canvas.composite().data[0], 11);
      reloaded.session.openRecent(ids[0]);
      assert.equal(reloaded.core.canvas.composite().data[0], 99);
    });
    await test("PNG export excludes reference guides while display and project retain them", async () => {
      const { core, session, calls } = harness();
      const artwork = image();
      artwork.data[3] = 0;
      core.document.loadImage(artwork, "Original");
      const original = core.canvas.composite().data.slice();
      core.sprite.addReferenceLayer(image(222), "Reference guide");
      assert.notDeepEqual(
        core.canvas.composite().data,
        original,
        "reference appears in editor display",
      );
      assert.equal(await session.save("export"), "created");
      const written = calls.find((call) => call[0] === "write");
      assert.deepEqual(written[1].data, original, "reference guides are absent from flattened PNG");
      assert.equal(
        core.getSnapshot().document.timeline.layers.length,
        2,
        "export does not remove the reference layer",
      );
    });
    console.log(`${scenarios} isolated editor session workflow scenarios passed.`);
  }, 60_000);
});
