import { describe, expect, it, vi } from "vitest";

import { createEditorUiStore } from "$/managers/editor/editor-ui-store";
import type { ReplayPort } from "$/managers/ports/replay";
import type { ReplayStoragePort, StoredReplay } from "$/managers/ports/replay-storage";
import { ReplayManager } from "$/managers/replay/replay-manager";
import { decodeReplayRecording } from "$/managers/replay/replay-recording";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { RasterEditor, ReplayStreamReader } from "@xprite/editor-core";

function memoryStorage(): ReplayStoragePort {
  const projects = new Map<string, StoredReplay>();
  return {
    load: async (id) => projects.get(id) ?? null,
    append: async (id, expected, segment, enabled) => {
      const previous = projects.get(id) ?? { head: 0, enabled: false, segments: [] };
      if (previous.head !== expected) throw new Error("Replay conflict");
      const head = previous.head + 1;
      projects.set(id, {
        head,
        enabled,
        segments: segment ? [...previous.segments, segment.slice()] : previous.segments,
      });
      return head;
    },
    fork: async (source, id) => {
      const record = projects.get(source);
      if (record) projects.set(id, { ...record, segments: [...record.segments] });
    },
    remove: async (ids) => {
      for (const id of ids) projects.delete(id);
    },
  };
}
async function fixture(storage = memoryStorage(), initialTime = 0, startRecording = true) {
  let now = initialTime;
  let requestId = 0;
  let key: ((keys: string) => void) | null = null;
  let downloaded: Uint8Array | null = null;
  const callbacks = new Map<number, () => void>();
  const listeners = new Set<() => void>();
  let attachment: Parameters<DocumentWorkspace["registerProjectAttachment"]>[0] | null = null;
  const core = new RasterEditor({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) });
  const workspace = {
    active: { core, documentId: "first" },
    getProjectId: (): string => workspace.active.documentId,
    registerProjectAttachment: (value: NonNullable<typeof attachment>) => {
      attachment = value;
      return () => {};
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const port: ReplayPort = {
    now: () => now,
    requestFrame: (callback) => {
      const id = ++requestId;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      callbacks.delete(id);
    },
    observeInput: (listener) => {
      key = listener;
      return () => {
        key = null;
      };
    },
    cursor: () => ({
      source: "data:image/svg+xml,%3Csvg%20width%3D%2216%22%20height%3D%2216%22%2F%3E",
      width: 16,
      height: 16,
      hotspot: { x: 0, y: 0 },
    }),
    modifiers: () => null,
    pointerPlacement: (_canvas, _pixels, pointer) => ({ ...pointer.cursor, point: pointer.point }),
    yieldTask: async () => {},
    setTimer: () => ++requestId,
    clearTimer: () => {},
    onSuspend: () => () => {},
    onResume: () => () => {},
    pick: async () => null,
    download: (bytes) => {
      downloaded = bytes;
    },
    paint: () => {},
  };
  const manager = new ReplayManager(
    workspace as unknown as DocumentWorkspace,
    createEditorUiStore(),
    port,
    storage,
  );
  const disconnect = manager.connect();
  await vi.waitFor(() =>
    expect(manager.getSnapshot()).toMatchObject({ busy: false, canRecord: true }),
  );
  if (startRecording && !manager.getSnapshot().recording) manager.start();
  const advance = (milliseconds: number) => {
    now += milliseconds;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback();
  };
  return {
    manager,
    attachment: () => attachment!,
    core,
    workspace,
    storage,
    disconnect,
    advance,
    notify: () => {
      for (const listener of listeners) listener();
    },
    shortcut: (keys = "Ctrl+Z") => key?.(keys),
    tape: () => {
      manager.export();
      return decodeReplayRecording(downloaded!);
    },
  };
}

describe("drawing replay lifecycle", () => {
  it("starts only on request, hides controls without stopping, and keeps a stopped project stopped after reopening", async () => {
    const storage = memoryStorage();
    const first = await fixture(storage, 0, false);
    expect(first.manager.getSnapshot()).toMatchObject({
      recording: false,
      barOpen: false,
      frameCount: 0,
    });
    first.manager.openRecording();
    expect(first.manager.getSnapshot()).toMatchObject({ recording: true, barOpen: true });
    first.manager.setBarOpen(false);
    expect(first.manager.getSnapshot()).toMatchObject({ recording: true, barOpen: false });
    first.manager.openRecording();
    expect(first.manager.getSnapshot()).toMatchObject({ recording: true, barOpen: true });
    first.manager.stop();
    expect(first.manager.getSnapshot()).toMatchObject({
      recording: false,
      barOpen: false,
      open: true,
    });
    first.manager.setOpen(false);
    expect(first.manager.getSnapshot().recording).toBe(false);
    await first.manager.flush();
    expect((await storage.load("first"))?.enabled).toBe(false);
    first.disconnect();
    await first.manager.flush();
    const second = await fixture(storage, 60_000, false);
    expect(second.manager.getSnapshot()).toMatchObject({ recording: false, barOpen: false });
    second.disconnect();
  });
  it("captures in-progress pixels and the trailing stroke without changing undo history during playback", async () => {
    const { core, manager, advance, tape, disconnect } = await fixture();
    core.pointerDown({ x: 1, y: 1 });
    core.pointerMove({ x: 3, y: 1 });
    advance(60);
    core.pointerMove({ x: 6, y: 1 });
    core.pointerUp();
    manager.stop();
    const recording = tape();
    const reader = new ReplayStreamReader(recording.frames);
    const during = structuredClone(reader.read(1));
    const final = reader.read(recording.frames.length - 1);
    expect(during.pixels.data[(1 * 8 + 3) * 4 + 3]).toBe(255);
    expect(during.pixels.data[(1 * 8 + 6) * 4 + 3]).toBe(0);
    expect(final.pixels.data[(1 * 8 + 6) * 4 + 3]).toBe(255);
    const revision = core.getSnapshot().revision;
    manager.seek(recording.duration);
    manager.seek(0);
    expect(core.getSnapshot().revision).toBe(revision);
    expect(core.getSnapshot().canUndo).toBe(true);
    disconnect();
  });
  it("reports replay storage errors without rejecting the artwork attachment flush", async () => {
    const storage = memoryStorage();
    storage.append = async () => {
      throw new Error("Replay storage unavailable");
    };
    const { manager, core, attachment, tape, disconnect } = await fixture(storage);
    core.pointerDown({ x: 1, y: 1 });
    core.pointerUp();
    await expect(manager.flush()).rejects.toThrow("Replay storage unavailable");
    expect(manager.getSnapshot()).toMatchObject({ unsaved: true });
    await expect(attachment().flush()).resolves.toBeUndefined();
    expect(attachment().hasPendingChanges()).toBe(true);
    expect(tape().frames.length).toBeGreaterThan(0);
    disconnect();
  });
  it("saves the source recording on switching and loads each project's own replay", async () => {
    const { manager, workspace, storage, notify, disconnect } = await fixture();
    workspace.active = {
      core: new RasterEditor({ width: 2, height: 2, data: new Uint8ClampedArray(16) }),
      documentId: "second",
    };
    notify();
    await vi.waitFor(() => expect(manager.getSnapshot().busy).toBe(false));
    expect(manager.getSnapshot().frameCount).toBe(0);
    const saved = await storage.load("first");
    expect(saved?.segments.length).toBeGreaterThan(0);
    const segment = decodeReplayRecording(saved!.segments[0], true);
    expect(new ReplayStreamReader(segment.frames).read(0).pixels.width).toBe(8);
    disconnect();
  });
  it("keeps semantic shortcuts on the recording clock and stops playback at the end", async () => {
    const { manager, core, advance, shortcut, tape, disconnect } = await fixture();
    advance(100);
    shortcut();
    core.drawing.settings.setSettings({ tool: "eraser" });
    advance(100);
    manager.stop();
    expect(tape().interactions[0]).toMatchObject({ at: 100, keys: "Ctrl+Z" });
    manager.play();
    advance(500);
    expect(manager.getSnapshot().playing).toBe(false);
    expect(manager.getSnapshot().position).toBe(manager.getSnapshot().duration);
    disconnect();
  });
  it("does not record save commands or append frames for the playback controls", async () => {
    const { manager, core, shortcut, advance, tape, disconnect } = await fixture();
    const frames = manager.getSnapshot().frameCount;
    advance(100);
    shortcut("Ctrl+S");
    core.history.markSaved("saved.aseprite", "aseprite");
    advance(100);
    expect(manager.getSnapshot().frameCount).toBe(frames);
    manager.stop();
    manager.setShowMouse(true);
    manager.setShowKeys(true);
    manager.seek(0);
    expect(tape().interactions).toEqual([]);
    expect(tape().frames.length).toBe(frames);
    disconnect();
  });
  it("keeps input overlays optional and restores the captured cursor rather than current settings", async () => {
    const { manager, core, advance, tape, disconnect } = await fixture();
    advance(100);
    core.pointerDown({ x: 2, y: 2 });
    core.pointerUp();
    manager.stop();
    const recording = tape();
    const point = recording.pointers.find((sample) => sample.point && sample.cursor)!;
    expect(manager.getSnapshot()).toMatchObject({
      showMouse: false,
      showKeys: false,
      hasMouse: true,
    });
    manager.seek(point.at);
    expect(manager.getMotionSnapshot().pointer).toBeNull();
    manager.setShowMouse(true);
    expect(manager.getMotionSnapshot().pointer?.cursor).toEqual(point.cursor);
    manager.setShowMouse(false);
    expect(manager.getMotionSnapshot().pointer).toBeNull();
    disconnect();
  });
  it("appends across a reload without including time away or replacing earlier frames", async () => {
    const storage = memoryStorage();
    const first = await fixture(storage);
    first.advance(100);
    first.core.pointerDown({ x: 1, y: 1 });
    first.core.pointerUp();
    first.manager.setOpen(true);
    await first.manager.flush();
    const before = first.tape();
    first.disconnect();
    await first.manager.flush();
    const second = await fixture(storage, 60_000, false);
    expect(second.manager.getSnapshot()).toMatchObject({ recording: true, barOpen: true });
    expect(second.manager.getSnapshot().frameCount).toBeGreaterThan(before.frames.length);
    second.advance(100);
    second.core.pointerDown({ x: 5, y: 5 });
    second.core.pointerUp();
    second.manager.stop();
    await second.manager.flush();
    const after = second.tape();
    expect(after.frames.slice(0, before.frames.length)).toEqual(before.frames);
    expect(after.duration).toBe(before.duration + 101);
    expect(new ReplayStreamReader(after.frames).read(0).pixels.data).toEqual(
      new ReplayStreamReader(before.frames).read(0).pixels.data,
    );
    second.disconnect();
  });
});
