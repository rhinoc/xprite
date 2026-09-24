import assert from "node:assert/strict";
import path from "node:path";

import { build, type PluginBuild } from "esbuild";
import { afterEach, describe, it } from "vitest";

import { TilemapDisplayMode } from "@xprite/editor-core";

let restoreWindowTimers: (() => void) | null = null;

afterEach(() => {
  restoreWindowTimers?.();
  restoreWindowTimers = null;
});

function resolveBedrockAliases(build: PluginBuild) {
  build.onResolve({ filter: /^\$\// }, (args) => {
    const importer = args.importer.replaceAll("\\", "/");
    if (!importer.includes("/packages/bedrock/browser/")) return null;
    return {
      path: path.resolve("packages/bedrock/browser", `${args.path.slice(2)}.ts`),
    };
  });
}

function installImmediateWindowTimers() {
  const pending: Array<() => void> = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: (callback: TimerHandler) => {
        if (typeof callback === "function") pending.push(callback);
        return pending.length;
      },
      clearTimeout: () => {},
    },
  });
  restoreWindowTimers = () => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  };
  return {
    flush() {
      for (const callback of pending.splice(0)) callback();
    },
  };
}

describe("bundled-recents", () => {
  it("keeps the Xprite sample in recents without opening it in a fresh workspace", async () => {
    const timers = installImmediateWindowTimers();
    const ports = `export class BrowserSessionPorts {
  recent=[];
  registerAsset=(source,name)=>({source,name});
  loadRecentImages=async()=>this.recent;
  saveRecentImages=async images=>{this.recent=images};
  decode=async()=>({width:2,height:2,data:new Uint8ClampedArray(16)});
  bindSourceToDocument(){};
  releaseDocumentHandle(){};
  dispose(){};
}`;
    const recovery = `export class WorkspaceRecovery {
  restore=async()=>this.saved??null;
  subscribe=()=>()=>{};
  start(){} updateLayout(){} flush=async()=>{}; dispose(){};
  getSnapshot(){return {error:null,documents:{}}}
  listClosedProjects=async()=>[];
  isSlotUnpersisted=()=>false;
  hasUnpersistedWorkspaceChanges=()=>false;
  discardSlotChanges=()=>true;
  suspend(){};
  loadRecoveryEntry=async()=>({document:{name:'recovered.png'}});
  loadClosedProject=async()=>({snapshot:{document:{name:'closed.png'}},head:'head'});
  adoptClosedProject(){};
}`;
    const result = await build({
      stdin: {
        contents: `export {DocumentWorkspace} from './apps/editor/src/managers/workspace/document-workspace'; export {BrowserSessionPorts} from './apps/editor/src/adapters/session/browser-session-ports'; export {WorkspaceRecovery} from './apps/editor/src/managers/workspace/workspace-recovery';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      plugins: [
        {
          name: "browser-ports",
          setup(build) {
            resolveBedrockAliases(build);
            build.onLoad({ filter: /adapters\/session\/browser-session-ports.ts$/ }, () => ({
              contents: ports,
              loader: "ts",
            }));
            build.onLoad({ filter: /managers\/workspace\/workspace-recovery.ts$/ }, () => ({
              contents: recovery,
              loader: "ts",
            }));
            build.onResolve({ filter: /\.(png|ase|aseprite)(\?url)?$/ }, (args) => ({
              path: args.path,
              namespace: "assets",
            }));
            build.onLoad({ filter: /.*/, namespace: "assets" }, () => ({
              contents: 'export default "fixture"',
              loader: "js",
            }));
          },
        },
      ],
    });
    const { DocumentWorkspace, BrowserSessionPorts, WorkspaceRecovery } = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
    );
    const preferenceStorage = new Map();
    let nextId = 0;
    const createWorkspace = (databaseName) =>
      new DocumentWorkspace({
        databaseName,
        ports: new BrowserSessionPorts(),
        recovery: new WorkspaceRecovery(),
        createId: () => `test-${++nextId}`,
        preferenceStorage: {
          getItem: (key) => preferenceStorage.get(key) ?? null,
          setItem: (key, value) => preferenceStorage.set(key, value),
        },
      });
    const workspace = createWorkspace();
    await workspace.initialize();
    workspace.startBackgroundInitialization();
    timers.flush();
    for (let i = 0; i < 16; i++) await Promise.resolve();
    const recent = workspace.active.session.getSnapshot().recentFiles;
    assert.deepEqual(
      workspace.getSnapshot().tabs.map((tab) => tab.name),
      [],
    );
    assert.equal(workspace.getSnapshot().activeId, "");
    assert.equal(workspace.active.core.getSnapshot().document, null);
    assert.deepEqual(
      recent.map((item) => item.name),
      ["example.aseprite"],
    );
    assert.deepEqual(
      recent.map((item) => item.id),
      ["bundled:xprite-project"],
    );
    const count = workspace.getSnapshot().tabs.length;
    assert.equal(await workspace.openRecent("bundled:xprite-project"), true);
    assert.notEqual(workspace.active.id, "untitled");
    assert.equal(workspace.active.core.getSnapshot().document?.name, "example.aseprite");
    assert.equal(workspace.getSnapshot().tabs.length, count + 1);
    workspace.dispose();
    console.log("Fresh workspaces list the bundled Xprite sample without opening a blank tab.");
  }, 60_000);
});

describe("document-workspace [feature-1-6]", () => {
  it("document-workspace behavior", async () => {
    const ports = `export class BrowserSessionPorts {
  recent=[]; result={method:'download',name:'saved.png'};
  registerAsset=(source,name)=>({source,name});
  writes=0;
  loadRecentImages=async()=>this.recent;
  saveRecentImages=async(images)=>{this.recent=images};
  write=async()=>{this.writes++;return this.result};
  decode=async(source)=>({width:2,height:2,data:new Uint8ClampedArray(16)});
  analyze=async()=>({classification:'likely-pixel-art',confidence:1,reasons:[]});
  bindSourceToDocument(){};
  releaseDocumentHandle(){};
  dispose(){};
}`;
    const recovery = `export class WorkspaceRecovery { pending=new Set(); listeners=new Set(); flushes=0; start(){} updateLayout(){} restore(){return Promise.resolve(this.saved??null)} flush(){this.flushes++;return Promise.resolve()} getSnapshot(){return {error:null,documents:{}}} hasUnpersistedWorkspaceChanges(){return this.pending.size>0} isSlotUnpersisted(id){return this.pending.has(id)} listClosedProjects(){return Promise.resolve([])} discardSlotChanges(id){this.setPending(id,false);return true} subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)} setPending(id,value){if(value)this.pending.add(id);else this.pending.delete(id);for(const fn of this.listeners)fn()} suspend(){} loadRecoveryEntry(){return Promise.resolve({document:{name:'recovered.png'}})} loadClosedProject(){return Promise.resolve({snapshot:{document:{name:'closed.png'}},head:'head'})} adoptClosedProject(){} dispose(){} }`;
    const result = await build({
      stdin: {
        contents: `export {DocumentWorkspace} from './apps/editor/src/managers/workspace/document-workspace'; export {BrowserSessionPorts} from './apps/editor/src/adapters/session/browser-session-ports'; export {WorkspaceRecovery} from './apps/editor/src/managers/workspace/workspace-recovery'; export {createClipboardActions,ImageClipboard} from './apps/editor/src/managers/clipboard/index';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      plugins: [
        {
          name: "browser-ports",
          setup(b) {
            resolveBedrockAliases(b);
            b.onLoad({ filter: /adapters\/session\/browser-session-ports.ts$/ }, () => ({
              contents: ports,
              loader: "ts",
            }));
            b.onLoad({ filter: /managers\/workspace\/workspace-recovery.ts$/ }, () => ({
              contents: recovery,
              loader: "ts",
            }));
            b.onLoad({ filter: /adapters\/files\/images.ts$/ }, () => ({
              contents:
                "export async function encodePng(){return new Blob()} export async function decodeImage(){return {width:1,height:1,data:new Uint8ClampedArray(4)}}",
              loader: "ts",
            }));
            b.onResolve({ filter: /\.(png|ase|aseprite)(\?url)?$/ }, (a) => ({
              path: a.path,
              namespace: "assets",
            }));
            b.onLoad({ filter: /.*/, namespace: "assets" }, () => ({
              contents: 'export default "fixture"',
              loader: "js",
            }));
          },
        },
      ],
    });
    const {
      DocumentWorkspace,
      BrowserSessionPorts,
      WorkspaceRecovery,
      createClipboardActions,
      ImageClipboard,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
    );
    const preferenceStorage = new Map();
    let nextId = 0;
    const createWorkspace = (databaseName) =>
      new DocumentWorkspace({
        databaseName,
        ports: new BrowserSessionPorts(),
        recovery: new WorkspaceRecovery(),
        createId: () => `test-${++nextId}`,
        preferenceStorage: {
          getItem: (key) => preferenceStorage.get(key) ?? null,
          setItem: (key, value) => preferenceStorage.set(key, value),
        },
      });
    const tick = async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    const blank = () => ({
      width: 3,
      height: 3,
      data: Uint8ClampedArray.from({ length: 36 }, (_, i) => (i % 4 === 3 ? 255 : 20 + i)),
    });
    const dirty = (core) => {
      core.drawing.settings.setSettings({ foreground: [255, 0, 0, 255] });
      core.pointerDown({ x: 1, y: 1 });
      core.pointerUp();
    };
    const workspace = () => {
      const w = createWorkspace();
      for (const slot of w.slots) slot.core.document.loadImage(blank(), slot.name);
      return w;
    };
    const waitForImportState = async (condition) => {
      for (let attempt = 0; attempt < 100 && !condition(); attempt++) await tick();
      assert.ok(condition(), "the import reaches its expected decision state");
    };
    {
      const w = workspace(),
        opened = [],
        released = [];
      w.ports.decode = async (source) => {
        opened.push(source);
        if (source === "broken") throw new Error("Unreadable selected file");
        return blank();
      };
      w.ports.releaseSource = (source) => released.push(source);
      const batch = w.openFiles([
        { kind: "document", source: { source: "broken", name: "broken.png" } },
        { kind: "document", source: { source: "valid", name: "valid.png" } },
      ]);
      await waitForImportState(() => !!w.active.session.getSnapshot().error);
      assert.deepEqual(opened, ["broken"], "errors stay visible before later files open");
      w.active.session.clearError();
      w.discardEmptyImport();
      await batch;
      assert.deepEqual(opened, ["broken", "valid"]);
      assert.equal(w.active.core.getSnapshot().document.name, "valid.png");
      assert.equal(w.getSnapshot().tabs.length, 2, "failed empty import tabs are removed");
      assert.ok(released.includes("broken") && released.includes("valid"));
      assert.equal(w.getSnapshot().importBatch, null);
      w.dispose();
    }
    {
      const w = workspace(),
        opened = [];
      let analyses = 0;
      w.ports.decode = async (source) => {
        opened.push(source);
        return blank();
      };
      w.ports.analyze = async () => ({
        classification: analyses++ === 0 ? "likely-photo" : "likely-pixel-art",
      });
      const batch = w.openFiles([
        { kind: "document", source: { source: "photo", name: "photo.png" } },
        { kind: "document", source: { source: "sprite", name: "sprite.png" } },
      ]);
      await waitForImportState(() => !!w.active.session.getSnapshot().pendingImport);
      assert.deepEqual(opened, ["photo"], "pixelation remains attached to its own file");
      w.active.session.acceptOriginal();
      await batch;
      assert.deepEqual(opened, ["photo", "sprite"]);
      assert.equal(w.getSnapshot().tabs.length, 3);
      w.dispose();
    }
    {
      const w = workspace(),
        opened = [],
        released = [];
      let finishDecode;
      w.ports.decode = (source) => {
        opened.push(source);
        return new Promise((resolve) => {
          finishDecode = resolve;
        });
      };
      w.ports.releaseSource = (source) => released.push(source);
      const batch = w.openFiles([
        { kind: "document", source: { source: "slow", name: "slow.png" } },
        { kind: "document", source: { source: "queued", name: "queued.png" } },
      ]);
      await waitForImportState(() => opened.length > 0);
      w.cancelFileImport();
      await batch;
      assert.deepEqual(opened, ["slow"], "cancellation does not open queued files");
      assert.ok(released.includes("slow") && released.includes("queued"));
      finishDecode(blank());
      await tick();
      assert.equal(
        w.getSnapshot().tabs.length,
        1,
        "late decode completion cannot install a document",
      );
      assert.equal(w.getSnapshot().importBatch, null);
      w.dispose();
    }
    {
      const fresh = createWorkspace("fresh-tab-dot-check");
      await fresh.initialize();
      assert.ok(
        fresh.getSnapshot().tabs.every((tab) => !tab.modified),
        "fresh default artwork starts without a modified dot",
      );
      fresh.dispose();
      const source = workspace(),
        edited = source.active.core;
      dirty(edited);
      const snapshot = edited.getPersistenceSnapshot();
      source.dispose();
      const restored = createWorkspace("recovered-tab-dot-check");
      restored.recovery.saved = {
        layout: {
          activeId: "untitled",
          slotIds: ["untitled"],
          views: ["untitled"].map((id) => ({ id, documentId: id })),
        },
        documents: new Map([["untitled", snapshot]]),
      };
      await restored.initialize();
      assert.equal(
        restored.getSnapshot().tabs[0].modified,
        false,
        "a recovered Web checkpoint is saved even when its external file is dirty",
      );
      restored.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const slot = w.active;
      dirty(slot.core);
      w.recovery.setPending(slot.id, true);
      assert.equal(
        w.getSnapshot().tabs[0].modified,
        true,
        "a committed revision waiting for Web storage shows the dot",
      );
      const flush = w.recovery.flush.bind(w.recovery);
      w.recovery.flush = async () => {
        await flush();
        w.recovery.setPending(slot.id, false);
      };
      await w.saveLocally();
      assert.equal(w.getSnapshot().tabs[0].modified, false, "Web Save clears the tab dot");
      assert.equal(
        slot.core.getSnapshot().dirty,
        true,
        "Web Save does not mark an external file saved",
      );
      assert.equal(await slot.session.save(), "created");
      assert.equal(
        w.getSnapshot().tabs[0].modified,
        false,
        "external file save does not change an already saved Web checkpoint",
      );
      w.recovery.setPending(slot.id, true);
      assert.equal(
        w.getSnapshot().tabs[0].modified,
        true,
        "a pending Web write relights the tab dot even when the external file is clean",
      );
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const core = w.active.core;
      core.tilemap.addTilemapLayer({ tileWidth: 2, tileHeight: 2 });
      core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
      core.pointerDown({ x: 0, y: 0 });
      core.pointerUp();
      core.tilemap.setTilemapMode(TilemapDisplayMode.Tiles);
      core.tilemap.setSelectedTile(1);
      core.pointerDown({ x: 1, y: 1 });
      assert.equal(
        core.getSnapshot().preview.tool,
        "pencil",
        "tile painting exposes its active transaction",
      );
      assert.equal(core.hasPendingDocumentEdit(), true);
      assert.equal(
        w.needsBeforeUnloadWarning(),
        true,
        "tile painting still protects the local workspace",
      );
      await assert.rejects(w.saveLocally(), /Finish the current edit/);
      core.cancelPointerGesture();
      core.drawing.settings.setSettings({ tool: "slice" });
      core.pointerDown({ x: 0, y: 0 });
      core.pointerMove({ x: 2, y: 2 });
      core.pointerUp({ x: 2, y: 2 });
      core.pointerDown({ x: 1, y: 1 });
      core.pointerMove({ x: 2, y: 1 });
      assert.equal(
        core.hasPendingDocumentEdit(),
        true,
        "editing an existing slice is a document draft",
      );
      assert.equal(w.needsBeforeUnloadWarning(), true);
      await assert.rejects(
        w.saveLocally(),
        /Finish the current edit/,
        "local save waits for the slice transaction",
      );
      core.cancelPointerGesture();
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const core = w.active.core;
      core.drawing.settings.setSettings({ tool: "marquee" });
      core.pointerDown({ x: 0, y: 0 });
      core.pointerMove({ x: 2, y: 2 });
      await w.saveLocally();
      assert.equal(
        core.getSnapshot().preview.tool,
        "marquee",
        "local checkpoint leaves a selection-only draft alone",
      );
      core.pointerUp({ x: 2, y: 2 });
      core.drawing.settings.setSettings({ tool: "pencil" });
      core.pointerDown({ x: 1, y: 1 });
      await assert.rejects(
        w.saveLocally(),
        /Finish the current edit/,
        "local checkpoint still refuses an incomplete paint transaction",
      );
      core.cancelPointerGesture();
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const core = w.active.core,
        id = w.active.id;
      w.recovery.setPending(id, true);
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        true,
        "an unsaved Web checkpoint shows the modified dot",
      );
      w.recovery.setPending(id, false);
      core.drawing.settings.setSettings({ tool: "marquee" });
      core.pointerDown({ x: 0, y: 0 });
      core.pointerMove({ x: 2, y: 2 });
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        false,
        "marquee preview is not an unsaved document draft",
      );
      core.pointerUp({ x: 2, y: 2 });
      assert.ok(core.getSnapshot().document.selection, "marquee commits a live mask");
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        false,
        "selection-only commit keeps the close button",
      );
      core.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
      core.pointerDown({ x: 1, y: 1 });
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        true,
        "an unfinished content stroke is not yet saved to the Web",
      );
      core.pointerUp();
      w.recovery.setPending(id, true);
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        true,
        "the committed stroke stays marked until its Web checkpoint",
      );
      w.recovery.setPending(id, false);
      assert.equal(
        w.getSnapshot().tabs.find((tab) => tab.id === id).modified,
        false,
        "the dot clears after Web persistence",
      );
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const options = {
        maxBytes: 2 * 1048576,
        allowNonlinearHistory: true,
        gotoModified: false,
        showTooltip: false,
      };
      w.setUndoOptions(options);
      assert.deepEqual(w.getUndoOptions(), options, "undo preferences belong to the workspace");
      assert.ok(
        w.slots.every((slot) => slot.core.history.getSnapshot().allowNonlinearHistory),
        "existing documents receive undo preferences",
      );
      assert.equal(w.createDocument({ width: 4, height: 4 }), "created");
      assert.deepEqual(
        w.active.core.history.getSnapshot().maxBytes,
        options.maxBytes,
        "new documents inherit undo preferences",
      );
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      dirty(w.active.core);
      await w.saveLocally();
      assert.equal(w.ports.writes, 0, "File Save does not download a user file");
      assert.equal(w.recovery.flushes, 1, "File Save drains the local workspace checkpoint");
      w.recovery.setPending(w.active.id, true);
      await assert.rejects(
        w.saveLocally(),
        /waiting to be saved/,
        "pending local writes cannot report success",
      );
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      const core = w.active.core;
      core.clipboard.beginImagePaste({ pixels: blank(), mask: null });
      assert.ok(core.getSnapshot().floatingPaste);
      await w.saveLocally();
      assert.equal(
        core.getSnapshot().floatingPaste,
        null,
        "local Save commits staged paste before checkpointing",
      );
      assert.equal(w.ports.writes, 0);
      w.dispose();
    }
    {
      const w = workspace(),
        first = w.active;
      w.ready = true;
      dirty(first.core);
      const bytes = first.core.canvas.composite().data.slice();
      assert.equal(
        w.needsBeforeUnloadWarning(),
        false,
        "export-dirty work does not warn after local persistence",
      );
      first.core.clipboard.beginImagePaste({ pixels: blank(), mask: null });
      assert.equal(w.needsBeforeUnloadWarning(), true, "staged paste still needs a close warning");
      first.core.clipboard.cancelFloatingPaste();
      for (let i = 0; i < 5; i++)
        assert.equal(w.createDocument({ width: 4 + i, height: 5 }), "created");
      assert.equal(w.getSnapshot().tabs.length, 6);
      w.select(first.id);
      assert.deepEqual(first.core.canvas.composite().data, bytes);
      assert.equal(first.core.getSnapshot().canUndo, true);
      first.core.history.undo();
      assert.equal(first.core.getSnapshot().dirty, false);
      assert.equal(w.createDocument({ width: 0, height: 2 }), "error");
      assert.equal(w.getSnapshot().tabs.length, 6);
      first.session.clearError();
      w.dispose();
    }
    {
      const w = workspace();
      const first = w.slots[0];
      w.ready = true;
      assert.equal(w.createDocument({ width: 4, height: 4 }), "created");
      const second = w.active;
      w.select(first.id);
      dirty(first.core);
      dirty(second.core);
      for (const slot of w.slots) w.recovery.setPending(slot.id, true);
      w.closeAll();
      assert.equal(w.active.id, first.id);
      assert.equal(w.active.session.getSnapshot().replacement.kind, "close");
      await w.active.session.confirmReplacement();
      await tick();
      assert.equal(w.getSnapshot().tabs.length, 1);
      assert.equal(w.active.id, second.id);
      w.cancelCloseAll();
      w.active.session.cancelReplacement();
      await tick();
      assert.equal(w.getSnapshot().tabs.length, 1);
      assert.equal(w.active.core.getSnapshot().dirty, true);
      w.closeAll();
      await w.active.session.confirmReplacement();
      await tick();
      assert.equal(w.getSnapshot().tabs.length, 0);
      assert.equal(w.getSnapshot().activeId, "");
      assert.equal(w.hasUnsavedChanges(), false);
      assert.equal(w.createDocument({ width: 7, height: 8 }), "created");
      assert.equal(w.getSnapshot().tabs.length, 1);
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      dirty(w.active.core);
      w.recovery.setPending(w.active.id, true);
      w.requestClose();
      assert.ok(w.active.session.getSnapshot().replacement, "pending local save asks before close");
      w.recovery.setPending(w.active.id, false);
      await w.saveLocally(w.active.id);
      await w.active.session.confirmReplacement();
      await tick();
      assert.equal(w.getSnapshot().tabs.length, 1, "successful local Save closes the first tab");
      assert.equal(w.ports.writes, 0, "close dialog Save does not download a file");
      w.closeAll();
      await tick();
      assert.equal(w.getSnapshot().tabs.length, 0, "already saved tab closes without a prompt");
      w.dispose();
    }
    {
      const w = workspace();
      const old = w.active;
      dirty(old.core);
      const original = old.core.canvas.composite().data.slice();
      await w.openSource({ source: "source", name: "fresh.png" });
      assert.equal(w.getSnapshot().tabs.length, 2);
      assert.ok(old.core.getSnapshot().dirty);
      assert.deepEqual(
        old.core.canvas.composite().data,
        original,
        "opening another file preserves every original pixel",
      );
      const imported = w.active;
      const id = imported.session.getActiveRecentId();
      assert.ok(id);
      assert.equal(await w.openRecent(id), true);
      assert.equal(w.active.id, imported.id);
      assert.equal(w.getSnapshot().tabs.length, 2);
      w.select(old.id);
      assert.equal(await w.openRecent(id), true);
      assert.equal(w.active.id, imported.id);
      assert.equal(w.getSnapshot().tabs.length, 2);
      assert.equal(
        await w.openRecent(id),
        true,
        "an already active recent still requests its document view",
      );
      w.requestClose(imported.id);
      await w.openRecent(id);
      assert.equal(w.active.core.getSnapshot().document.name, "fresh.png");
      assert.equal(w.getSnapshot().tabs.length, 2);
      w.dispose();
    }
    {
      const w = workspace();
      await w.openSource({ source: "source", name: "duplicate-click.png" });
      const id = w.active.session.getActiveRecentId();
      assert.ok(id);
      w.requestClose(w.active.id);
      const before = w.getSnapshot().tabs.length;
      const [first, second] = await Promise.all([w.openRecent(id), w.openRecent(id)]);
      assert.equal(first, true);
      assert.equal(second, true);
      assert.equal(w.getSnapshot().tabs.length, before + 1, "repeat clicks open only one tab");
      w.dispose();
    }
    {
      const w = workspace();
      await w.openSource({ source: "source", name: "clearable.png" });
      assert.ok(w.active.session.getSnapshot().recentFiles.length);
      await w.clearRecentFiles();
      await Promise.all(w.slots.map((slot) => slot.session.flushPersistence()));
      await tick();
      assert.deepEqual(
        w.active.session.getSnapshot().recentFiles,
        [],
        "Clear Recent Files updates every open session",
      );
      assert.deepEqual(w.ports.recent, [], "Clear Recent Files persists an empty list");
      await w.active.session.restoreRecent();
      assert.deepEqual(
        w.active.session.getSnapshot().recentFiles,
        [],
        "opening the menu after clear does not hydrate removed entries",
      );
      const closedId = w.active.id,
        name = w.active.core.getSnapshot().document.name;
      const pixels = w.active.core.canvas.composite().data.slice();
      w.requestClose(closedId);
      assert.equal(
        w.getSnapshot().canReopenClosedFile,
        true,
        "closed files become available to Reopen Closed File",
      );
      await w.clearRecentFiles();
      assert.deepEqual(
        w.ports.recent,
        [],
        "clearing recent history does not remove the closed-file stack",
      );
      assert.equal(
        await w.reopenClosedFile(),
        true,
        "Reopen Closed File works after recent history is cleared",
      );
      assert.equal(w.active.core.getSnapshot().document.name, name);
      assert.deepEqual(
        w.active.core.canvas.composite().data,
        pixels,
        "reopened closed file retains its pixel data",
      );
      assert.equal(
        w.getSnapshot().canReopenClosedFile,
        false,
        "reopening consumes the newest closed-file entry",
      );
      w.dispose();
    }
    {
      const w = workspace();
      w.ready = true;
      await w.openSource({ source: "first-source", name: "same.png" });
      const first = w.active;
      const firstId = first.session.getActiveRecentId();
      await w.openSource({ source: "second-source", name: "same.png" });
      const second = w.active;
      const secondId = second.session.getActiveRecentId();
      const original = second.core.canvas.composite().data.slice();
      assert.ok(firstId && secondId && firstId !== secondId);
      await assert.rejects(w.deleteBrowserCopy(firstId), /Close the project/);
      w.requestClose(first.id);
      await tick();
      await w.deleteBrowserCopy(firstId);
      assert.ok(!w.getRecentFiles().some((file) => file.id === firstId));
      assert.ok(w.getRecentFiles().some((file) => file.id === secondId));
      assert.ok(!w.ports.recent.some((file) => file.id === firstId), "durable cache is removed");
      assert.ok(w.ports.recent.some((file) => file.id === secondId));
      assert.equal(w.getSnapshot().canReopenClosedFile, false, "closed-file cache is removed");
      assert.equal(w.ports.writes, 0, "deletion never invokes the source-file write port");
      assert.deepEqual(second.core.canvas.composite().data, original);
      w.dispose();
    }
    {
      const w = workspace();
      let resumeHydration;
      w.ports.loadRecentImages = () =>
        new Promise((resolve) => {
          resumeHydration = resolve;
        });
      const pending = w.active.session.restoreRecent();
      w.active.session.clearRecentFiles();
      resumeHydration([{ id: "stale", name: "Stale.png", image: blank() }]);
      await pending;
      assert.deepEqual(
        w.active.session.getSnapshot().recentFiles,
        [],
        "a pending IndexedDB hydration cannot undo an explicit clear",
      );
      w.dispose();
    }
    {
      const w = workspace(),
        first = w.slots[0],
        firstName = first.core.getSnapshot().document.name;
      w.createDocument({ width: 4, height: 4 });
      const second = w.active,
        secondName = second.core.getSnapshot().document.name;
      w.requestClose(first.id);
      w.requestClose(second.id);
      assert.equal(await w.reopenClosedFile(), true);
      assert.equal(
        w.active.core.getSnapshot().document.name,
        secondName,
        "Reopen Closed File uses last-in-first-out order",
      );
      assert.equal(await w.reopenClosedFile(), true);
      assert.equal(w.active.core.getSnapshot().document.name, firstName);
      assert.equal(w.getSnapshot().canReopenClosedFile, false);
      w.dispose();
    }
    {
      const w = workspace();
      await w.openSource({ source: "source", name: "restored.png" });
      const opened = w.active,
        id = opened.session.getActiveRecentId();
      assert.ok(id);
      const first = w.slots[0];
      first.core.canvas.setView({ zoom: 3, pan: { x: 11, y: -9 } });
      opened.core.canvas.setView({ zoom: 0.5, pan: { x: -4, y: 5 } });
      const saved = {
        layout: w.recoveryLayout(),
        documents: new Map(w.slots.map((slot) => [slot.id, slot.core.getPersistenceSnapshot()])),
      };
      assert.equal(saved.layout.recentIds[opened.id], id);
      const reloaded = createWorkspace();
      reloaded.recovery.saved = saved;
      reloaded.ports.recent = w.ports.recent;
      await reloaded.initialize();
      assert.equal(reloaded.getSlot(first.id).core.getSnapshot().view.zoom, 3);
      assert.deepEqual(reloaded.getSlot(first.id).core.getSnapshot().view.pan, { x: 11, y: -9 });
      assert.equal(reloaded.active.id, opened.id);
      assert.equal(reloaded.active.core.getSnapshot().view.zoom, 0.5);
      assert.deepEqual(reloaded.active.core.getSnapshot().view.pan, { x: -4, y: 5 });
      assert.equal(
        reloaded.initializeDocumentViewport(reloaded.active.core, { width: 850, height: 336 }),
        false,
        "a recovered viewpoint takes priority over automatic fit",
      );
      const before = reloaded.getSnapshot().tabs.length;
      reloaded.select(reloaded.slots[0].id);
      assert.equal(await reloaded.openRecent(id), true);
      assert.equal(
        reloaded.active.id,
        opened.id,
        "recovered recent identity selects its original tab",
      );
      assert.equal(reloaded.active.core.getSnapshot().view.zoom, 0.5);
      assert.deepEqual(reloaded.active.core.getSnapshot().view.pan, { x: -4, y: 5 });
      assert.equal(
        reloaded.getSnapshot().tabs.length,
        before,
        "reopening after reload does not duplicate the tab",
      );
      reloaded.dispose();
      w.dispose();
    }
    {
      const w = createWorkspace();
      await w.initialize();
      w.createDocument({ width: 100, height: 100 });
      const core = w.active.core,
        before = core.getSnapshot();
      assert.equal(w.initializeDocumentViewport(core, { width: 0, height: 336 }), false);
      assert.equal(w.initializeDocumentViewport(core, { width: 850, height: 336 }), true);
      assert.equal(core.getSnapshot().view.zoom, 3, "new documents fit the measured work area");
      assert.deepEqual(core.getSnapshot().view.pan, { x: 0, y: 0 });
      assert.equal(core.getSnapshot().dirty, before.dirty);
      assert.equal(core.getSnapshot().persistenceRevision, before.persistenceRevision);
      assert.equal(w.initializeDocumentViewport(core, { width: 50, height: 50 }), false);
      assert.equal(core.getSnapshot().view.zoom, 3, "layout changes do not repeat automatic fit");

      w.createDocument({ width: 100, height: 100 });
      const second = w.active.core;
      assert.equal(w.initializeDocumentViewport(second, { width: 50, height: 50 }), true);
      assert.equal(second.getSnapshot().view.zoom, 0.5, "large documents scale down to fit");
      w.select(w.slots.find((slot) => slot.core === core).id);
      assert.equal(w.initializeDocumentViewport(core, { width: 50, height: 50 }), false);
      assert.equal(core.getSnapshot().view.zoom, 3, "switching tabs retains the fitted viewpoint");

      w.createDocument({ width: 100, height: 100 });
      w.active.core.canvas.setView({ zoom: 2, pan: { x: 11, y: -9 } });
      assert.equal(w.initializeDocumentViewport(w.active.core, { width: 850, height: 336 }), false);
      assert.equal(w.active.core.getSnapshot().view.zoom, 2, "manual zoom cancels pending fit");
      w.dispose();
    }
    {
      const w = workspace(),
        source = w.active;
      source.core.selection.selectAll();
      const original = source.core.canvas.composite().data.slice();
      const clipboard = new ImageClipboard({ read: async () => null, write: async () => {} });
      const actions = createClipboardActions({
        getCore: () => w.active.core,
        createDocument: ({ pixels, palette }) => w.createDocumentFromImage(pixels, palette),
        clipboard,
      });
      assert.equal(await actions.copy(), true);
      w.createDocument({ width: 3, height: 3 });
      const target = w.active;
      assert.equal(await actions.paste(), true);
      target.core.clipboard.commitFloatingPaste();
      assert.deepEqual(
        target.core.canvas.composite().data,
        original,
        "clipboard pastes exact nonblank RGBA across documents",
      );
      assert.equal(target.core.getSnapshot().dirty, true);
      target.core.history.undo();
      assert.ok(
        target.core.canvas.composite().data.every((v) => v === 0),
        "paste is one independent undo",
      );
      assert.deepEqual(
        source.core.canvas.composite().data,
        original,
        "target undo does not alter source",
      );
      assert.equal(await actions.pasteNewSprite(), true);
      assert.deepEqual(w.active.core.canvas.composite().data, original);
      assert.equal(
        w.active.core.getSnapshot().dirty,
        true,
        "new sprite clipboard contents must prompt to save",
      );
      w.dispose();
    }
    {
      const w = workspace(),
        first = w.active;
      w.createDocument({ width: 4, height: 4 });
      const second = w.active;
      first.core.canvas.setView({ zoom: 3, pan: { x: 11, y: 9 } });
      second.core.canvas.setView({ zoom: 7, pan: { x: -4, y: 5 } });
      first.core.drawing.settings.setSettings({
        tool: "pencil",
        foreground: [21, 43, 65, 255],
        background: [11, 22, 33, 255],
        brush: { shape: "square", size: 3, angle: 0 },
        pixelPerfect: true,
        ink: "simple",
      });
      first.core.drawing.settings.setSettings({
        tool: "eraser",
        brush: { shape: "circle", size: 7, angle: 0 },
        pixelPerfect: false,
      });
      const before = second.core.getSnapshot(),
        pixels = second.core.canvas.composite().data.slice();
      w.select(second.id);
      assert.equal(second.core.getSnapshot().settings.tool, "eraser");
      assert.equal(second.core.getSnapshot().settings.brush.size, 7);
      assert.deepEqual(second.core.getSnapshot().settings.foreground, [21, 43, 65, 255]);
      assert.deepEqual(second.core.getSnapshot().settings.background, [11, 22, 33, 255]);
      assert.equal(
        second.core.getSnapshot().persistenceRevision,
        before.persistenceRevision,
        "shared preferences do not generate recovery revisions",
      );
      assert.equal(second.core.getSnapshot().dirty, before.dirty);
      assert.deepEqual(second.core.getSnapshot().view, before.view);
      assert.deepEqual(second.core.canvas.composite().data, pixels);
      second.core.drawing.settings.setSettings({ tool: "pencil" });
      assert.equal(second.core.getSnapshot().settings.brush.size, 3);
      assert.equal(second.core.getSnapshot().settings.pixelPerfect, true);
      second.core.drawing.settings.setSettings({ brush: { shape: "circle", size: 5, angle: 0 } });
      w.select(first.id);
      assert.equal(first.core.getSnapshot().settings.brush.size, 5);
      assert.equal(first.core.getSnapshot().view.zoom, 3);
      first.core.drawing.settings.setSettings({ tool: "eraser" });
      assert.equal(first.core.getSnapshot().settings.brush.size, 7);
      w.createDocument({ width: 3, height: 3 });
      assert.equal(w.active.core.getSnapshot().settings.tool, "eraser");
      w.active.core.drawing.settings.setSettings({ tool: "pencil" });
      assert.equal(
        w.active.core.getSnapshot().settings.brush.size,
        5,
        "new documents inherit per-tool memory",
      );
      const current = w.active;
      current.core.selection.selectAll();
      current.core.clipboard.beginImagePaste({ pixels: blank(), mask: null });
      const floating = current.core.getSnapshot().floatingPaste,
        revision = current.core.getSnapshot().persistenceRevision;
      w.select(first.id);
      first.core.drawing.settings.setSettings({ foreground: [21, 43, 65, 255] });
      w.select(current.id);
      assert.equal(
        current.core.getSnapshot().floatingPaste,
        floating,
        "tab activation does not commit staged pixels",
      );
      assert.equal(current.core.getSnapshot().persistenceRevision, revision);
      const settings = current.core.drawing.settings.capturePreferences();
      settings.settings.font = {
        height: 1,
        lineHeight: 1,
        glyphs: { A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) } },
      };
      current.core.drawing.settings.applyPreferences(settings);
      settings.settings.font.glyphs.A.alpha[0] = 0;
      settings.settings.foreground[0] = 0;
      settings.brushes[0][1].size = 60;
      assert.equal(
        current.core.getSnapshot().settings.font.glyphs.A.alpha[0],
        255,
        "settings handoff owns font masks",
      );
      assert.equal(
        current.core.getSnapshot().settings.foreground[0],
        21,
        "settings handoff owns color tuples",
      );
      const captured = current.core.drawing.settings.capturePreferences();
      captured.settings.font.glyphs.A.alpha[0] = 0;
      assert.equal(
        current.core.getSnapshot().settings.font.glyphs.A.alpha[0],
        255,
        "captured snapshot cannot mutate current preferences",
      );
      current.core.clipboard.cancelFloatingPaste();
      current.core.drawing.settings.setSettings({ tool: "text" });
      assert.equal(
        current.core.drawing.text.beginInlineText({ x: 0, y: 0, width: 3, height: 3 }),
        true,
      );
      current.core.drawing.text.updateInlineText({ text: "A" });
      const textDraft = current.core.getSnapshot().inlineText,
        textRevision = current.core.getSnapshot().persistenceRevision;
      w.select(first.id);
      w.select(current.id);
      assert.equal(
        current.core.getSnapshot().inlineText,
        textDraft,
        "tab switching keeps pending text editable",
      );
      assert.equal(current.core.getSnapshot().persistenceRevision, textRevision);
      current.core.drawing.text.cancelInlineText();
      current.core.drawing.settings.setSettings({ foreground: [8, 9, 10, 255], tool: "eraser" });
      w.requestClose(current.id);
      assert.deepEqual(
        w.active.core.getSnapshot().settings.foreground,
        [8, 9, 10, 255],
        "closing active tab transfers app colors to the next view",
      );

      w.dispose();
    }
    {
      const previous = globalThis.localStorage;
      const values = new Map([["xse.workspace.compose-groups.v1", "true"]]);
      let writes = 0;
      globalThis.localStorage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
          writes++;
        },
      };
      try {
        const w = workspace(),
          first = w.active;
        w.createDocument({ width: 3, height: 3 });
        const second = w.active;
        assert.equal(
          first.core.getSnapshot().settings.composeGroups,
          true,
          "global preference loaded at workspace creation",
        );
        first.core.drawing.settings.setSettings({ composeGroups: false });
        assert.equal(values.get("xse.workspace.compose-groups.v1"), "false");
        assert.equal(writes, 1);
        w.select(second.id);
        assert.equal(w.active.core.getSnapshot().settings.composeGroups, false);
        assert.equal(writes, 1, "tab transfer does not create a preference persistence cycle");
        w.createDocument({ width: 3, height: 3 });
        assert.equal(w.active.core.getSnapshot().settings.composeGroups, false);
        assert.equal(writes, 1);
        w.dispose();
      } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
      }
    }
    console.log(
      "Workspace verified: arbitrary documents, isolated undo, sequential Close All, cancellation, clear/reopen recent files, LIFO reopen, and recent identity.",
    );
    {
      const w = workspace();
      w.createDocument({ width: 4, height: 4 });
      w.select(w.slots[0].id);
      const core = w.active.core;
      w.ready = true;
      let publications = 0;
      const unsubscribe = w.subscribe(() => publications++);
      const initial = w.getSnapshot();
      for (let i = 0; i < 120; i++) core.pointerMove({ x: i % 3, y: i % 3 });
      for (let i = 0; i < 20; i++) core.canvas.setView({ pan: { x: i, y: -i } });
      assert.equal(publications, 0, "pointer and view updates stay local to the active editor");
      assert.equal(
        w.getSnapshot(),
        initial,
        "workspace snapshot identity stays stable during gestures",
      );
      dirty(core);
      w.recovery.setPending(w.active.id, true);
      assert.equal(
        w.getSnapshot().tabs[0].modified,
        true,
        "the Web checkpoint status controls the tab dot",
      );
      const afterStroke = publications;
      core.pointerDown({ x: 0, y: 0 });
      core.pointerUp();
      assert.equal(
        publications,
        afterStroke,
        "already-dirty drawing does not repaint all document tabs",
      );
      core.history.markSaved("renamed.png");
      assert.equal(w.getSnapshot().tabs[0].name, "renamed.png");
      assert.equal(
        w.getSnapshot().tabs[0].modified,
        true,
        "an external file save does not clear a pending Web dot",
      );
      w.recovery.setPending(w.active.id, false);
      assert.equal(w.getSnapshot().tabs[0].modified, false);
      w.select(w.slots[1].id);
      assert.equal(w.getSnapshot().activeId, w.slots[1].id);
      unsubscribe();
      w.dispose();
      {
        const w = workspace(),
          a = w.slots[0];
        w.createDocument({ width: 4, height: 4 });
        const b = w.active;
        a.core.canvas.setView({ appearance: "dark", zoom: 3, pan: { x: 11, y: 9 }, grid: true });
        b.core.canvas.setView({ appearance: "light", zoom: 7, pan: { x: -5, y: 2 }, grid: false });
        const before = b.core.getSnapshot(),
          expectedView = { ...before.view, appearance: "dark" };
        w.select(b.id);
        assert.deepEqual(
          b.core.getSnapshot().view,
          expectedView,
          "appearance is global while zoom, pan and grid remain document-local",
        );
        assert.equal(
          b.core.getSnapshot().persistenceRevision,
          before.persistenceRevision,
          "appearance transfer does not alter document recovery revision",
        );
        w.select(a.id);
        assert.equal(a.core.getSnapshot().view.appearance, "dark");
        assert.equal(a.core.getSnapshot().view.grid, true);
        w.requestClose(a.id);
        assert.equal(
          w.active.core.getSnapshot().view.appearance,
          "dark",
          "closing active document retains application appearance",
        );
        w.requestClose(b.id);
        assert.equal(w.getSnapshot().tabs.length, 0);
        assert.equal(
          w.active.core.getSnapshot().view.appearance,
          "dark",
          "empty workspace retains appearance",
        );
        w.createDocument({ width: 3, height: 3 });
        assert.equal(
          w.active.core.getSnapshot().view.appearance,
          "dark",
          "new document after empty workspace inherits appearance",
        );
        w.dispose();
      }
      console.log(
        "Workspace publication isolation: hover, pan and repeated strokes stay local; dirty/name/selection changes remain observable.",
      );
    }
  }, 60_000);
});
