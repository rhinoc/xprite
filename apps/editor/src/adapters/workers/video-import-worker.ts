import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type InputVideoTrack,
  type VideoSample,
} from "mediabunny";

import { VideoFrameProcessing } from "$/adapters/workers/video-frame-processing";
import {
  VideoImportOperation,
  type VideoImportRequest,
  type VideoImportResponse,
} from "$/adapters/workers/video-import-protocol";
import { VideoImportFailure, VideoImportSampling } from "$/managers/ports/video-import";
import {
  assertRasterAnimationCapacity,
  type RasterAnimationFrame,
} from "@xprite/editor-core/import-export";
import { resizeNearest } from "@xprite/pixelate";

const PREVIEW_MIME_TYPE = "image/png";
const RGBA_COLOR_SPACE = "srgb";
const PROGRESS_INTERVAL_MS = 100;
const LAST_FRAME_EPSILON_SECONDS = 0.000001;
const MAX_PREVIEW_DIMENSION = 640;
const DEFAULT_FRAME_RATE = 12;
const PACKET_STAT_SAMPLE_COUNT = 100;
const MAX_THUMBNAIL_COUNT = 24;

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<VideoImportRequest>) => void,
  ): void;
  postMessage(message: VideoImportResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
let input: Input | null = null;
let track: InputVideoTrack | null = null;
let firstTimestamp = 0;
let durationSeconds = 0;
let previewSink: VideoSampleSink | null = null;
let previewCanvas: OffscreenCanvas | null = null;
let processing: VideoFrameProcessing | null = null;

function failure(code: VideoImportFailure, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function canvasFor(width: number, height: number, maximum: number): OffscreenCanvas {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maximum ||
    height > maximum
  )
    failure(VideoImportFailure.Metadata, "Invalid video output dimensions");
  return new OffscreenCanvas(width, height);
}

function draw(sample: VideoSample, canvas: OffscreenCanvas, sampling: VideoImportSampling) {
  const context = canvas.getContext("2d", { colorSpace: RGBA_COLOR_SPACE });
  if (!context) failure(VideoImportFailure.Browser, "Offscreen 2D canvas is unavailable");
  context.imageSmoothingEnabled = sampling === VideoImportSampling.Smooth;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  // VideoSample.draw applies source rotation, flip and pixel aspect ratio before resizing.
  sample.draw(context, 0, 0, canvas.width, canvas.height);
  return context;
}

async function execute(request: VideoImportRequest) {
  if (request.operation === VideoImportOperation.Open) {
    if (typeof VideoDecoder !== "function" || typeof OffscreenCanvas !== "function")
      failure(VideoImportFailure.Browser, "Video decoding in a worker is unavailable");
    input?.dispose();
    input = new Input({ source: new BlobSource(request.file), formats: ALL_FORMATS });
    try {
      track = await input.getPrimaryVideoTrack();
    } catch {
      failure(VideoImportFailure.Format, "Unrecognized or damaged media container");
    }
    if (!track) failure(VideoImportFailure.Track, "No video track found");
    if (!(await track.canDecode())) failure(VideoImportFailure.Codec, "Video codec is unavailable");
    firstTimestamp = await track.getFirstTimestamp();
    durationSeconds = (await track.computeDuration()) - firstTimestamp;
    const width = track.displayWidth;
    const height = track.displayHeight;
    if (
      !Number.isFinite(firstTimestamp) ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0.001 ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    )
      failure(VideoImportFailure.Metadata, "Invalid video duration or dimensions");
    const stats = await track.computePacketStats(PACKET_STAT_SAMPLE_COUNT);
    const frameRate =
      Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0
        ? stats.averagePacketRate
        : DEFAULT_FRAME_RATE;
    processing = new VideoFrameProcessing(track, firstTimestamp, durationSeconds);
    const recovery = await processing.analyze(() =>
      scope.postMessage({ id: request.id, activity: true }),
    );
    previewSink = new VideoSampleSink(track);
    scope.postMessage({
      id: request.id,
      ok: true,
      result: {
        operation: request.operation,
        metadata: { width, height, durationSeconds, frameRate, codec: track.codec ?? "", recovery },
      },
    });
    return;
  }

  if (!track || !input) failure(VideoImportFailure.Decode, "Video source is no longer open");
  if (request.operation === VideoImportOperation.Thumbnails) {
    const canvas = canvasFor(request.width, request.height, MAX_PREVIEW_DIMENSION);
    const sink = new VideoSampleSink(track);
    const timestamps = request.timestamps
      .slice(0, MAX_THUMBNAIL_COUNT)
      .map(
        (time) =>
          firstTimestamp +
          Math.max(0, Math.min(durationSeconds - LAST_FRAME_EPSILON_SECONDS, time)),
      );
    let index = 0;
    try {
      for await (const sample of sink.samplesAtTimestamps(timestamps)) {
        if (!sample) {
          index++;
          continue;
        }
        try {
          draw(sample, canvas, VideoImportSampling.Smooth);
        } finally {
          sample.close();
        }
        const blob = await canvas.convertToBlob({ type: PREVIEW_MIME_TYPE });
        scope.postMessage({ id: request.id, thumbnail: { index: index++, blob } });
      }
      scope.postMessage({ id: request.id, ok: true, result: { operation: request.operation } });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
    return;
  }
  if (request.operation === VideoImportOperation.Preview) {
    if (!Number.isFinite(request.timeSeconds))
      failure(VideoImportFailure.Metadata, "Invalid preview time");
    const time =
      firstTimestamp +
      Math.max(0, Math.min(durationSeconds - LAST_FRAME_EPSILON_SECONDS, request.timeSeconds));
    const palette = await processing!.prepare(request.plan, () =>
      scope.postMessage({ id: request.id, activity: true }),
    );
    const sample = await previewSink!.getSample(time);
    if (!sample) failure(VideoImportFailure.Frame, "No preview frame at this timestamp");
    try {
      if (previewCanvas?.width !== request.width || previewCanvas.height !== request.height)
        previewCanvas = canvasFor(request.width, request.height, MAX_PREVIEW_DIMENSION);
      const result = processing!.frame(sample, request.plan, palette);
      const pixels =
        result.width === request.width && result.height === request.height
          ? result
          : resizeNearest(result, request.width, request.height);
      const context = previewCanvas.getContext("2d", { colorSpace: RGBA_COLOR_SPACE })!;
      context.putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    } finally {
      sample.close();
    }
    const blob = await previewCanvas!.convertToBlob({ type: PREVIEW_MIME_TYPE });
    scope.postMessage({ id: request.id, ok: true, result: { operation: request.operation, blob } });
    return;
  }

  const { plan } = request;
  assertRasterAnimationCapacity(plan.width, plan.height, plan.frames.length);
  const palette = await processing!.prepare(plan, () =>
    scope.postMessage({ id: request.id, activity: true }),
  );
  const sink = new VideoSampleSink(track);
  const frames: RasterAnimationFrame[] = [];
  let previousTimestamp = -Infinity;
  for (const frame of plan.frames) {
    if (
      !Number.isFinite(frame.timestampSeconds) ||
      frame.timestampSeconds < 0 ||
      frame.timestampSeconds >= durationSeconds ||
      frame.timestampSeconds < previousTimestamp ||
      !Number.isSafeInteger(frame.durationMs) ||
      frame.durationMs < 1
    )
      failure(VideoImportFailure.Metadata, "Invalid video sampling plan");
    previousTimestamp = frame.timestampSeconds;
  }
  // Monotonic timestamps reuse dependency-frame decoding; the async iterator supplies backpressure.
  const timestamps = plan.frames.map((frame) => firstTimestamp + frame.timestampSeconds);
  let lastProgress = 0;
  try {
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (!sample) failure(VideoImportFailure.Frame, "A selected video frame could not be decoded");
      try {
        const pixels = processing!.frame(sample, plan, palette);
        frames.push({ pixels, durationMs: plan.frames[frames.length].durationMs });
      } finally {
        sample.close();
      }
      const now = performance.now();
      if (now - lastProgress >= PROGRESS_INTERVAL_MS || frames.length === plan.frames.length) {
        scope.postMessage({
          id: request.id,
          progress: { completed: frames.length, total: plan.frames.length },
        });
        lastProgress = now;
      }
    }
    if (frames.length !== plan.frames.length)
      failure(VideoImportFailure.Frame, "Incomplete video import");
    scope.postMessage(
      {
        id: request.id,
        ok: true,
        result: {
          operation: request.operation,
          animation: {
            width: plan.width,
            height: plan.height,
            frames,
            ...(palette.length ? { palette } : {}),
          },
        },
      },
      frames.map((frame) => frame.pixels.data.buffer as ArrayBuffer),
    );
  } finally {
    if (previewCanvas) {
      previewCanvas.width = 0;
      previewCanvas.height = 0;
    }
    previewCanvas = null;
  }
}

// A preview and a final import must never race the same demuxer/decoder resources.
let tail: Promise<void> = Promise.resolve();
scope.addEventListener("message", ({ data: request }) => {
  const operation = async () => {
    try {
      await execute(request);
    } catch (reason) {
      const code =
        reason && typeof reason === "object" && "code" in reason
          ? (reason.code as VideoImportFailure)
          : VideoImportFailure.Decode;
      scope.postMessage({
        id: request.id,
        ok: false,
        error: {
          code,
          message: reason instanceof Error ? reason.message : String(reason),
        },
      });
    }
  };
  // Thumbnail decoding uses its own bounded sink; scrubbing never waits for the full strip.
  if (request.operation === VideoImportOperation.Thumbnails) void tail.then(operation);
  else tail = tail.then(operation);
});
