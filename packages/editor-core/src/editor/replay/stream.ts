import { deflateSync, strToU8, strFromU8 } from "fflate";

import { assertPixelBuffer } from "$/document/pixel-validation";
import {
  serializeReplayFrame,
  deserializeReplayFrame,
  inflateReplayBytes,
  type ReplayFrameState,
} from "$/editor/replay/codec";

const VERSION = 1;
const HEADER_BYTES = 4;
const PATCH_BLOCK_BYTES = 256;
const PIXEL_CHECKPOINT_FRAMES = 120;
const EDITOR_CHECKPOINT_CHANGES = 100;
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

interface Patch {
  length: number;
  ranges: [number, number][];
}
interface Packet {
  version: number;
  width: number;
  height: number;
  editor: Patch | null;
  pixels: Patch;
  editorKeyframe: boolean;
  pixelsKeyframe: boolean;
}
export interface ReplayStreamFrame {
  data: Uint8Array;
  editorChanged: boolean;
  editorKeyframe: boolean;
  pixelsKeyframe: boolean;
}

/** Byte blocks keep only changed regions, including alpha/hidden RGB exactly.
 * Graph metadata and binary data use the same patch format. */
function difference(current: Uint8Array, previous: Uint8Array | null, payload: Uint8Array[]) {
  const ranges: [number, number][] = [];
  for (let offset = 0; offset < current.length; offset += PATCH_BLOCK_BYTES) {
    const end = Math.min(current.length, offset + PATCH_BLOCK_BYTES);
    let changed = !previous || end > previous.length;
    if (!changed)
      for (let index = offset; index < end; index++)
        if (current[index] !== previous![index]) {
          changed = true;
          break;
        }
    if (!changed) continue;
    const last = ranges[ranges.length - 1];
    if (last && last[0] + last[1] === offset) last[1] += end - offset;
    else ranges.push([offset, end - offset]);
    payload.push(current.subarray(offset, end));
  }
  return { length: current.length, ranges } satisfies Patch;
}

/** Raster samples do not serialize the document graph. Editor changes are
 * independently patched and checkpointed, so a large unchanged animation is
 * neither copied into every tip sample nor repeated at raster checkpoints. */
export class ReplayStreamEncoder {
  private editor: Uint8Array | null = null;
  private pixels: Uint8Array | null = null;
  private width = 0;
  private height = 0;
  private rasterFrames = 0;
  private editorChanges = 0;

  encode(state: ReplayFrameState, editorChanged: boolean, checkpoint = false): ReplayStreamFrame {
    assertPixelBuffer(state.pixels);
    const { width, height } = state.pixels;
    const pixelsKeyframe =
      checkpoint ||
      !this.pixels ||
      width !== this.width ||
      height !== this.height ||
      this.rasterFrames >= PIXEL_CHECKPOINT_FRAMES;
    editorChanged ||= checkpoint || !this.editor || width !== this.width || height !== this.height;
    const editorKeyframe =
      editorChanged &&
      (checkpoint || !this.editor || this.editorChanges >= EDITOR_CHECKPOINT_CHANGES);
    const payload: Uint8Array[] = [];
    let editor: Patch | null = null;
    if (editorChanged) {
      // Playback uses the separate raster track, never this snapshot's old composite.
      const raw = serializeReplayFrame(state);
      editor = difference(raw, editorKeyframe ? null : this.editor, payload);
      this.editor = raw;
      this.editorChanges = editorKeyframe ? 0 : this.editorChanges + 1;
    }
    const current = new Uint8Array(
      state.pixels.data.buffer,
      state.pixels.data.byteOffset,
      state.pixels.data.byteLength,
    );
    const pixels = difference(current, pixelsKeyframe ? null : this.pixels, payload);
    if (!this.pixels || this.pixels.length !== current.length) this.pixels = current.slice();
    else
      for (const [offset, length] of pixels.ranges)
        this.pixels.set(current.subarray(offset, offset + length), offset);
    this.width = width;
    this.height = height;
    this.rasterFrames = pixelsKeyframe ? 0 : this.rasterFrames + 1;
    const metadata = strToU8(
      JSON.stringify({
        version: VERSION,
        width,
        height,
        editor,
        pixels,
        editorKeyframe,
        pixelsKeyframe,
      } satisfies Packet),
    );
    const length =
      HEADER_BYTES + metadata.length + payload.reduce((sum, bytes) => sum + bytes.length, 0);
    if (metadata.length > MAX_METADATA_BYTES || length > MAX_BYTES)
      throw new RangeError("Replay frame is too large.");
    const packet = new Uint8Array(length);
    new DataView(packet.buffer).setUint32(0, metadata.length, true);
    packet.set(metadata, HEADER_BYTES);
    let offset = HEADER_BYTES + metadata.length;
    for (const bytes of payload) {
      packet.set(bytes, offset);
      offset += bytes.length;
    }
    return {
      data: deflateSync(packet, { level: 1 }),
      editorChanged,
      editorKeyframe,
      pixelsKeyframe,
    };
  }
}

