import { tUi } from "$/i18n";
import { defaultVideoImportSettings, videoImportPlan } from "$/managers/files/video-import-plan";
import {
  VideoImportFailure,
  VideoImportPhase,
  type VideoImportHandle,
  type VideoImportMetadata,
  type VideoImportPort,
  type VideoImportPreview,
  type VideoImportProgress,
  type VideoImportSettings,
} from "$/managers/ports/video-import";
import { rasterAnimationProject } from "@xprite/editor-core/import-export";
import type { SessionProject, SessionSource } from "@xprite/editor-core/session";

export { VideoImportSampling, VideoImportPhase } from "$/managers/ports/video-import";

export enum VideoImportStage {
  Idle = "idle",
  Loading = "loading",
  Ready = "ready",
  Importing = "importing",
  Error = "error",
}

export interface VideoImportSnapshot {
  stage: VideoImportStage;
  name: string;
  metadata: VideoImportMetadata | null;
  settings: VideoImportSettings | null;
  previewUrl: string | null;
  previewTime: number;
  previewing: boolean;
  playing: boolean;
  thumbnails: readonly (string | null)[];
  previewError: string | null;
  error: string | null;
  validationError: string | null;
  frameCount: number;
  progress: VideoImportProgress;
}

const PREVIEW_MAX_DIMENSION = 640;
const PREVIEW_DEBOUNCE_MS = 40;
const THUMBNAIL_COUNT = 12;
const THUMBNAIL_HEIGHT = 48;
const THUMBNAIL_MAX_WIDTH = 160;
const PREVIEW_MAX_FRAME_RATE = 24;
const MILLISECONDS_PER_SECOND = 1000;
const PREVIEW_FRAME_EPSILON = 1e-9;
const IDLE: VideoImportSnapshot = {
  stage: VideoImportStage.Idle,
  name: "",
  metadata: null,
  settings: null,
  previewUrl: null,
  previewTime: 0,
  previewing: false,
  playing: false,
  thumbnails: [],
  previewError: null,
  error: null,
  validationError: null,
  frameCount: 0,
  progress: { phase: VideoImportPhase.Reading, completed: 0, total: 0 },
};

function failureMessage(reason: unknown): string {
  const code = reason && typeof reason === "object" && "code" in reason ? reason.code : undefined;
  switch (code) {
    case VideoImportFailure.Browser:
      return tUi("video.import.browser.unsupported");
    case VideoImportFailure.Format:
      return tUi("video.import.format.unsupported");
    case VideoImportFailure.Codec:
      return tUi("video.import.codec.unsupported");
    case VideoImportFailure.Track:
      return tUi("video.import.no.track");
    case VideoImportFailure.Metadata:
      return tUi("video.import.metadata.invalid");
    case VideoImportFailure.Frame:
      return tUi("video.import.frame.failed");
    default:
      return tUi("video.import.decode.failed");
  }
}

/** Workspace-owned draft: cancellation never installs a partially decoded document. */
export class VideoImportManager {
  private state = IDLE;
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private handle: VideoImportHandle | null = null;
  private complete: ((project: SessionProject | null) => void) | null = null;
  private unlinkAbort: (() => void) | null = null;
  private preview: VideoImportPreview | null = null;
  private previewGeneration = 0;
  private previewWanted = false;
  private previewRunning = false;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbnailPreviews: VideoImportPreview[] = [];
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackOrigin = { clock: 0, time: 0 };

  constructor(private readonly port?: VideoImportPort) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<VideoImportSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  isVideoSource(source: string): boolean {
    return this.port?.isVideoSource(source) ?? false;
  }

