import assert from "node:assert/strict";
import { serialize, deserialize } from "node:v8";

import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";

describe("workspace-recovery", () => {
  it("workspace-recovery behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export { WorkspaceRecovery } from './apps/editor/src/managers/workspace/workspace-recovery'; export { RecoverySettingsStore } from './apps/editor/src/adapters/storage/recovery-settings-store'; export { RasterEditor } from './packages/editor-core/src/editor/RasterEditor.ts'; export { createBrowserProjectRepository } from './apps/editor/src/adapters/storage/project-storage';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      WorkspaceRecovery,
      RasterEditor,
      createBrowserProjectRepository,
      RecoverySettingsStore,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    {
      const memory = new Map();
      const storage = {
        getItem: (key) => memory.get(key) ?? null,
        setItem: (key, value) => memory.set(key, value),
      };
      const first = new RecoverySettingsStore("one", storage),
        second = new RecoverySettingsStore("two", storage);
      assert.deepEqual(first.load(), { enabled: true, intervalMinutes: 2, retentionDays: 7 });
      first.save({ enabled: false, intervalMinutes: 1 / 6, retentionDays: 0 });
      assert.deepEqual(new RecoverySettingsStore("one", storage).load(), {
        enabled: false,
        intervalMinutes: 1 / 6,
        retentionDays: 0,
      });
      assert.equal(second.load().enabled, true, "preferences are isolated by storage namespace");
      storage.setItem("one:recovery-settings-v1", "{broken");
      assert.equal(first.load().intervalMinutes, 2, "malformed settings recover default");
    }
    const factory = new IDBFactory();
    const codec = () => ({
      encode: async (snapshot) => new Uint8Array(serialize(snapshot)),
      decode: async (bytes) => deserialize(bytes),
      close() {},
    });
    const repo = (name) =>
      createBrowserProjectRepository({ databaseName: name, factory, preferOpfs: false });
    const preferenceMemory = new Map();
    const preferenceStorage = {
      getItem: (key) => preferenceMemory.get(key) ?? null,
      setItem: (key, value) => preferenceMemory.set(key, value),
    };
    let nextRecoveryId = 0;
    const newRecovery = ({
      repository,
      codec: codecPort = codec(),
      now,
      databaseName,
      settingsStore,
    } = {}) =>
      new WorkspaceRecovery({
        repository,
        codec: codecPort,
        settingsStore: settingsStore ?? new RecoverySettingsStore(databaseName, preferenceStorage),
        createId: () => `recovery-test-${++nextRecoveryId}`,
        ...(now ? { now } : {}),
      });
    const blank = (width = 4) => ({ width, height: 4, data: new Uint8ClampedArray(width * 4 * 4) });
    const layout = {
      activeId: "one",
      slotIds: ["one", "two"],
      views: ["one", "two"].map((id) => ({ id, documentId: id })),
    };
    const stroke = (editor, x = 1) => {
      editor.drawing.settings.setSettings({ foreground: [255, 7, 11, 255] });
      editor.pointerDown({ x, y: 1 });
      editor.pointerUp();
    };
    const readManifest = async (repository) =>
      JSON.parse(
        new TextDecoder().decode((await repository.load("xse.workspace.manifest.v2")).bytes),
      );
    const readProject = async (repository, id) => deserialize((await repository.load(id)).bytes);
    const pixel = (snapshot, x, y) => {
      const editor = new RasterEditor();
      editor.restorePersistenceSnapshot(snapshot);
      const image = editor.canvas.composite();
      return Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x + 1) * 4));
    };
    {
      const repository = repo("delete-browser-copy");
      const recovery = newRecovery({ repository });
      await recovery.restore();
      const first = new RasterEditor(blank(), "same.png");
      const second = new RasterEditor(blank(), "same.png");
      recovery.start(
        [
          { id: "one", core: first },
          { id: "two", core: second },
        ],
        layout,
      );
      stroke(first);
      stroke(second);
      await recovery.flush();
      const firstId = recovery.getSlotProjectId("one");
      const secondId = recovery.getSlotProjectId("two");
      assert.ok(firstId && secondId);
      const firstBackups = (await repository.list()).filter(
        (record) => record.metadata.sourceProjectId === firstId,
      );
      assert.ok(firstBackups.length, "the deleted project has a recovery backup");
      await assert.rejects(
        recovery.deleteClosedProjects([firstId]),
        /Close the project/,
        "an open project cannot be deleted underneath autosave",
      );
      assert.ok(await repository.load(firstId));
      recovery.updateLayout({
        activeId: "two",
        slotIds: ["two"],
        views: ["two"].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      await recovery.deleteClosedProjects([firstId]);
      assert.equal(await repository.load(firstId), null);
      for (const backup of firstBackups)
        assert.equal(await repository.load(backup.projectId), null);
      assert.ok(await repository.load(secondId), "a same-name project is preserved");
      assert.ok(await repository.load("xse.workspace.manifest.v2"), "the workspace is preserved");
      await recovery.flush();
      assert.equal(
        await repository.load(firstId),
        null,
        "flushing cannot recreate the deleted copy",
      );
      recovery.dispose();
      const reloaded = repo("delete-browser-copy");
      assert.equal(await reloaded.load(firstId), null, "deletion survives a new connection");
      assert.ok(await reloaded.load(secondId));
      reloaded.close();
    }
    const tracked = (repository) => {
      const saves = [];
      return {
        saves,
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: (input) => {
          saves.push(input);
          return repository.save(input);
        },
      };
    };
    {
      const first = newRecovery({
        repository: repo("dirty-reload-web-dot"),
        codec: codec(),
      });
      await first.restore(["one"]);
      const editor = new RasterEditor(blank(), "Web saved.png");
      first.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await first.flush();
      assert.equal(editor.getSnapshot().dirty, true, "external file remains dirty");
      assert.equal(first.isSlotUnpersisted("one"), false, "Web save clears the tab dot");
      first.dispose();
      const restored = newRecovery({
        repository: repo("dirty-reload-web-dot"),
        codec: codec(),
      });
      const saved = await restored.restore(["one"]);
      const reopened = new RasterEditor();
      reopened.restorePersistenceSnapshot(saved.documents.get("one"));
      restored.start([{ id: "one", core: reopened }], saved.layout);
      assert.equal(
        reopened.getSnapshot().dirty,
        true,
        "reload retains external file dirty metadata",
      );
      assert.equal(restored.isSlotUnpersisted("one"), false, "reload starts with a saved Web tab");
      restored.dispose();
    }
    {
      const repository = tracked(repo("marquee-autosave-isolation"));
      const recovery = newRecovery({ repository, codec: codec() });
      await recovery.restore();
      const editor = new RasterEditor(blank(16), "marquee.png");
      recovery.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      const savedBefore = repository.saves.length;
      const revisionBefore = editor.getSnapshot().persistenceRevision;
      editor.drawing.settings.setSettings({ tool: "marquee" });
      editor.pointerDown({ x: 1, y: 1, screen: { x: 10, y: 10 }, timeStamp: 0 });
      editor.pointerMove({ x: 8, y: 3, screen: { x: 80, y: 30 }, timeStamp: 100 });
      editor.pointerUp({ x: 8, y: 3, screen: { x: 80, y: 30 }, timeStamp: 120 });
      assert.ok(editor.getSnapshot().document.selection, "marquee remains selected after release");
      assert.equal(
        editor.getSnapshot().persistenceRevision,
        revisionBefore,
        "selection alone does not schedule recovery",
      );
      await recovery.flush();
      assert.equal(
        repository.saves.length,
        savedBefore,
        "autosave does not write selection-only changes",
      );
      assert.ok(
        editor.getSnapshot().document.selection,
        "a recovery flush cannot clear a live selection",
      );
      recovery.dispose();
    }
    {
      const repository = repo("closed-project-recent");
      const recovery = newRecovery({ repository, codec: codec() });
      await recovery.restore();
      const editor = new RasterEditor(blank(), "closed.png");
      recovery.start([{ id: "original", core: editor }], {
        activeId: "original",
        slotIds: ["original"],
        views: ["original"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await recovery.flush();
      const projectId = (await readManifest(repository)).entries[0].projectId;
      recovery.updateLayout({
        activeId: "",
        slotIds: [],
        views: [].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      recovery.dispose();
      const reopenedRepository = repo("closed-project-recent");
      const restored = newRecovery({ repository: reopenedRepository, codec: codec() });
      const result = await restored.restore();
      assert.deepEqual(result.layout, { activeId: "", slotIds: [], views: [] });
      restored.start([], result.layout);
      assert.equal(
        (await restored.listClosedProjects()).some((item) => item.id === projectId),
        true,
        "closed local project appears in Home recents after reload",
      );
      const saved = await restored.loadClosedProject(projectId);
      const reopened = new RasterEditor();
      restored.start([{ id: "reopened", core: reopened }], {
        activeId: "reopened",
        slotIds: ["reopened"],
        views: ["reopened"].map((id) => ({ id, documentId: id })),
      });
      restored.adoptClosedProject("reopened", projectId, saved.head);
      reopened.restorePersistenceSnapshot(saved.snapshot);
      await restored.flush();
      assert.equal(
        (await readManifest(reopenedRepository)).entries[0].projectId,
        projectId,
        "Home reopen keeps the same local project identity",
      );
      assert.equal(
        (await restored.listClosedProjects()).some((item) => item.id === projectId),
        false,
        "reopened project leaves closed recents",
      );
      assert.equal(reopened.getSnapshot().dirty, true, "reopen retains external export state");
      restored.dispose();
    }
    {
      const repository = repo("discard-closed-local-edits");
      const recovery = newRecovery({ repository, codec: codec() });
      await recovery.restore();
      const editor = new RasterEditor(blank(), "discard.png");
      recovery.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      const projectId = (await readManifest(repository)).entries[0].projectId;
      stroke(editor);
      recovery.discardSlotChanges("one");
      recovery.updateLayout({
        activeId: "",
        slotIds: [],
        views: [].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      assert.deepEqual(
        pixel(await readProject(repository, projectId), 1, 1),
        [0, 0, 0, 0],
        "Don't Save leaves the last completed local checkpoint intact",
      );
      recovery.dispose();
    }
    {
      const repository = repo("close-during-local-write");
      let entered, release;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: async (input) => {
          if (input.metadata.kind === "editor-project") {
            entered();
            await gate;
          }
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      recovery.start([{ id: "one", core: new RasterEditor(blank()) }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      const writing = recovery.flush();
      await started;
      assert.equal(
        recovery.discardSlotChanges("one"),
        false,
        "Don't Save waits while a local write is in flight",
      );
      release();
      await writing;
      recovery.dispose();
    }
    {
      const repository = repo("recent-identity-workspace");
      const recovery = newRecovery({ repository, codec: codec() });
      await recovery.restore();
      const one = new RasterEditor(blank(), "same.png");
      const two = new RasterEditor(blank(), "same.png");
      recovery.start(
        [
          { id: "one", core: one },
          { id: "two", core: two },
        ],
        {
          activeId: "one",
          slotIds: ["one", "two"],
          views: ["one", "two"].map((id) => ({ id, documentId: id })),
          recentIds: { one: "recent-a", two: "recent-b" },
        },
      );
      await recovery.flush();
      assert.deepEqual(
        (await readManifest(repository)).entries.map((entry) => entry.recentId),
        ["recent-a", "recent-b"],
      );
      recovery.dispose();
      const restored = newRecovery({
        repository: repo("recent-identity-workspace"),
        codec: codec(),
      });
      assert.deepEqual(
        (await restored.restore()).layout.recentIds,
        { one: "recent-a", two: "recent-b" },
        "same-name documents retain separate recent identities after reload",
      );
      restored.dispose();
    }
    {
      const originalWorker = globalThis.Worker;
      let workers = 0;
      globalThis.Worker = class {
        constructor() {
          workers++;
        }
      };
      try {
        const unused = newRecovery({ repository: repo("unused-strict-mode-workspace") });
        assert.equal(
          workers,
          0,
          "constructing a discarded StrictMode workspace does not start workers",
        );
        unused.dispose();
        assert.equal(workers, 0);
      } finally {
        if (originalWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = originalWorker;
      }
    }
    {
      const store = tracked(repo("recovery-workspace")),
        recovery = newRecovery({ repository: store, codec: codec() });
      assert.equal(await recovery.restore(layout.slotIds), null);
      const one = new RasterEditor(blank()),
        two = new RasterEditor(blank());
      let publishedResumable = false;
      const unsubscribeResumable = recovery.subscribe(() => {
        if (!recovery.isSlotUnpersisted("one")) publishedResumable = true;
      });
      recovery.start(
        [
          { id: "one", core: one },
          { id: "two", core: two },
        ],
        layout,
      );
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        true,
        "first workspace checkpoint is still pending",
      );
      assert.equal(
        recovery.isSlotUnpersisted("one"),
        true,
        "first document checkpoint shows a pending dot",
      );
      await recovery.flush();
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        false,
        "completed local save needs no browser close warning",
      );
      assert.equal(
        recovery.isSlotUnpersisted("one"),
        false,
        "locally saved document clears its dot",
      );
      assert.equal(publishedResumable, true, "manifest publication notifies the tab dot to clear");
      unsubscribeResumable();
      const initialManifest = await readManifest(store);
      const originalId = initialManifest.entries[0].projectId;
      assert.ok(originalId);
      assert.ok(initialManifest.entries[1].projectId);
      const initialHead = (await store.load(originalId)).record.head.id;
      one.drawing.settings.setSettings({ foreground: [255, 7, 11, 255] });
      one.pointerDown({ x: 1, y: 1 });
      await recovery.flush();
      assert.equal(
        (await store.load(originalId)).record.head.id,
        initialHead,
        "in-progress strokes do not persist a half-committed document",
      );
      one.pointerUp();
      assert.equal(one.getSnapshot().dirty, true);
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        true,
        "committed edit awaiting autosave needs a warning",
      );
      assert.equal(recovery.isSlotUnpersisted("one"), true);
      await recovery.flush();
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        false,
        "dirty external file can still be locally saved",
      );
      assert.equal(recovery.isSlotUnpersisted("one"), false);
      assert.equal(
        one.getSnapshot().dirty,
        true,
        "recovery writes do not mark the external document saved",
      );
      const checkpoint = await readProject(store, originalId);
      assert.equal(checkpoint.dirty, true);
      assert.deepEqual(pixel(checkpoint, 1, 1), [255, 7, 11, 255]);
      assert.notEqual((await store.load(originalId)).record.head.id, initialHead);
      one.timeline.renameLayer("Painted foreground");
      one.timeline.setFrameDuration(270);
      await recovery.flush();
      const metadata = await readProject(store, originalId);
      assert.equal(metadata.document.layer.name, "Painted foreground");
      assert.equal(metadata.document.timeline.frames[0].duration, 270);
      const writesBeforeView = store.saves.length;
      one.drawing.settings.setSettings({ foreground: [0, 255, 0, 255] });
      await recovery.flush();
      assert.equal(
        store.saves.length,
        writesBeforeView,
        "UI settings do not checkpoint document content",
      );
      // Replace while there is an unpersisted committed edit; the retired snapshot must survive.
      stroke(one, 2);
      one.document.loadImage(blank(6));
      await recovery.flush();
      const replacement = await readManifest(store);
      assert.notEqual(replacement.entries[0].projectId, originalId);
      assert.deepEqual(pixel(await readProject(store, originalId), 2, 1), [255, 7, 11, 255]);
      assert.equal((await readProject(store, replacement.entries[0].projectId)).document.width, 6);
      assert.equal(
        recovery.getSnapshot().error,
        null,
        "retiring projects complete without closure errors",
      );
      recovery.updateLayout({
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        true,
        "unpublished tab layout needs a warning",
      );
      await recovery.flush();
      assert.equal(recovery.hasUnpersistedWorkspaceChanges(), false);
      assert.deepEqual(
        (await readManifest(store)).entries.map((e) => e.slotId),
        ["one"],
      );
      assert.ok(
        await store.load(initialManifest.entries[1].projectId),
        "closing a tab retains its project snapshot",
      );
      recovery.dispose();

      const restoredStore = tracked(repo("recovery-workspace")),
        restored = newRecovery({ repository: restoredStore, codec: codec() });
      const result = await restored.restore(layout.slotIds);
      assert.deepEqual(result.layout, {
        activeId: "one",
        slotIds: ["one"],
        views: [{ id: "one", documentId: "one" }],
      });
      assert.equal(result.documents.get("one").document.width, 6);
      const editor = new RasterEditor(blank());
      editor.restorePersistenceSnapshot(result.documents.get("one"));
      restored.start([{ id: "one", core: editor }], result.layout);
      await restored.flush();
      assert.equal(
        restoredStore.saves.length,
        0,
        "restored unchanged projects and manifest are not rewritten",
      );
      stroke(editor);
      await restored.flush();
      assert.equal(
        (await readManifest(restoredStore)).entries[0].projectId,
        replacement.entries[0].projectId,
        "restoration retains durable identity",
      );
      restored.dispose();
    }
    {
      let writes = 0;
      const failed = newRecovery({
        repository: {
          load: async () => {
            throw new Error("read failed");
          },
          save: async () => {
            writes++;
          },
          list: async () => [],
          close() {},
        },
        codec: codec(),
      });
      await assert.rejects(failed.restore(["one"]), /read failed/);
      const editor = new RasterEditor(blank());
      failed.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await failed.flush();
      assert.equal(writes, 0, "failed hydration never overwrites recovery with defaults");
      assert.match(failed.getSnapshot().error.message, /read failed/);
      assert.equal(
        failed.hasUnpersistedWorkspaceChanges(),
        true,
        "failed hydration cannot claim local durability",
      );
      failed.dispose();
    }
    {
      const seedStore = repo("recovery-race"),
        seed = newRecovery({ repository: seedStore, codec: codec() });
      await seed.restore(["one"]);
      seed.start([{ id: "one", core: new RasterEditor(blank()) }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      await seed.flush();
      seed.dispose();
      const clients = await Promise.all(
        [0, 1].map(async () => {
          const store = repo("recovery-race"),
            recovery = newRecovery({ repository: store, codec: codec() });
          const result = await recovery.restore(["one"]);
          const editor = new RasterEditor(blank());
          editor.restorePersistenceSnapshot(result.documents.get("one"));
          recovery.start([{ id: "one", core: editor }], result.layout);
          await recovery.flush();
          return { store, recovery, editor };
        }),
      );
      stroke(clients[0].editor, 1);
      stroke(clients[1].editor, 2);
      const writes = await Promise.allSettled(clients.map((c) => c.recovery.flush()));
      assert.equal(
        writes.filter((r) => r.status === "fulfilled").length,
        1,
        "one browser tab wins concurrent project CAS",
      );
      assert.equal(writes.find((r) => r.status === "rejected").reason.code, "conflict");
      const loser = clients[writes.findIndex((r) => r.status === "rejected")];
      assert.equal(loser.recovery.getSnapshot().documents.one.status, "error");
      assert.equal(loser.editor.getSnapshot().dirty, true);
      for (const client of clients) client.recovery.dispose();
    }
    {
      const store = repo("dynamic-workspace"),
        recovery = newRecovery({ repository: store, codec: codec() });
      await recovery.restore();
      const slots = Array.from({ length: 5 }, (_, i) => ({
        id: `dynamic-${i}`,
        core: new RasterEditor(blank(i + 1)),
      }));
      recovery.start(slots.slice(0, 2), {
        activeId: slots[0].id,
        slotIds: slots.slice(0, 2).map((s) => s.id),
        views: slots
          .slice(0, 2)
          .map((s) => s.id)
          .map((id) => ({ id, documentId: id })),
      });
      // Re-registering existing slots must not install duplicate subscriptions.
      recovery.start(slots, {
        activeId: slots[4].id,
        slotIds: slots.map((s) => s.id),
        views: slots.map((s) => s.id).map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      recovery.dispose();
      const restored = newRecovery({
        repository: repo("dynamic-workspace"),
        codec: codec(),
      });
      const saved = await restored.restore();
      assert.equal(saved.documents.size, 5, "arbitrary document slots survive a reload");
      assert.deepEqual(
        saved.layout.slotIds,
        slots.map((s) => s.id),
      );
      assert.equal(saved.documents.get("dynamic-4").document.width, 5);
      restored.updateLayout({
        activeId: "",
        slotIds: [],
        views: [].map((id) => ({ id, documentId: id })),
      });
      await restored.flush();
      restored.dispose();
      const empty = newRecovery({
        repository: repo("dynamic-workspace"),
        codec: codec(),
      });
      assert.deepEqual(
        (await empty.restore()).layout,
        { activeId: "", slotIds: [], views: [].map((id) => ({ id, documentId: id })) },
        "Close All stays closed after reload",
      );
      empty.dispose();
    }
    {
      let now = 1_000_000;
      const repository = repo("archive-settings");
      const memory = new Map();
      const settingsStore = {
        load: () =>
          JSON.parse(
            memory.get("settings") ?? '{"enabled":true,"intervalMinutes":2,"retentionDays":7}',
          ),
        save: (value) => memory.set("settings", JSON.stringify(value)),
      };
      const recovery = newRecovery({
        repository,
        codec: codec(),
        now: () => now,
        settingsStore,
      });
      await recovery.restore();
      const editor = new RasterEditor(blank());
      recovery.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        0,
        "clean initial workspace is not an edited archive",
      );
      stroke(editor);
      await recovery.flush();
      let entries = await recovery.listRecoveryEntries();
      assert.equal(entries.length, 1, "first committed edit creates a recovery entry");
      assert.equal(entries[0].width, 4);
      assert.deepEqual(
        pixel(await recovery.loadRecoveryEntry(entries[0].id), 1, 1),
        [255, 7, 11, 255],
      );
      const workingId = (await readManifest(repository)).entries[0].projectId;
      now += 60_000;
      stroke(editor, 2);
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        1,
        "interval limits archive frequency",
      );
      assert.deepEqual(
        pixel(await readProject(repository, workingId), 2, 1),
        [255, 7, 11, 255],
        "fast workspace resume does not wait for archive interval",
      );
      now += 60_000;
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        2,
        "pending committed snapshot archives when interval elapses",
      );
      await recovery.setRecoverySettings({ enabled: false });
      now += 120_000;
      editor.timeline.renameLayer("Disabled archive");
      await recovery.flush();
      assert.equal((await recovery.listRecoveryEntries()).length, 2);
      assert.equal(
        (await readProject(repository, workingId)).document.layer.name,
        "Disabled archive",
      );
      assert.equal(JSON.parse(memory.get("settings")).enabled, false);
      await recovery.setRecoverySettings({ enabled: true, retentionDays: 0 });
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        1,
        "zero-day setting retains only newest active recovery",
      );
      recovery.updateLayout({
        activeId: "",
        slotIds: [],
        views: [].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        0,
        "zero-day setting removes closed recovery archives",
      );
      assert.ok(
        await repository.load(workingId),
        "archive expiry never deletes working project heads",
      );
      await recovery.setRecoverySettings({ retentionDays: 1 });
      recovery.updateLayout({
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      now += 120_000;
      editor.timeline.renameLayer("Retained archive");
      await recovery.flush();
      entries = await recovery.listRecoveryEntries();
      assert.equal(entries.length, 1);
      now += 86_400_001;
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        0,
        "retention removes expired immutable archives",
      );
      assert.ok(await repository.load(workingId));
      recovery.dispose();
    }
    {
      let now = 1_000_000;
      const repository = repo("archive-clean-pending");
      const recovery = newRecovery({ repository, codec: codec(), now: () => now });
      await recovery.restore();
      const editor = new RasterEditor(blank());
      recovery.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await recovery.flush();
      now += 60_000;
      stroke(editor, 2);
      await recovery.flush();
      editor.history.markSaved();
      await recovery.flush();
      now += 120_000;
      await recovery.flush();
      assert.equal(
        (await recovery.listRecoveryEntries()).length,
        1,
        "clean external save cancels the pending dirty archive",
      );
      recovery.dispose();
    }
    {
      let now = 1_000_000;
      const first = newRecovery({
        repository: repo("archive-restored-cadence"),
        codec: codec(),
        now: () => now,
      });
      await first.restore();
      const editor = new RasterEditor(blank());
      first.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await first.flush();
      first.dispose();
      now += 60_000;
      const restored = newRecovery({
        repository: repo("archive-restored-cadence"),
        codec: codec(),
        now: () => now,
      });
      const loaded = await restored.restore();
      const next = new RasterEditor();
      next.restorePersistenceSnapshot(loaded.documents.get("one"));
      restored.start([{ id: "one", core: next }], loaded.layout);
      next.timeline.renameLayer("After restart");
      await restored.flush();
      assert.equal(
        (await restored.listRecoveryEntries()).length,
        1,
        "archive cadence survives a browser restart",
      );
      now += 60_000;
      await restored.flush();
      assert.equal((await restored.listRecoveryEntries()).length, 2);
      restored.dispose();
    }
    {
      const repository = repo("archive-disable-race");
      let release,
        entered,
        writes = 0;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        remove: (...args) => repository.remove(...args),
        close: () => repository.close(),
        save: async (input) => {
          if (input.metadata.kind === "recovery-checkpoint") {
            writes++;
            if (writes === 1) {
              entered();
              await gate;
            }
          }
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      const one = new RasterEditor(blank()),
        two = new RasterEditor(blank());
      stroke(one);
      stroke(two);
      recovery.start(
        [
          { id: "one", core: one },
          { id: "two", core: two },
        ],
        layout,
      );
      const flushing = recovery.flush();
      await started;
      const disabling = recovery.setRecoverySettings({ enabled: false });
      release();
      await Promise.all([disabling, flushing]);
      assert.equal(
        writes,
        1,
        "disable prevents additional archives after an already-started write",
      );
      assert.equal(
        recovery.archivePending.size,
        0,
        "disabled backups do not retain detached payloads",
      );
      one.timeline.renameLayer("While disabled");
      await recovery.flush();
      assert.equal(
        recovery.archivePending.size,
        0,
        "disabled edits do not accumulate pending bytes",
      );
      await recovery.setRecoverySettings({ enabled: true });
      await recovery.flush();
      assert.ok((await recovery.listRecoveryEntries()).length >= 1);
      recovery.dispose();
    }
    {
      const repository = repo("archive-retention-race");
      await repository.save({
        projectId: "old-archive",
        expectedHead: null,
        bytes: new Uint8Array([1]),
        metadata: {
          kind: "recovery-checkpoint",
          name: "Retain",
          sourceProjectId: "closed",
          checkpointAt: 1_000_000,
        },
      });
      let blockList = false,
        release,
        entered;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const wrapped = {
        load: (id) => repository.load(id),
        save: (input) => repository.save(input),
        remove: (...args) => repository.remove(...args),
        close: () => repository.close(),
        list: async () => {
          if (blockList) {
            blockList = false;
            entered();
            await gate;
          }
          return repository.list();
        },
      };
      const recovery = newRecovery({
        repository: wrapped,
        codec: codec(),
        now: () => 1_001_000,
      });
      await recovery.restore();
      blockList = true;
      const clearing = recovery.setRecoverySettings({ retentionDays: 0 });
      await started;
      const retaining = recovery.setRecoverySettings({ retentionDays: 7 });
      release();
      await Promise.all([clearing, retaining]);
      assert.ok(
        await repository.load("old-archive"),
        "retention policy is refreshed after async list before deleting",
      );
      recovery.dispose();
    }
    {
      const repository = repo("remove-cas");
      const input = {
        projectId: "cas-remove",
        bytes: new Uint8Array([1]),
        metadata: { name: "CAS" },
        expectedHead: null,
      };
      const first = await repository.save(input);
      const second = await repository.save({
        ...input,
        bytes: new Uint8Array([2]),
        expectedHead: first.head.id,
      });
      await assert.rejects(
        repository.remove(input.projectId, first.head.id),
        (error) => error.code === "conflict",
      );
      assert.deepEqual(
        [...(await repository.load(input.projectId)).bytes],
        [2],
        "stale delete preserves concurrent head",
      );
      await repository.remove(input.projectId, second.head.id);
      assert.equal(await repository.load(input.projectId), null);
      repository.close();
    }
    console.log(
      "Workspace recovery verified: durable identity, hydration, committed strokes and metadata, replacement retention, layout, external dirty state, read failure and concurrent-tab CAS.",
    );
    {
      const repository = repo("manual-archive-delete");
      const recovery = newRecovery({ repository, codec: codec() });
      await recovery.restore();
      const editor = new RasterEditor(blank());
      recovery.start([{ id: "one", core: editor }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      stroke(editor);
      await recovery.flush();
      const workingId = (await readManifest(repository)).entries[0].projectId;
      const [entry] = await recovery.listRecoveryEntries();
      await assert.rejects(recovery.deleteRecoveryEntry(workingId), /cannot be deleted/);
      await recovery.deleteRecoveryEntry(entry.id);
      assert.equal((await recovery.listRecoveryEntries()).length, 0);
      assert.ok(
        await repository.load(workingId),
        "manual archive deletion preserves live workspace payload",
      );
      recovery.dispose();
    }

    // Deterministic reproduction of Open/replacement racing an earlier initial
    // checkpoint. Save gates force both await boundaries without timing sleeps.
    const deferredCheckpoint = () => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    for (const operation of ["open", "replace"]) {
      const repository = repo(`first-checkpoint-race-${operation}`);
      const firstEntered = deferredCheckpoint(),
        firstRelease = deferredCheckpoint(),
        secondEntered = deferredCheckpoint(),
        secondRelease = deferredCheckpoint();
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: async (input) => {
          if (input.metadata.kind === "editor-project" && input.metadata.name === "first.png") {
            firstEntered.resolve();
            await firstRelease.promise;
          }
          if (input.metadata.kind === "editor-project" && input.metadata.name === "second.png") {
            secondEntered.resolve();
            await secondRelease.promise;
          }
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      const first = new RasterEditor(blank(), "first.png");
      stroke(first);
      recovery.start([{ id: "one", core: first }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      let settled = false;
      const flushing = recovery.flush().then(
        () => {
          settled = true;
        },
        (error) => {
          settled = true;
          throw error;
        },
      );
      await firstEntered.promise;
      if (operation === "open") {
        const second = new RasterEditor(blank(6), "second.png");
        stroke(second);
        recovery.start([{ id: "two", core: second }], {
          activeId: "two",
          slotIds: ["one", "two"],
          views: ["one", "two"].map((id) => ({ id, documentId: id })),
        });
      } else {
        first.document.loadImage(blank(6), "second.png");
        stroke(first);
      }
      firstRelease.resolve();
      await secondEntered.promise;
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(
        settled,
        false,
        `${operation}: explicit flush waits for the newly encountered first checkpoint`,
      );
      assert.equal(
        recovery.getSnapshot().error,
        null,
        `${operation}: a pending new checkpoint is not a storage error`,
      );
      secondRelease.resolve();
      await flushing;
      await recovery.flush();
      const manifest = await readManifest(repository);
      assert.deepEqual(
        manifest.entries.map((e) => e.slotId),
        operation === "open" ? ["one", "two"] : ["one"],
      );
      assert.ok(
        manifest.entries.every((e) => e.projectId),
        "no new document is silently replaced with a null manifest entry",
      );
      for (const entry of manifest.entries)
        assert.ok(
          await repository.load(entry.projectId),
          "manifest references an existing first checkpoint",
        );
      const second = await readProject(repository, manifest.entries.at(-1).projectId);
      assert.equal(second.document.name, "second.png");
      assert.equal(second.document.width, 6);
      assert.equal(second.dirty, true);
      recovery.dispose();
    }
    {
      const repository = repo("manifest-layout-write-race"),
        manifestEntered = deferredCheckpoint(),
        manifestRelease = deferredCheckpoint(),
        projectEntered = deferredCheckpoint(),
        projectRelease = deferredCheckpoint();
      let blockManifest = true;
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: async (input) => {
          if (input.projectId === "xse.workspace.manifest.v2" && blockManifest) {
            blockManifest = false;
            manifestEntered.resolve();
            await manifestRelease.promise;
          }
          if (input.metadata.kind === "editor-project" && input.metadata.name === "second.png") {
            projectEntered.resolve();
            await projectRelease.promise;
          }
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      recovery.start([{ id: "one", core: new RasterEditor(blank(), "first.png") }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      let settled = false;
      const flushing = recovery.flush().then(() => {
        settled = true;
      });
      await manifestEntered.promise;
      const second = new RasterEditor(blank(7), "second.png");
      stroke(second);
      recovery.start([{ id: "two", core: second }], {
        activeId: "two",
        slotIds: ["two", "one"],
        views: ["two", "one"].map((id) => ({ id, documentId: id })),
      });
      manifestRelease.resolve();
      await projectEntered.promise;
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(
        settled,
        false,
        "layout changes during manifest save are drained before flush resolves",
      );
      projectRelease.resolve();
      await flushing;
      const manifest = await readManifest(repository);
      assert.equal(manifest.activeId, "two");
      assert.deepEqual(
        manifest.entries.map((e) => e.slotId),
        ["two", "one"],
      );
      assert.equal(
        (await readProject(repository, manifest.entries[0].projectId)).document.width,
        7,
      );
      recovery.dispose();
    }
    {
      const repository = repo("new-checkpoint-real-storage-error"),
        failure = new Error("disk quota checkpoint failure");
      let rejectSecond = true;
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: (input) => {
          if (
            rejectSecond &&
            input.metadata.kind === "editor-project" &&
            input.metadata.name === "second.png"
          )
            return Promise.reject(failure);
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      recovery.start([{ id: "one", core: new RasterEditor(blank(), "first.png") }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      await recovery.flush();
      const before = await readManifest(repository),
        second = new RasterEditor(blank(8), "second.png");
      stroke(second);
      recovery.start([{ id: "two", core: second }], {
        activeId: "two",
        slotIds: ["one", "two"],
        views: ["one", "two"].map((id) => ({ id, documentId: id })),
      });
      await assert.rejects(recovery.flush(), (error) => error === failure);
      assert.equal(
        recovery.hasUnpersistedWorkspaceChanges(),
        true,
        "failed local checkpoint keeps the browser close warning",
      );
      assert.equal(
        recovery.isSlotUnpersisted("two"),
        true,
        "failed document checkpoint keeps its tab dot",
      );
      assert.deepEqual(
        await readManifest(repository),
        before,
        "failed first checkpoint never corrupts the last valid manifest",
      );
      assert.equal(
        recovery.getSnapshot().error,
        failure,
        "real repository failures remain observable",
      );
      assert.equal(second.getSnapshot().dirty, true, "unsaved live document remains intact");
      rejectSecond = false;
      await recovery.retry();
      const after = await readManifest(repository);
      assert.equal(after.entries.length, 2);
      assert.equal((await readProject(repository, after.entries[1].projectId)).document.width, 8);
      assert.equal(recovery.getSnapshot().error, null);
      recovery.dispose();
    }
    console.log(
      "Workspace first-checkpoint races verified: Open, same-slot replacement, layout changes during manifest writes, exact restored dirty data, real storage failures and explicit retry.",
    );
    {
      const repository = repo("manifest-same-document-edit-race"),
        manifestEntered = deferredCheckpoint(),
        manifestRelease = deferredCheckpoint(),
        editEntered = deferredCheckpoint(),
        editRelease = deferredCheckpoint();
      let blockManifest = true,
        projectWrites = 0;
      const wrapped = {
        load: (id) => repository.load(id),
        list: () => repository.list(),
        close: () => repository.close(),
        save: async (input) => {
          if (input.projectId === "xse.workspace.manifest.v2" && blockManifest) {
            blockManifest = false;
            manifestEntered.resolve();
            await manifestRelease.promise;
          }
          if (input.metadata.kind === "editor-project" && ++projectWrites === 2) {
            editEntered.resolve();
            await editRelease.promise;
          }
          return repository.save(input);
        },
      };
      const recovery = newRecovery({ repository: wrapped, codec: codec() });
      await recovery.restore();
      const core = new RasterEditor(blank(), "same.png");
      recovery.start([{ id: "one", core }], {
        activeId: "one",
        slotIds: ["one"],
        views: ["one"].map((id) => ({ id, documentId: id })),
      });
      let settled = false;
      const flushing = recovery.flush().then(() => {
        settled = true;
      });
      await manifestEntered.promise;
      stroke(core);
      manifestRelease.resolve();
      await editEntered.promise;
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(
        settled,
        false,
        "same-binding committed revision during manifest write also participates in the barrier",
      );
      editRelease.resolve();
      await flushing;
      const manifest = await readManifest(repository),
        saved = await readProject(repository, manifest.entries[0].projectId);
      assert.deepEqual(pixel(saved, 1, 1), [255, 7, 11, 255]);
      assert.equal(saved.dirty, true);
      recovery.dispose();
    }
  }, 60_000);
});