export class ReplayStreamDecoder {
  private editor: Uint8Array | null = null;
  private snapshot: ReplayFrameState["snapshot"] | null = null;
  private editorDirty = false;
  private pixels: Uint8Array | null = null;
  private width = 0;
  private height = 0;

  apply(frame: ReplayStreamFrame, tracks = { editor: true, pixels: true }): void {
    const invalid = () => {
      throw new TypeError("Invalid replay delta.");
    };
    const raw = inflateReplayBytes(frame.data);
    if (raw.length < HEADER_BYTES) invalid();
    const length = new DataView(raw.buffer).getUint32(0, true);
    if (length > MAX_METADATA_BYTES || HEADER_BYTES + length > raw.length) invalid();
    const packet: Packet = JSON.parse(strFromU8(raw.subarray(HEADER_BYTES, HEADER_BYTES + length)));
    if (
      packet.version !== VERSION ||
      packet.editorKeyframe !== frame.editorKeyframe ||
      packet.pixelsKeyframe !== frame.pixelsKeyframe ||
      !!packet.editor !== frame.editorChanged ||
      !Number.isSafeInteger(packet.width) ||
      !Number.isSafeInteger(packet.height) ||
      packet.width < 1 ||
      packet.height < 1 ||
      packet.width * packet.height * 4 > MAX_BYTES ||
      (packet.editorKeyframe && !packet.editor)
    )
      invalid();
    let offset = HEADER_BYTES + length;
    const apply = (
      patch: Patch,
      previous: Uint8Array | null,
      keyframe: boolean,
      enabled: boolean,
    ): Uint8Array | null => {
      if (
        !patch ||
        !Number.isSafeInteger(patch.length) ||
        patch.length < 1 ||
        patch.length > MAX_BYTES ||
        !Array.isArray(patch.ranges) ||
        patch.ranges.length > Math.ceil(MAX_BYTES / PATCH_BLOCK_BYTES)
      )
        invalid();
      if (enabled && !keyframe && !previous) invalid();
      let result: Uint8Array | null = null;
      if (enabled) {
        if (keyframe || previous?.length !== patch.length) {
          result = new Uint8Array(patch.length);
          if (!keyframe && previous) result.set(previous.subarray(0, patch.length));
        } else result = previous;
      }
      let end = 0;
      for (const range of patch.ranges) {
        if (!Array.isArray(range) || range.length !== 2) invalid();
        const [start, count] = range;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(count) ||
          start < end ||
          count < 1 ||
          start + count > patch.length ||
          offset + count > raw.length ||
          (keyframe && start !== end)
        )
          invalid();
        if (result) result.set(raw.subarray(offset, offset + count), start);
        offset += count;
        end = start + count;
      }
      if (keyframe && end !== patch.length) invalid();
      return result;
    };
    if (packet.editor) {
      const editor = apply(packet.editor, this.editor, packet.editorKeyframe, tracks.editor);
      if (tracks.editor) {
        this.editor = editor;
        this.editorDirty = true;
      }
    }
    const pixels = apply(packet.pixels, this.pixels, packet.pixelsKeyframe, tracks.pixels);
    if (packet.pixels.length !== packet.width * packet.height * 4 || offset !== raw.length)
      invalid();
    if (tracks.pixels) {
      if (!packet.pixelsKeyframe && (this.width !== packet.width || this.height !== packet.height))
        invalid();
      this.pixels = pixels;
      this.width = packet.width;
      this.height = packet.height;
    }
  }

  getState(): ReplayFrameState {
    if (this.editorDirty && this.editor) {
      this.snapshot = deserializeReplayFrame(this.editor).snapshot;
      this.editorDirty = false;
    }
    if (
      !this.snapshot?.document ||
      !this.pixels ||
      this.snapshot.document.width !== this.width ||
      this.snapshot.document.height !== this.height
    )
      throw new TypeError("Invalid replay track state.");
    return {
      snapshot: this.snapshot,
      pixels: {
        width: this.width,
        height: this.height,
        data: new Uint8ClampedArray(
          this.pixels.buffer,
          this.pixels.byteOffset,
          this.pixels.byteLength,
        ),
      },
    };
  }
}