  request(source: SessionSource<string>, signal: AbortSignal): Promise<SessionProject | null> {
    if (signal.aborted || !this.port) return Promise.resolve(null);
    if (this.controller) throw new Error(tUi("video.import.settings.invalid"));
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ ...IDLE, stage: VideoImportStage.Loading, name: source.name });
    return new Promise((resolve) => {
      this.complete = resolve;
      const cancel = () => this.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      this.unlinkAbort = () => signal.removeEventListener("abort", cancel);
      void this.load(source.source, controller);
    });
  }

  private async load(source: string, controller: AbortController) {
    try {
      const handle = await this.port!.open(source, controller.signal, (progress) => {
        if (controller === this.controller && !controller.signal.aborted)
          this.publish({ progress });
      });
      if (controller !== this.controller || controller.signal.aborted) {
        handle.dispose();
        return;
      }
      this.handle = handle;
      this.publish({
        stage: VideoImportStage.Ready,
        metadata: handle.metadata,
        settings: defaultVideoImportSettings(handle.metadata),
        thumbnails: Array.from({ length: THUMBNAIL_COUNT }, () => null),
      });
      this.validate();
      this.seek(0);
      const { width, height, durationSeconds } = handle.metadata;
      const thumbnailWidth = Math.min(
        THUMBNAIL_MAX_WIDTH,
        Math.max(1, Math.round((THUMBNAIL_HEIGHT * width) / height)),
      );
      const timestamps = Array.from(
        { length: THUMBNAIL_COUNT },
        (_, index) => (durationSeconds * index) / (THUMBNAIL_COUNT - 1),
      );
      void handle
        .thumbnails(timestamps, thumbnailWidth, THUMBNAIL_HEIGHT, (index, preview) => {
          if (handle !== this.handle || controller.signal.aborted) {
            preview.release();
            return;
          }
          this.thumbnailPreviews.push(preview);
          const thumbnails = [...this.state.thumbnails];
          thumbnails[index] = preview.url;
          this.publish({ thumbnails });
        })
        .catch(() => {});
    } catch (reason) {
      if (controller === this.controller && !controller.signal.aborted)
        this.publish({ stage: VideoImportStage.Error, error: failureMessage(reason) });
    }
  }

  update(patch: Partial<VideoImportSettings>) {
    if (this.state.stage !== VideoImportStage.Ready || !this.state.settings) return;
    this.stopPlayback();
    const previous = this.state.settings;
    const settings = { ...previous, ...patch };
    const metadata = this.state.metadata!;
    const aspect =
      settings.recoverGrid && metadata.recovery.reliable ? metadata.recovery : metadata;
    if (settings.keepAspectRatio) {
      if (patch.width !== undefined)
        settings.height = Math.max(1, Math.round((settings.width * aspect.height) / aspect.width));
      else if (patch.height !== undefined || patch.keepAspectRatio === true)
        settings.width = Math.max(1, Math.round((settings.height * aspect.width) / aspect.height));
    }
    this.publish({ settings, error: null });
    this.validate();
    this.seek(
      settings.startSeconds !== previous.startSeconds
        ? settings.startSeconds
        : settings.endSeconds !== previous.endSeconds
          ? settings.endSeconds
          : this.state.previewTime,
    );
  }

  private validate() {
    try {
      const plan = videoImportPlan(this.state.metadata!, this.state.settings!);
      this.publish({ frameCount: plan.frames.length, validationError: null });
    } catch (reason) {
      this.publish({
        frameCount: 0,
        validationError:
          reason instanceof Error ? reason.message : tUi("video.import.settings.invalid"),
      });
    }
  }

  seek(time: number) {
    this.stopPlayback();
    this.queuePreview(time);
  }

  togglePlayback = () => {
    if (this.state.playing) {
      this.stopPlayback();
      return;
    }
    const settings = this.state.settings;
    if (!settings || this.state.stage !== VideoImportStage.Ready || this.state.validationError)
      return;
    const time =
      this.state.previewTime >= settings.startSeconds &&
      this.state.previewTime < settings.endSeconds
        ? this.state.previewTime
        : settings.startSeconds;
    this.playbackOrigin = { clock: performance.now(), time };
    this.publish({ playing: true });
    this.queuePreview(time, 0);
  };

  private stopPlayback() {
    if (this.playbackTimer !== null) clearTimeout(this.playbackTimer);
    this.playbackTimer = null;
    if (this.state.playing) this.publish({ playing: false });
  }

  private schedulePlayback() {
    if (!this.state.playing || !this.state.settings) return;
    const settings = this.state.settings;
    this.playbackTimer = setTimeout(
      () => {
        this.playbackTimer = null;
        if (!this.state.playing) return;
        const elapsed = (performance.now() - this.playbackOrigin.clock) / MILLISECONDS_PER_SECOND;
        const duration = settings.endSeconds - settings.startSeconds;
        const time =
          settings.startSeconds +
          ((this.playbackOrigin.time - settings.startSeconds + elapsed) % duration);
        this.queuePreview(time, 0);
      },
      MILLISECONDS_PER_SECOND / Math.min(PREVIEW_MAX_FRAME_RATE, settings.frameRate),
    );
  }

  private queuePreview(time: number, delay = PREVIEW_DEBOUNCE_MS) {
    if (this.state.stage !== VideoImportStage.Ready || !Number.isFinite(time)) return;
    const duration = this.state.metadata!.durationSeconds;
    this.previewGeneration++;
    if (this.state.validationError) {
      this.previewWanted = false;
      this.publish({ previewing: false });
      return;
    }
    this.previewWanted = true;
    this.publish({
      previewTime: Math.max(0, Math.min(duration, time)),
      previewing: true,
      progress: { phase: VideoImportPhase.Preview, completed: 0, total: 1 },
    });
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.drainPreview();
    }, delay);
  }

  private async drainPreview() {
    if (this.previewRunning) return;
    this.previewRunning = true;
    try {
      while (this.previewWanted && this.handle && this.state.stage === VideoImportStage.Ready) {
        this.previewWanted = false;
        const generation = this.previewGeneration;
        const handle = this.handle;
        const { settings, previewTime } = this.state;
        const frameIndex = Math.min(
          this.state.frameCount - 1,
          Math.max(
            0,
            Math.floor(
              (previewTime - settings!.startSeconds) * settings!.frameRate + PREVIEW_FRAME_EPSILON,
            ),
          ),
        );
        const frameTime = settings!.startSeconds + frameIndex / settings!.frameRate;
        const scale = Math.min(
          1,
          PREVIEW_MAX_DIMENSION / Math.max(settings!.width, settings!.height),
        );
        try {
          const preview = await handle.preview(
            frameTime,
            Math.max(1, Math.round(settings!.width * scale)),
            Math.max(1, Math.round(settings!.height * scale)),
            videoImportPlan(this.state.metadata!, settings!),
            (progress) => {
              if (generation === this.previewGeneration && handle === this.handle)
                this.publish({ progress });
            },
          );
          if (generation !== this.previewGeneration || handle !== this.handle) {
            preview.release();
            continue;
          }
          const previous = this.preview;
          this.preview = preview;
          this.publish({ previewUrl: preview.url, previewing: false, previewError: null });
          previous?.release();
          this.schedulePlayback();
        } catch (reason) {
          if (generation === this.previewGeneration && handle === this.handle)
            this.publish({ previewing: false, previewError: failureMessage(reason) });
          this.stopPlayback();
        }
      }
    } finally {
      this.previewRunning = false;
    }
  }

  async import() {
    if (
      this.state.stage !== VideoImportStage.Ready ||
      !this.handle ||
      this.state.validationError ||
      this.state.previewError ||
      (this.state.previewing && !this.state.playing)
    )
      return;
    const controller = this.controller!;
    this.stopPlayback();
    const handle = this.handle;
    const plan = videoImportPlan(this.state.metadata!, this.state.settings!);
    this.previewGeneration++;
    this.previewWanted = false;
    this.publish({
      stage: VideoImportStage.Importing,
      error: null,
      previewing: false,
      progress: { phase: VideoImportPhase.Frames, completed: 0, total: plan.frames.length },
    });
    try {
      const animation = await handle.decode(plan, (progress) => {
        if (controller === this.controller) this.publish({ progress });
      });
      if (controller !== this.controller || controller.signal.aborted) return;
      const project = {
        ...rasterAnimationProject(animation),
        ...(animation.palette ? { palette: animation.palette } : {}),
      };
      this.finish(project);
    } catch (reason) {
      if (controller === this.controller && !controller.signal.aborted)
        this.publish({ stage: VideoImportStage.Ready, error: failureMessage(reason) });
    }
  }

  cancel = () => this.finish(null);

  private finish(project: SessionProject | null) {
    this.stopPlayback();
    const complete = this.complete;
    this.complete = null;
    this.unlinkAbort?.();
    this.unlinkAbort = null;
    this.controller?.abort();
    this.controller = null;
    this.handle?.dispose();
    this.handle = null;
    this.previewGeneration++;
    this.previewWanted = false;
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.preview?.release();
    this.preview = null;
    for (const preview of this.thumbnailPreviews) preview.release();
    this.thumbnailPreviews = [];
    this.publish(IDLE);
    complete?.(project);
  }
}
