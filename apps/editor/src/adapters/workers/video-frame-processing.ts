import { VideoSampleSink, type InputVideoTrack, type VideoSample } from "mediabunny";

import {
  VideoImportFailure,
  VideoImportSampling,
  type VideoImportPlan,
  type VideoImportRecovery,
} from "$/managers/ports/video-import";
import type { PixelBuffer, Rgba } from "@xprite/editor-core/base";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMethod,
  PixelationMode,
  detectWithAlgorithmAsync,
  extractPixelationPalette,
  pixelateImage,
  preloadWasm,
  reduceToPalette,
  resizeNearest,
  setAcRlBrowserWorkerFactory,
  snapPalette,
  type PixelGridAnalysis,
} from "@xprite/pixelate";

const MAX_WORKING_SIDE = 2048;
const MAX_WORKING_PIXELS = 2_097_152;
const GRID_SAMPLE_COUNT = 3;
const PALETTE_FRAME_COUNT = 12;
const PALETTE_FRAME_SIDE = 256;
const PALETTE_SAMPLE_PIXELS = 16_384;
const PALETTE_SHEET_WIDTH = 256;
const RGBA_CHANNELS = 4;
const FRAME_END_EPSILON = 0.000001;
const ANALYSIS_DURATION_SECONDS = 10;

function processingError(code: VideoImportFailure): Error {
  return Object.assign(new Error(code), { code });
}

setAcRlBrowserWorkerFactory(
  () =>
    new Worker(new URL("@xprite/pixelate/wasm/ac-rl-detect-browser-worker.js", import.meta.url), {
      type: "module",
    }),
);

/** A source-wide grid and a clip-wide palette keep the animation spatially and chromatically stable. */
export class VideoFrameProcessing {
  private readonly canvas: OffscreenCanvas;
  private readonly workingWidth: number;
  private readonly workingHeight: number;
  private grid: PixelGridAnalysis | null = null;
  private prepared: { key: string; palette: Promise<readonly Rgba[]> } | null = null;

  constructor(
    private readonly track: InputVideoTrack,
    private readonly firstTimestamp: number,
    private readonly durationSeconds: number,
  ) {
    const factor = Math.max(
      1,
      Math.ceil(Math.max(track.displayWidth, track.displayHeight) / MAX_WORKING_SIDE),
      Math.ceil(Math.sqrt((track.displayWidth * track.displayHeight) / MAX_WORKING_PIXELS)),
    );
    this.workingWidth = Math.max(1, Math.round(track.displayWidth / factor));
    this.workingHeight = Math.max(1, Math.round(track.displayHeight / factor));
    this.canvas = new OffscreenCanvas(this.workingWidth, this.workingHeight);
  }

