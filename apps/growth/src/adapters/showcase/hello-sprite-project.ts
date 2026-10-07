const PROJECT_ROOT = "/showcase/ipad/hello/";

interface SpriteFrame {
  index: number;
  durationMs: number;
  rect: { x: number; y: number; w: number; h: number };
}

interface SpriteSequence {
  sourceSha256: string;
  sheet: string;
  sheetSize: { w: number; h: number };
  frameCount: number;
  frames: SpriteFrame[];
}

interface SpriteProject {
  width: number;
  height: number;
  pathSourceSha256: string;
  animation: SpriteSequence & { loopDurationMs: number };
  writing: SpriteSequence & { durationMs: number };
}

interface PencilMotion {
  pathSourceSha256: string;
  writingSourceSha256: string;
  durationMs: number;
  samples: [number, number][];
  writingFrameProgress: number[];
}

interface ArtworkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Loads native Aseprite exports; no stroke rasterization or image synthesis at runtime. */
export class HelloSpriteProject {
  readonly ready: Promise<void>;
  private readonly abort = new AbortController();
  private project!: SpriteProject;
  private writing!: HTMLImageElement;
  private motion!: PencilMotion;

  constructor() {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const response = await fetch(`${PROJECT_ROOT}frames.json`, {
      signal: this.abort.signal,
      cache: "no-cache",
    });
    if (!response.ok) throw new Error("Unable to load the hello project manifest");
    this.project = (await response.json()) as SpriteProject;
    if (
      !Number.isInteger(this.project.width) ||
      !Number.isInteger(this.project.height) ||
      this.project.width <= 0 ||
      this.project.height <= 0
    )
      throw new Error("Hello project dimensions are invalid");
    for (const [sequence, duration] of [
      [this.project.writing, this.project.writing.durationMs],
      [this.project.animation, this.project.animation.loopDurationMs],
    ] as const) {
      if (
        sequence.frameCount !== sequence.frames.length ||
        sequence.frameCount === 0 ||
        sequence.frames.some(
          (frame) => !Number.isFinite(frame.durationMs) || frame.durationMs <= 0,
        ) ||
        sequence.frames.reduce((total, frame) => total + frame.durationMs, 0) !== duration
      )
        throw new Error("Hello project frame metadata is inconsistent");
    }
    const [writing, motion] = await Promise.all([
      this.loadSheet(this.project.writing),
      this.loadMotion(),
    ]);
    this.writing = writing;
    this.motion = motion;
  }

  private async loadMotion(): Promise<PencilMotion> {
    const response = await fetch(`${PROJECT_ROOT}motion.json`, {
      signal: this.abort.signal,
      cache: "no-cache",
    });
    if (!response.ok) throw new Error("Unable to load the Pencil motion path");
    const motion = (await response.json()) as PencilMotion;
    if (
      motion.pathSourceSha256 !== this.project.pathSourceSha256 ||
      motion.writingSourceSha256 !== this.project.writing.sourceSha256 ||
      motion.durationMs !== this.project.writing.durationMs ||
      motion.samples.length < 2 ||
      motion.samples.some((point) => point.length !== 2 || !point.every(Number.isFinite)) ||
      motion.writingFrameProgress.length !== this.project.writing.frameCount ||
      motion.writingFrameProgress[0] !== 0 ||
      motion.writingFrameProgress.at(-1) !== 1 ||
      motion.writingFrameProgress.some(
        (progress, index, frames) =>
          !Number.isFinite(progress) ||
          progress < 0 ||
          progress > 1 ||
          (index > 0 && progress <= frames[index - 1]),
      )
    )
      throw new Error("Pencil motion differs from its native writing source");
    return motion;
  }

