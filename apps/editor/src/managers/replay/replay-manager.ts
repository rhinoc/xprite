import type { StoreApi } from "zustand/vanilla";

import type { EditorUiState } from "$/managers/editor/editor-ui-store";
import type { ReplayPort, ReplayPointerOverlay } from "$/managers/ports/replay";
import type { ReplayStoragePort } from "$/managers/ports/replay-storage";
import { recordedKeysAt, recordedPointerAt } from "$/managers/replay/replay-input";
import {
  decodeReplayRecording,
  encodeReplayRecording,
  replayFrameAt,
  type ReplayRecording,
  type RecordedReplayPointer,
  type ReplayInteraction,
  ReplayInteractionKind,
} from "$/managers/replay/replay-recording";
import { ReplayTiming } from "$/managers/replay/replay-timing";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import {
  RasterEditor,
  EditorReplayRecorder,
  ReplayStreamReader,
  REPLAY_MAX_BYTES,
  EditorPointerPhase,
  type EditorPointerSample,
  compositeTransparencyPreview,
  type ReplayFrameState,
  type PixelBuffer,
} from "@xprite/editor-core";
import { convertPixelsToSrgb, workingColorProfile } from "@xprite/editor-core/color";
import { encodeGif, type ExportAnimationFrame } from "@xprite/editor-core/import-export";

const CAPTURE_INTERVAL_MS = 1000 / 60;
const MIN_GIF_FRAME_MS = 20;
const GIF_FRAME_INTERVAL_MS = 1000 / 30;
const MAX_GIF_PIXEL_BYTES = 128 * 1024 * 1024;
const MAX_INTERACTIONS = 500_000;
const KEY_PUBLICATION_TIMEOUT_MS = 0;
const MAX_FRAMES = 1_000_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const METADATA_RESERVE_BYTES = 16 * 1024 * 1024;
const MAX_CAPTURE_BYTES = REPLAY_MAX_BYTES - METADATA_RESERVE_BYTES;
const MAX_METADATA_RAW_BYTES = 128 * 1024 * 1024;
const SAVE_INTERVAL_MS = 1000;
const RECORDING_CLOCK_INTERVAL_MS = 1000;
const SESSION_BOUNDARY_MS = 1;
const MAX_FILENAME_CONTROL_CODE = 0x1f;
export interface ReplayMotionSnapshot {
  frameRevision: number;
  pointer: ReplayPointerOverlay | null;
  keys: string | null;
}

export interface ReplaySnapshot {
  open: boolean;
  recording: boolean;
  recordingElapsed: number;
  barOpen: boolean;
  canRecord: boolean;
  playing: boolean;
  busy: boolean;
  speed: number;
  skipIdle: boolean;
  showMouse: boolean;
  showKeys: boolean;
  hasMouse: boolean;
  hasKeys: boolean;
  position: number;
  duration: number;
  frameCount: number;
  frameIndex: number;
  frameRevision: number;
  bytes: number;
  name: string;
  error: string | null;
  saving: boolean;
  unsaved: boolean;
  imported: boolean;
}

/** Project-associated drawing recordings. Only core edits append frames;
 * browser menus and recording controls never become recorded content. */
export class ReplayManager {
  private listeners = new Set<() => void>();
  private tape: ReplayRecording | null = null;
  private projectTape: ReplayRecording | null = null;
  private projectId: string | null = null;
  private targetProjectId: string | null | undefined;
  private attachedDocumentId: string | null = null;
  private attachmentGeneration = 0;
  private storageHead = 0;
  private storedBytes = 0;
  private frameBytes = 0;
  private savedFrames = 0;
  private savedInteractions = 0;
  private savedPointers = 0;
  private savedDuration = 0;
  private enabled = false;
  private savedEnabled = false;
  private saveTimer: number | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private recorder: EditorReplayRecorder | null = null;
  private reader: ReplayStreamReader | null = null;
  private timingCache: {
    tape: ReplayRecording;
    frames: number;
    duration: number;
    skipIdle: boolean;
    timing: ReplayTiming;
  } | null = null;
  private sessionOffset = 0;
  private capturing = false;
  private source: RasterEditor | null = null;
  private persistenceBlocked = false;
  private capturePaused = false;
  private sourceStop: (() => void) | null = null;
  private pointerStop: (() => void) | null = null;
  private inputStop: (() => void) | null = null;
  private pendingInteractions: ReplayInteraction[] = [];
  private pendingKey: ReplayInteraction | null = null;
  private keyTimer: number | null = null;
  private lastPointer: EditorPointerSample | null = null;
  private stroke = 0;
  private motionListeners = new Set<() => void>();
  private motion: ReplayMotionSnapshot = { frameRevision: 0, pointer: null, keys: null };
  private canvasPixels: PixelBuffer | null = null;
  private captureRequest: number | null = null;
  private recordingClock: number | null = null;
  private playbackRequest: number | null = null;
  private lastCapture = 0;
  private startedAt = 0;
  private playbackAt = 0;
  private lastFrame = -1;
  private decoded: ReplayFrameState | null = null;
  private metadataBytes = 0;
  private snapshot: ReplaySnapshot = {
    open: false,
    recording: false,
    recordingElapsed: 0,
    barOpen: false,
    canRecord: false,
    playing: false,
    busy: false,
    speed: 1,
    skipIdle: false,
    showMouse: false,
    showKeys: false,
    hasMouse: false,
    hasKeys: false,
    position: 0,
    duration: 0,
    frameCount: 0,
    frameIndex: -1,
    frameRevision: 0,
    bytes: 0,
    name: "",
    error: null,
    saving: false,
    unsaved: false,
    imported: false,
  };