  private rasterize(
    sample: VideoSample,
    width: number,
    height: number,
    sampling: VideoImportSampling,
  ): PixelBuffer {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const context = this.canvas.getContext("2d", { colorSpace: "srgb" });
    if (!context) throw processingError(VideoImportFailure.Browser);
    context.imageSmoothingEnabled = sampling === VideoImportSampling.Smooth;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, width, height);
    sample.draw(context, 0, 0, width, height);
    return {
      width,
      height,
      data: context.getImageData(0, 0, width, height, { colorSpace: "srgb" }).data,
    };
  }

  async analyze(onActivity: () => void): Promise<VideoImportRecovery> {
    await preloadWasm().catch(() => {});
    const sink = new VideoSampleSink(this.track);
    const end = Math.min(ANALYSIS_DURATION_SECONDS, this.durationSeconds);
    for (let index = 0; index < GRID_SAMPLE_COUNT; index++) {
      onActivity();
      const time = Math.min(
        this.durationSeconds - FRAME_END_EPSILON,
        (end * index) / (GRID_SAMPLE_COUNT - 1),
      );
      const sample = await sink.getSample(this.firstTimestamp + time);
      if (!sample) continue;
      try {
        const source = this.rasterize(
          sample,
          this.workingWidth,
          this.workingHeight,
          VideoImportSampling.Nearest,
        );
        const grid = await detectWithAlgorithmAsync(source, PixelationAlgorithm.Auto);
        if (grid.reliable) {
          this.grid = grid;
          return { reliable: true, width: grid.width, height: grid.height };
        }
      } catch {
        // A later representative frame may contain a usable grid.
      } finally {
        sample.close();
        onActivity();
      }
    }
    return { reliable: false, width: this.track.displayWidth, height: this.track.displayHeight };
  }

  private spatial(
    sample: VideoSample,
    plan: VideoImportPlan,
    width = plan.width,
    height = plan.height,
  ): PixelBuffer {
    if (!plan.recoverGrid) return this.rasterize(sample, width, height, plan.sampling);
    if (!this.grid) throw processingError(VideoImportFailure.Recovery);
    const source = this.rasterize(
      sample,
      this.workingWidth,
      this.workingHeight,
      VideoImportSampling.Nearest,
    );
    const recovered = pixelateImage(source, {
      mode: PixelationMode.RecoverGrid,
      grid: this.grid,
      colorPicker: CellColorPicker.MostCommon,
    });
    if (recovered.width === width && recovered.height === height) return recovered;
    return plan.sampling === VideoImportSampling.Nearest
      ? resizeNearest(recovered, width, height)
      : pixelateImage(recovered, {
          mode: PixelationMode.Convert,
          method: PixelationMethod.Box,
          targetSize: { width, height },
        });
  }

  prepare(plan: VideoImportPlan, onActivity: () => void): Promise<readonly Rgba[]> {
    if (!plan.reduceColors) return Promise.resolve([]);
    const key = JSON.stringify([
      plan.width,
      plan.height,
      plan.sampling,
      plan.recoverGrid,
      plan.maxColors,
      plan.frames.length,
      plan.frames[0].timestampSeconds,
      plan.frames[plan.frames.length - 1].timestampSeconds,
    ]);
    if (this.prepared?.key === key) return this.prepared.palette;
    const palette = this.buildPalette(plan, onActivity);
    this.prepared = { key, palette };
    void palette.catch(() => {
      if (this.prepared?.key === key) this.prepared = null;
    });
    return palette;
  }

  private async buildPalette(
    plan: VideoImportPlan,
    onActivity: () => void,
  ): Promise<readonly Rgba[]> {
    const count = Math.min(PALETTE_FRAME_COUNT, plan.frames.length);
    const timestamps = Array.from(
      { length: count },
      (_, index) =>
        this.firstTimestamp +
        plan.frames[Math.round((index * (plan.frames.length - 1)) / Math.max(1, count - 1))]
          .timestampSeconds,
    );
    const sampleSize = Math.floor(PALETTE_SAMPLE_PIXELS / count);
    const data = new Uint8ClampedArray(PALETTE_SAMPLE_PIXELS * RGBA_CHANNELS);
    const scale = Math.min(1, PALETTE_FRAME_SIDE / Math.max(plan.width, plan.height));
    const width = Math.max(1, Math.round(plan.width * scale));
    const height = Math.max(1, Math.round(plan.height * scale));
    const sink = new VideoSampleSink(this.track);
    let written = 0;
    let frameIndex = 0;
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (!sample) throw processingError(VideoImportFailure.Frame);
      try {
        const image = this.spatial(sample, plan, width, height);
        const pixels = image.width * image.height;
        const samples = Math.min(sampleSize, pixels);
        for (let index = 0; index < samples; index++) {
          const pixel = Math.min(
            pixels - 1,
            Math.floor(((index + (frameIndex + 0.5) / count) * pixels) / samples),
          );
          const offset = pixel * RGBA_CHANNELS;
          if (!image.data[offset + 3]) continue;
          data.set(image.data.subarray(offset, offset + RGBA_CHANNELS), written++ * RGBA_CHANNELS);
        }
        frameIndex++;
        onActivity();
      } finally {
        sample.close();
      }
    }
    if (!written) return [];
    const sheetHeight = Math.ceil(written / PALETTE_SHEET_WIDTH);
    const sheet: PixelBuffer = {
      width: PALETTE_SHEET_WIDTH,
      height: sheetHeight,
      data: data.slice(0, PALETTE_SHEET_WIDTH * sheetHeight * RGBA_CHANNELS),
    };
    const snapped = snapPalette(sheet, { colors: plan.maxColors });
    return extractPixelationPalette(snapped, { maxColors: plan.maxColors }).map(
      (entry) => entry.color,
    );
  }

  frame(sample: VideoSample, plan: VideoImportPlan, palette: readonly Rgba[]): PixelBuffer {
    const image = this.spatial(sample, plan);
    return palette.length ? reduceToPalette(image, palette) : image;
  }
}