  private loadSheet(sequence: SpriteSequence): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        this.abort.signal.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        cleanup();
        image.removeAttribute("src");
        reject(new DOMException("Hello project disposed", "AbortError"));
      };
      image.onload = () => {
        cleanup();
        if (
          image.naturalWidth !== sequence.sheetSize.w ||
          image.naturalHeight !== sequence.sheetSize.h
        )
          reject(new Error("Hello sprite sheet dimensions differ from its ASE export"));
        else resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(new Error("Unable to load the hello sprite sheet"));
      };
      this.abort.signal.addEventListener("abort", cancel, { once: true });
      if (this.abort.signal.aborted) {
        cancel();
        return;
      }
      image.src = `${PROJECT_ROOT}${sequence.sheet}?v=${sequence.sourceSha256}`;
    });
  }

  get frameCount(): number {
    return this.project.animation.frameCount;
  }

  private frameAt(sequence: SpriteSequence, elapsedMs: number, loopDurationMs?: number) {
    let remainder = Math.max(0, elapsedMs);
    if (loopDurationMs !== undefined) remainder %= loopDurationMs;
    for (let index = 0; index < sequence.frames.length; index++) {
      const frame = sequence.frames[index];
      if (remainder < frame.durationMs || index === sequence.frames.length - 1)
        return { index, frame };
      remainder -= frame.durationMs;
    }
    throw new Error("Hello project has no frames");
  }

  animationFrameAt(elapsedMs: number): number {
    return this.frameAt(this.project.animation, elapsedMs, this.project.animation.loopDurationMs)
      .index;
  }

  private writingProgress(elapsedMs: number): number {
    return Math.max(0, Math.min(1, elapsedMs / this.project.writing.durationMs));
  }

  private writingFrameAt(elapsedMs: number): SpriteFrame {
    const progress = this.writingProgress(elapsedMs);
    const frames = this.motion.writingFrameProgress;
    let low = 0;
    let high = frames.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (frames[middle] <= progress) low = middle;
      else high = middle - 1;
    }
    return this.project.writing.frames[low];
  }

  writingFrameIndexAt(elapsedMs: number): number {
    return this.writingFrameAt(elapsedMs).index;
  }

  drawWriting(context: CanvasRenderingContext2D, bounds: ArtworkRect, elapsedMs: number): void {
    // Preserve the native raster frames and their order; retime their display to
    // match continuous Pencil distance instead of the integer raster-tip speed.
    const frame = this.writingFrameAt(elapsedMs);
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.writing,
      frame.rect.x,
      frame.rect.y,
      frame.rect.w,
      frame.rect.h,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );
    context.restore();
  }

  pencilPosition(elapsedMs: number, bounds: ArtworkRect) {
    const samples = this.motion.samples;
    const position = this.writingProgress(elapsedMs) * (samples.length - 1);
    const index = Math.min(Math.floor(position), samples.length - 2);
    const fraction = position - index;
    const start = samples[index];
    const end = samples[index + 1];
    // A dense source-curve path is independent of pixel quantization. Hermite
    // interpolation shares tangents at every sample, with deterministic seeking
    // and no frame-rate-dependent smoothing or drawing of vector artwork.
    const coordinate = (axis: 0 | 1) => {
      const before = samples[index - 1]?.[axis] ?? 2 * start[axis] - end[axis];
      const after = samples[index + 2]?.[axis] ?? 2 * end[axis] - start[axis];
      const startTangent = (end[axis] - before) / 2;
      const endTangent = (after - start[axis]) / 2;
      const squared = fraction * fraction;
      const cubed = squared * fraction;
      return (
        (2 * cubed - 3 * squared + 1) * start[axis] +
        (cubed - 2 * squared + fraction) * startTangent +
        (-2 * cubed + 3 * squared) * end[axis] +
        (cubed - squared) * endTangent
      );
    };
    return {
      x: bounds.x + (coordinate(0) / this.project.width) * bounds.width,
      y: bounds.y + (coordinate(1) / this.project.height) * bounds.height,
    };
  }

  dispose(): void {
    this.abort.abort();
    this.writing?.removeAttribute("src");
  }
}