  constructor(
    private readonly workspace: DocumentWorkspace,
    private readonly uiStore: StoreApi<EditorUiState>,
    private readonly port: ReplayPort,
    private readonly storage: ReplayStoragePort,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private commandSnapshot = { recording: false, canRecord: false, canContinue: false, busy: false };
  getCommandSnapshot = () => {
    const next = {
      recording: this.snapshot.recording,
      canRecord: this.snapshot.canRecord,
      canContinue: !!this.projectTape?.frames.length,
      busy: this.snapshot.busy,
    };
    if (
      Object.entries(next).some(
        ([key, value]) => this.commandSnapshot[key as keyof typeof next] !== value,
      )
    )
      this.commandSnapshot = next;
    return this.commandSnapshot;
  };
  getPreviewAspectRatio = () =>
    this.decoded ? this.decoded.pixels.width / this.decoded.pixels.height : 1;
  getMotionSnapshot = () => this.motion;
  subscribeMotion = (listener: () => void) => {
    this.motionListeners.add(listener);
    return () => {
      this.motionListeners.delete(listener);
    };
  };
  private update(patch: Partial<ReplaySnapshot>) {
    if (
      Object.entries(patch).every(
        ([key, value]) => this.snapshot[key as keyof ReplaySnapshot] === value,
      )
    )
      return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private canRecord() {
    return (
      !!this.projectId &&
      !!this.workspace.active.core.getSnapshot().document &&
      this.uiStore.getState().tab === "document"
    );
  }
  private refresh = () => {
    const projectId = this.workspace.getProjectId();
    if (projectId !== this.targetProjectId) {
      this.targetProjectId = projectId;
      void this.attachProject(projectId);
      return;
    }
    this.update({ canRecord: projectId === this.projectId && this.canRecord() });
    if (this.snapshot.busy || projectId !== this.projectId) return;
    if (this.capturing && this.source !== this.workspace.active.core) {
      this.capture();
      if (!this.capturing) return;
      this.sourceStop?.();
      this.pointerStop?.();
      this.clearInput();
      this.source = this.workspace.active.core;
      this.recorder?.setSource(this.source);
      this.sourceStop = this.source.subscribe(this.sourceChanged);
      this.pointerStop = this.source.subscribePointer(this.recordPointer);
    }
    const canRecord = this.canRecord();
    if (this.capturing && !canRecord) {
      this.capture();
      this.finishCapture();
      this.saveSoon(true);
    }
    if (this.enabled && canRecord && !this.capturing && !this.snapshot.open && !this.capturePaused)
      this.beginCapture();
    if (this.capturing) this.scheduleCapture();
  };
  connect = () => {
    const stopWorkspace = this.workspace.subscribe(this.refresh);
    const stopUi = this.uiStore.subscribe(this.refresh);
    const stopAttachment = this.workspace.registerProjectAttachment({
      // Replay errors are reported by this manager; artwork saves remain independent.
      flush: () => this.flush().catch(() => {}),
      hasPendingChanges: () => this.snapshot.unsaved || this.snapshot.saving,
      remove: async (ids) => {
        await this.flush();
        await this.storage.remove(ids);
      },
    });
    const stopSuspend = this.port.onSuspend(() => {
      this.capture();
      this.finishCapture();
      void this.flush().catch(() => {});
    });
    const stopResume = this.port.onResume(this.refresh);
    this.refresh();
    return () => {
      this.attachmentGeneration++;
      this.targetProjectId = undefined;
      this.capture();
      this.finishCapture();
      this.pause();
      if (this.saveTimer !== null) this.port.clearTimer(this.saveTimer);
      this.saveTimer = null;
      void this.flush()
        .catch(() => {})
        .finally(stopAttachment);
      stopWorkspace();
      stopUi();
      stopSuspend();
      stopResume();
    };
  };
  private async attachProject(projectId: string | null) {
    const generation = ++this.attachmentGeneration;
    const oldProjectId = this.projectId;
    const fork =
      !!oldProjectId && !!projectId && this.attachedDocumentId === this.workspace.active.documentId;
    this.capture();
    this.finishCapture();
    this.pause();
    this.update({ busy: true });
    try {
      await this.flush();
      if (generation !== this.attachmentGeneration) return;
      if (fork) await this.storage.fork(oldProjectId!, projectId!);
      const stored = projectId ? await this.storage.load(projectId) : null;
      if (generation !== this.attachmentGeneration) return;
      const tape: ReplayRecording = {
        name: "",
        duration: 0,
        frames: [],
        interactions: [],
        pointers: [],
      };
      for (const bytes of stored?.segments ?? []) {
        const segment = decodeReplayRecording(bytes, true);
        if (segment.duration < tape.duration)
          throw new TypeError("Invalid replay segment duration.");
        const append = <T extends { at: number }>(target: T[], additions: T[]) => {
          if (additions.length && target.length && additions[0].at < target[target.length - 1].at)
            throw new TypeError("Invalid replay segment order.");
          for (const value of additions) target.push(value);
        };
        append(tape.frames, segment.frames);
        append(tape.interactions, segment.interactions);
        append(tape.pointers, segment.pointers);
        tape.name = segment.name;
        tape.duration = segment.duration;
      }
      if (tape.frames.length) await this.validate(tape);
      if (generation !== this.attachmentGeneration) return;
      this.capturePaused = false;
      this.projectId = projectId;
      this.attachedDocumentId = this.workspace.active.documentId;
      this.storageHead = stored?.head ?? 0;
      this.storedBytes = stored?.segments.reduce((sum, segment) => sum + segment.length, 0) ?? 0;
      this.projectTape = tape.frames.length ? tape : null;
      this.savedFrames = tape.frames.length;
      this.savedInteractions = tape.interactions.length;
      this.savedPointers = tape.pointers.length;
      this.savedDuration = tape.duration;
      this.enabled = stored?.enabled === true;
      this.savedEnabled = this.enabled;
      this.showProjectReplay();
      this.update({ busy: false, error: null, unsaved: false, canRecord: this.canRecord() });
      if (this.enabled && this.canRecord() && !this.snapshot.open) this.beginCapture();
    } catch (error) {
      if (generation === this.attachmentGeneration)
        this.update({ busy: false, open: true, error: this.errorText(error) });
    }
  }
  showProjectReplay = () => {
    this.pause();
    this.tape = this.projectTape;
    this.timingCache = null;
    this.reader = this.tape ? new ReplayStreamReader(this.tape.frames) : null;
    this.lastFrame = -1;
    this.decoded = null;
    this.canvasPixels = null;
    this.frameBytes = this.tape?.frames.reduce((sum, frame) => sum + frame.data.length, 0) ?? 0;
    this.metadataBytes = this.tape
      ? new TextEncoder().encode(
          JSON.stringify({
            pointers: this.tape.pointers,
            interactions: this.tape.interactions,
            frames: this.tape.frames.map(({ data: _data, ...frame }) => frame),
          }),
        ).length
      : 0;
    this.update({
      imported: false,
      hasMouse: !!this.tape?.pointers.some((sample) => !!sample.cursor),
      hasKeys: !!this.tape?.interactions.some(
        (event) => event.kind === ReplayInteractionKind.Shortcut && event.keys,
      ),
      name: this.tape?.name ?? "",
      position: 0,
      frameCount: this.tape?.frames.length ?? 0,
      duration: this.tape?.duration ?? 0,
      bytes:
        this.storedBytes +
        (this.tape?.frames
          .slice(this.savedFrames)
          .reduce((sum, frame) => sum + frame.data.length, 0) ?? 0),
      frameIndex: -1,
    });
    if (this.tape?.frames.length) {
      this.seek(0);
    }
  };
  private saveSoon(immediate = false) {
    this.update({ unsaved: true });
    if (immediate) {
      if (this.saveTimer !== null) this.port.clearTimer(this.saveTimer);
      this.saveTimer = null;
      void this.flush().catch(() => {});
    } else if (this.saveTimer === null) {
      this.saveTimer = this.port.setTimer(() => {
        this.saveTimer = null;
        void this.flush().catch(() => {});
      }, SAVE_INTERVAL_MS);
    }
  }
  flush = (): Promise<void> => {
    if (this.capturing) this.capture();
    const saving = this.saveQueue
      .catch(() => {})
      .then(async () => {
        const tape = this.projectTape;
        const projectId = this.projectId;
        if (!projectId) return;
        const frames = tape?.frames.length ?? 0;
        const interactions = tape?.interactions.length ?? 0;
        const pointers = tape?.pointers.length ?? 0;
        const duration = tape?.duration ?? 0;
        const enabled = this.enabled;
        if (
          frames === this.savedFrames &&
          interactions === this.savedInteractions &&
          pointers === this.savedPointers &&
          duration === this.savedDuration &&
          enabled === this.savedEnabled
        )
          return;
        this.update({ saving: true });
        const segment =
          tape &&
          (frames !== this.savedFrames ||
            interactions !== this.savedInteractions ||
            pointers !== this.savedPointers ||
            duration !== this.savedDuration)
            ? encodeReplayRecording({
                name: tape.name,
                duration,
                frames: tape.frames.slice(this.savedFrames, frames),
                interactions: tape.interactions.slice(this.savedInteractions, interactions),
                pointers: tape.pointers.slice(this.savedPointers, pointers),
              })
            : null;
        this.storageHead = await this.storage.append(projectId, this.storageHead, segment, enabled);
        this.storedBytes += segment?.length ?? 0;
        this.savedFrames = frames;
        this.savedInteractions = interactions;
        this.savedPointers = pointers;
        this.savedDuration = duration;
        this.savedEnabled = enabled;
        this.update({
          ...(!this.snapshot.imported
            ? {
                bytes:
                  this.storedBytes +
                  (tape?.frames.slice(frames).reduce((sum, frame) => sum + frame.data.length, 0) ??
                    0),
              }
            : {}),
          saving: false,
          unsaved:
            this.enabled !== enabled ||
            (!!tape &&
              (tape.frames.length !== frames ||
                tape.interactions.length !== interactions ||
                tape.pointers.length !== pointers ||
                tape.duration !== duration)),
        });
      })
      .catch((error) => {
        this.persistenceBlocked = true;
        this.finishCapture();
        this.update({ saving: false, unsaved: true, open: true, error: this.errorText(error) });
        throw error;
      });
    this.saveQueue = saving;
    return saving;
  };
  retrySave = async () => {
    try {
      await this.flush();
      this.persistenceBlocked = false;
      this.update({ error: null });
      if (this.targetProjectId !== this.projectId)
        await this.attachProject(this.targetProjectId ?? null);
    } catch {
      /* The pending replay remains available for export and another retry. */
    }
  };
  openRecording = () => {
    if (this.capturing) this.setBarOpen(true);
    else this.start();
  };
  setBarOpen = (barOpen: boolean) => {
    this.update({ barOpen: barOpen && this.capturing });
  };
  start = () => {
    if (this.snapshot.busy || !this.canRecord() || this.persistenceBlocked) return;
    this.enabled = true;
    this.capturePaused = false;
    this.beginCapture();
    this.saveSoon(true);
  };
  stop = () => {
    if (this.snapshot.busy || !this.projectId) return;
    this.enabled = false;
    this.capture();
    this.finishCapture();
    this.pause();
    this.update({ open: true });
    this.seek(0);
    this.saveSoon(true);
  };
  setOpen = (open: boolean) => {
    if (open) {
      this.capture();
      this.finishCapture();
      void this.flush().catch(() => {});
    } else this.pause();
    this.update({ open });
    if (open && !this.decoded) this.seek(0);
    if (!open) this.refresh();
  };
  private playbackTiming() {
    const tape = this.tape!;
    const cache = this.timingCache;
    if (
      cache?.tape === tape &&
      cache.frames === tape.frames.length &&
      cache.duration === tape.duration &&
      cache.skipIdle === this.snapshot.skipIdle
    )
      return cache.timing;
    const timing = new ReplayTiming(tape.frames, tape.duration, this.snapshot.skipIdle);
    this.timingCache = {
      tape,
      frames: tape.frames.length,
      duration: tape.duration,
      skipIdle: this.snapshot.skipIdle,
      timing,
    };
    return timing;
  }
  setSkipIdle = (skipIdle: boolean) => {
    if (this.capturing || this.snapshot.busy || skipIdle === this.snapshot.skipIdle) return;
    this.pause();
    const recorded = this.tape ? this.playbackTiming().recordedAt(this.snapshot.position) : 0;
    this.update({ skipIdle });
    if (this.tape?.frames.length) this.seek(this.playbackTiming().playbackAt(recorded));
  };
  setShowMouse = (showMouse: boolean) => {
    this.update({ showMouse });
    if (this.tape) this.seek(this.snapshot.position);
  };
  setShowKeys = (showKeys: boolean) => {
    this.update({ showKeys });
    if (this.tape) this.seek(this.snapshot.position);
  };
  setSpeed = (speed: number) => {
    if (![0.25, 0.5, 1, 2, 4, 8, 16].includes(speed)) return;
    this.playbackAt = this.port.now();
    this.update({ speed });
  };
  private beginCapture() {
    if (
      this.snapshot.busy ||
      this.capturing ||
      !this.canRecord() ||
      this.persistenceBlocked ||
      this.capturePaused
    )
      return;
    this.pause();
    this.showProjectReplay();
    const source = this.workspace.active.core;
    this.source = source;
    this.startedAt = this.port.now();
    this.sessionOffset = this.tape ? this.tape.duration + SESSION_BOUNDARY_MS : 0;
    this.recorder = new EditorReplayRecorder(source);
    this.clearInput();
    this.stroke = this.tape?.pointers[this.tape.pointers.length - 1]?.stroke ?? 0;
    this.lastCapture = -CAPTURE_INTERVAL_MS;
    this.lastFrame = -1;
    this.decoded = null;
    this.canvasPixels = null;

    this.tape ??= {
      name: source.getSnapshot().document!.name.slice(0, 512),
      duration: 0,
      frames: [],
      interactions: [],
      pointers: [],
    };
    this.tape.name = source.getSnapshot().document!.name.slice(0, 512);
    this.projectTape = this.tape;
    this.reader = new ReplayStreamReader(this.tape.frames);
    this.capturing = true;
    this.update({
      recording: true,
      recordingElapsed: this.sessionOffset,
      barOpen: true,
      open: false,
      position: 0,
      duration: this.tape.duration,
      frameCount: this.tape.frames.length,
      frameIndex: -1,
      name: this.tape.name,
      error: null,
    });
    this.capture();
    if (!this.capturing) return;
    this.sourceStop = source.subscribe(this.sourceChanged);
    this.pointerStop = source.subscribePointer(this.recordPointer);
    this.inputStop = this.port.observeInput(this.recordKeys, this.cursorChanged);
    this.scheduleRecordingClock();
  }
  private scheduleRecordingClock() {
    this.recordingClock = this.port.setTimer(() => {
      this.recordingClock = null;
      if (!this.capturing) return;
      this.update({ recordingElapsed: this.elapsed() });
      this.scheduleRecordingClock();
    }, RECORDING_CLOCK_INTERVAL_MS);
  }
  private elapsed() {
    return Math.min(
      MAX_DURATION_MS,
      this.sessionOffset + Math.max(0, this.port.now() - this.startedAt),
    );
  }
  // An input is attached only when the same publication changed editing state.
  private sourceChanged = () => {
    if (this.recorder?.observeEdit() && this.pendingKey)
      this.pendingInteractions.push(this.pendingKey);
    this.pendingKey = null;
    this.scheduleCapture();
  };
  private recordKeys = (keys: string) => {
    if (!this.capturing) return;
    this.pendingKey = {
      at: this.elapsed(),
      kind: ReplayInteractionKind.Shortcut,
      target: null,
      keys,
    };
    if (this.keyTimer !== null) this.port.clearTimer(this.keyTimer);
    this.keyTimer = this.port.setTimer(() => {
      this.pendingKey = null;
      this.keyTimer = null;
    }, KEY_PUBLICATION_TIMEOUT_MS);
  };
  private recordPointer = (sample: EditorPointerSample) => {
    if (!this.capturing) return;
    this.lastPointer = sample;
    if (sample.phase === EditorPointerPhase.Down) {
      this.stroke++;
      const keys = this.port.modifiers();
      if (keys)
        this.pendingInteractions.push({
          at: this.elapsed(),
          kind: ReplayInteractionKind.Shortcut,
          target: null,
          keys,
        });
    }
    const tape = this.tape!;
    const sampleTime =
      sample.phase === EditorPointerPhase.Leave || sample.phase === EditorPointerPhase.Cancel
        ? tape.duration
        : this.elapsed();
    const appearance = sample.point ? this.port.cursor() : null;
    const pointer: RecordedReplayPointer = {
      ...sample,
      point: sample.point ? { ...sample.point } : null,
      at: sampleTime,
      stroke: this.stroke,
      cursor: appearance ? { ...appearance, hotspot: { ...appearance.hotspot } } : null,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(pointer)).length + 1;
    if (
      tape.pointers.length >= MAX_INTERACTIONS ||
      this.metadataBytes + bytes > MAX_METADATA_RAW_BYTES
    ) {
      this.limitReached();
      return;
    }
    tape.pointers.push(pointer);
    this.metadataBytes += bytes;
    tape.duration = Math.max(tape.duration, sampleTime);
    this.update({ hasMouse: this.snapshot.hasMouse || !!pointer.cursor, duration: tape.duration });
    this.saveSoon();
  };
  private cursorChanged = () => {
    if (this.lastPointer?.point)
      this.recordPointer({ ...this.lastPointer, phase: EditorPointerPhase.Move });
  };
  private clearInput() {
    this.pendingInteractions = [];
    this.pendingKey = null;
    this.lastPointer = null;
    if (this.keyTimer !== null) this.port.clearTimer(this.keyTimer);
    this.keyTimer = null;
  }
  private appendInput(at: number) {
    const tape = this.tape!;
    const interactions = this.pendingInteractions.filter((event) => event.at <= at);
    const bytes = new TextEncoder().encode(JSON.stringify(interactions)).length;
    if (
      tape.interactions.length + interactions.length > MAX_INTERACTIONS ||
      this.metadataBytes + bytes + 128 > MAX_METADATA_RAW_BYTES
    )
      return false;
    tape.interactions.push(...interactions);
    this.metadataBytes += bytes;
    this.pendingInteractions = this.pendingInteractions.filter((event) => event.at > at);
    return true;
  }
  private scheduleCapture() {
    if (this.captureRequest !== null || !this.capturing) return;
    const tick = () => {
      this.captureRequest = null;
      if (!this.capturing) return;
      if (this.elapsed() - this.lastCapture < CAPTURE_INTERVAL_MS) {
        this.captureRequest = this.port.requestFrame(tick);
        return;
      }
      this.capture();
    };
    this.captureRequest = this.port.requestFrame(tick);
  }
  private capture() {
    if (!this.source || !this.tape || !this.capturing) return;
    const sourceTime = this.elapsed();
    try {
      const snapshot = this.source.getSnapshot();
      if (!snapshot.document) {
        this.finishCapture();
        return;
      }
      const packet = this.recorder?.capture();
      if (!packet) return;
      const at = this.tape.frames.length ? sourceTime : 0;
      const data = packet.data;
      if (
        this.frameBytes + data.length > MAX_CAPTURE_BYTES ||
        this.metadataBytes > MAX_METADATA_RAW_BYTES ||
        this.tape.frames.length >= MAX_FRAMES ||
        !this.appendInput(at)
      ) {
        this.limitReached();
        return;
      }
      this.metadataBytes += 128;
      this.tape.frames.push({ at, ...packet, panels: [], timelineVisible: true });
      this.frameBytes += data.length;
      this.saveSoon();
      this.lastCapture = at;
      this.tape.duration = Math.max(this.tape.duration, at);
      this.update({
        frameCount: this.tape.frames.length,
        hasMouse: this.tape.pointers.some((sample) => !!sample.cursor),
        hasKeys: !!this.tape.interactions.length,
        bytes: this.snapshot.bytes + data.length,
        duration: this.tape.duration,
      });
      if (at >= MAX_DURATION_MS) this.limitReached();
    } catch (error) {
      this.capturePaused = true;
      this.finishCapture();
      this.update({ open: true, error: this.errorText(error) });
      if (this.tape.frames.length) this.seek(0);
    }
  }
  private limitReached() {
    this.capturePaused = true;
    this.finishCapture();
    this.saveSoon(true);
    this.update({
      open: true,
      error: "Recording stopped at the size limit. The captured replay has been kept.",
    });
    this.seek(0);
  }
  private finishCapture() {
    if (!this.capturing) return;
    this.sourceStop?.();
    this.sourceStop = null;
    this.pointerStop?.();
    this.pointerStop = null;
    this.inputStop?.();
    this.inputStop = null;
    this.clearInput();
    if (this.captureRequest !== null) this.port.cancelFrame(this.captureRequest);
    this.captureRequest = null;
    if (this.recordingClock !== null) this.port.clearTimer(this.recordingClock);
    this.recordingClock = null;
    this.capturing = false;
    this.source = null;
    this.recorder = null;
    this.decoded = null;
    this.canvasPixels = null;
    this.lastFrame = -1;
    this.update({
      recording: false,
      barOpen: false,
      duration: this.tape?.duration ?? 0,
    });
  }
  pause = () => {
    if (this.playbackRequest !== null) this.port.cancelFrame(this.playbackRequest);
    this.playbackRequest = null;
    if (this.snapshot.playing) this.update({ playing: false });
  };
  play = () => {
    if (this.capturing || this.snapshot.busy || !this.tape?.frames.length || this.snapshot.playing)
      return;
    if (this.snapshot.position >= this.playbackTiming().duration) this.seek(0);
    this.playbackAt = this.port.now();
    this.update({ playing: true });
    const tick = () => {
      this.playbackRequest = null;
      if (!this.snapshot.playing || !this.tape) return;
      const now = this.port.now();
      const position = Math.min(
        this.playbackTiming().duration,
        this.snapshot.position + (now - this.playbackAt) * this.snapshot.speed,
      );
      this.playbackAt = now;
      this.seek(position);
      if (position >= this.playbackTiming().duration) this.pause();
      else this.playbackRequest = this.port.requestFrame(tick);
    };
    this.playbackRequest = this.port.requestFrame(tick);
  };
  seek = (position: number) => {
    if (this.capturing || !this.tape?.frames.length || !Number.isFinite(position)) return;
    try {
      const timing = this.playbackTiming();
      position = Math.max(0, Math.min(timing.duration, position));
      const recorded = timing.recordedAt(position);
      const index = replayFrameAt(this.tape.frames, recorded);
      let frameRevision = this.snapshot.frameRevision;
      if (this.lastFrame !== index || !this.decoded) {
        this.reader ??= new ReplayStreamReader(this.tape.frames);
        this.decoded = this.reader.read(index);
        this.canvasPixels = null;
        this.lastFrame = index;
        frameRevision++;
      }
      this.update({ position, duration: timing.duration, frameIndex: index, frameRevision });
      const pointer = this.snapshot.showMouse
        ? recordedPointerAt(this.tape.pointers, recorded)
        : null;
      const keys = this.snapshot.showKeys ? recordedKeysAt(this.tape.interactions, recorded) : null;
      if (
        this.motion.frameRevision !== frameRevision ||
        this.motion.pointer !== pointer ||
        this.motion.keys !== keys
      ) {
        this.motion = { frameRevision, pointer, keys };
        for (const listener of this.motionListeners) listener();
      }
    } catch (error) {
      this.pause();
      this.update({ error: this.errorText(error) });
    }
  };
  paint = (canvas: HTMLCanvasElement) => {
    if (this.decoded) {
      this.canvasPixels ??= compositeTransparencyPreview(
        convertPixelsToSrgb(
          this.decoded.pixels,
          workingColorProfile(this.decoded.snapshot.document?.timeline),
        ),
      );
      this.port.paint(canvas, this.canvasPixels);
    }
  };
  cursorPresentation = (canvas: HTMLCanvasElement) => {
    if (!this.decoded || !this.motion.pointer) return null;
    return this.port.pointerPlacement(canvas, this.decoded.pixels, this.motion.pointer);
  };
  import = async () => {
    if (this.capturing || this.snapshot.busy) return;
    this.pause();
    this.update({ busy: true, error: null });
    try {
      const bytes = await this.port.pick();
      if (!bytes) return;
      const tape = decodeReplayRecording(bytes);
      await this.validate(tape);
      this.tape = tape;
      this.reader = new ReplayStreamReader(tape.frames);
      this.lastFrame = -1;
      this.decoded = null;
      this.update({
        imported: true,
        hasMouse: tape.pointers.some((sample) => !!sample.cursor),
        hasKeys: tape.interactions.some(
          (event) => event.kind === ReplayInteractionKind.Shortcut && event.keys,
        ),
        name: tape.name,
        frameCount: tape.frames.length,
        duration: tape.duration,
        bytes: bytes.length,
        position: 0,
      });
      this.seek(0);
    } catch (error) {
      this.update({
        error:
          error instanceof RangeError && error.message.includes("Replay")
            ? this.errorText(error)
            : "Invalid replay file.",
      });
    } finally {
      this.update({ busy: false });
    }
  };
  export = () => {
    if (!this.tape?.frames.length || this.capturing || this.snapshot.busy) return;
    try {
      this.port.download(
        encodeReplayRecording(this.tape),
        this.fileName("xprite-replay"),
        "application/octet-stream",
      );
    } catch (error) {
      this.update({ error: this.errorText(error) });
    }
  };
  exportGif = async () => {
    if (!this.tape?.frames.length || this.capturing || this.snapshot.busy) return;
    this.pause();
    this.update({ busy: true, error: null });
    try {
      const tape = this.tape;
      const timing = this.playbackTiming();
      const speed = this.snapshot.speed;
      const reader = new ReplayStreamReader(tape.frames);
      const first = reader.read(0).pixels;
      let width = first.width,
        height = first.height;
      // Canvas resizing is preserved in the recording; GIF uses the largest
      // canvas and keeps original pixel coordinates, without stretching frames.
      for (let index = 0; index < tape.frames.length; index++) {
        const pixels = reader.read(index).pixels;
        width = Math.max(width, pixels.width);
        height = Math.max(height, pixels.height);
        if (index % 10 === 0) await this.port.yieldTask();
      }
      const frames: ExportAnimationFrame[] = [];
      let bytes = 0;
      let previousAt = -GIF_FRAME_INTERVAL_MS;
      for (let index = 0; index < tape.frames.length; index++) {
        const frame = tape.frames[index];
        const at = timing.playbackAt(frame.at) / speed;
        if (index < tape.frames.length - 1 && at - previousAt < GIF_FRAME_INTERVAL_MS) continue;
        bytes += width * height * 4;
        if (bytes > MAX_GIF_PIXEL_BYTES)
          throw new RangeError(
            "The canvas GIF is too large. Increase playback speed or export the replay file.",
          );
        const state = reader.read(index);
        const source = convertPixelsToSrgb(
          state.pixels,
          workingColorProfile(state.snapshot.document?.timeline),
        );
        const pixels: PixelBuffer = {
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        };
        for (let y = 0; y < source.height; y++)
          pixels.data.set(
            source.data.subarray(y * source.width * 4, (y + 1) * source.width * 4),
            y * width * 4,
          );
        if (frames.length)
          frames[frames.length - 1].duration = Math.max(MIN_GIF_FRAME_MS, at - previousAt);
        frames.push({
          pixels,
          duration: Math.max(MIN_GIF_FRAME_MS, timing.duration / speed - at),
          sourceFrame: index,
        });
        previousAt = at;
        if (index % 10 === 0) await this.port.yieldTask();
      }
      this.port.download(encodeGif(frames), this.fileName("gif"), "image/gif");
    } catch (error) {
      this.update({ error: this.errorText(error) });
    } finally {
      this.update({ busy: false });
    }
  };
  private async validate(tape: ReplayRecording) {
    if (
      !tape.frames.length ||
      tape.frames[0].at !== 0 ||
      !tape.frames[0].editorKeyframe ||
      !tape.frames[0].pixelsKeyframe ||
      tape.frames.length > MAX_FRAMES ||
      tape.pointers.length > MAX_INTERACTIONS ||
      tape.interactions.length > MAX_INTERACTIONS ||
      tape.duration > MAX_DURATION_MS ||
      tape.frames.reduce((sum, frame) => sum + frame.data.length, 0) > MAX_CAPTURE_BYTES
    )
      throw new TypeError("Invalid replay file.");
    const reader = new ReplayStreamReader(tape.frames);
    const validator = new RasterEditor();
    for (let index = 0; index < tape.frames.length; index++) {
      const state = reader.read(index);
      if (tape.frames[index].editorChanged)
        validator.document.loadTimeline(
          state.snapshot.document!.timeline!,
          state.snapshot.document!.width,
          state.snapshot.document!.height,
          state.snapshot.document!.name,
          state.snapshot.palette,
        );
      if (index % 10 === 0) await this.port.yieldTask();
    }
  }
  private fileName(extension: string) {
    const name = (this.tape?.name ?? "drawing")
      .replace(/\.[^.]+$/, "")
      .replace(/[\\/:*?"<>|]/g, "_");
    const safeName = Array.from(name, (character) =>
      character.charCodeAt(0) <= MAX_FILENAME_CONTROL_CODE ? "_" : character,
    ).join("");
    return `${safeName || "drawing"}-replay.${extension}`;
  }
  private errorText(error: unknown) {
    if (!(error instanceof Error)) return "Unable to open or export the replay.";
    return error.message.startsWith("Invalid replay") ? "Invalid replay file." : error.message;
  }
}
