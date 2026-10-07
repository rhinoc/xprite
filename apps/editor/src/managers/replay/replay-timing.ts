const MAX_IDLE_HOLD_MS = 1000;

interface ReplayTimeSample {
  at: number;
}

/** A playback-only clock. Recorded timestamps and bytes remain unchanged. */
export class ReplayTiming {
  private readonly recorded = [0];
  private readonly playback = [0];
  readonly duration: number;

  constructor(frames: readonly ReplayTimeSample[], duration: number, skipIdle: boolean) {
    const append = (at: number) => {
      const previous = this.recorded[this.recorded.length - 1];
      if (at <= previous) return;
      const gap = at - previous;
      this.recorded.push(at);
      this.playback.push(
        this.playback[this.playback.length - 1] +
          (skipIdle ? Math.min(gap, MAX_IDLE_HOLD_MS) : gap),
      );
    };
    for (const frame of frames) append(frame.at);
    append(duration);
    this.duration = this.playback[this.playback.length - 1];
  }

  recordedAt(position: number): number {
    return this.map(position, this.playback, this.recorded);
  }

  playbackAt(recorded: number): number {
    return this.map(recorded, this.recorded, this.playback);
  }

  private map(value: number, from: readonly number[], to: readonly number[]): number {
    value = Math.max(0, Math.min(from[from.length - 1], value));
    let low = 0;
    let high = from.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (from[middle] <= value) low = middle + 1;
      else high = middle;
    }
    const index = Math.max(0, low - 1);
    if (index === from.length - 1) return to[index];
    const ratio = (value - from[index]) / (from[index + 1] - from[index]);
    return to[index] + ratio * (to[index + 1] - to[index]);
  }
}
