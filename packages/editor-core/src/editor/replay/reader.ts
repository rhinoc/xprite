import { ReplayStreamDecoder, type ReplayStreamFrame } from "$/editor/replay/stream";

const MAX_FORWARD_FRAMES = 240;

/** Editor and raster checkpoints are independent: unchanged document bytes do
 * not recur in periodic canvas checkpoints. Seeking reconstructs both tracks. */
export class ReplayStreamReader {
  private decoder = new ReplayStreamDecoder();
  private index = -1;
  constructor(private readonly frames: readonly ReplayStreamFrame[]) {}

  read(index: number) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.frames.length)
      throw new TypeError("Invalid replay frame index.");
    if (this.index >= 0 && index >= this.index && index - this.index <= MAX_FORWARD_FRAMES) {
      for (let at = this.index + 1; at <= index; at++) this.decoder.apply(this.frames[at]);
    } else {
      let pixels = index;
      while (pixels >= 0 && !this.frames[pixels].pixelsKeyframe) pixels--;
      let editor = index;
      while (editor >= 0 && !this.frames[editor].editorKeyframe) editor--;
      if (pixels < 0 || editor < 0) throw new TypeError("Invalid replay checkpoints.");
      this.decoder = new ReplayStreamDecoder();
      for (let at = editor; at <= index; at++)
        if (this.frames[at].editorChanged)
          this.decoder.apply(this.frames[at], { editor: true, pixels: false });
      for (let at = pixels; at <= index; at++)
        this.decoder.apply(this.frames[at], { editor: false, pixels: true });
    }
    this.index = index;
    return this.decoder.getState();
  }
}
