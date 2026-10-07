import { deflateSync, Inflate, strToU8, strFromU8 } from "fflate";

import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertDocumentMemoryBudget } from "$/document/memory-budget";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { EditorToolId } from "$/drawing/tool-settings";
import type { EditorSnapshot } from "$/editor/types";

export const REPLAY_MAX_BYTES = 256 * 1024 * 1024;
const MAX_FRAME_BYTES = 128 * 1024 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const HEADER_BYTES = 4;
const MAX_NODES = 100_000;
const INFLATE_CHUNK_BYTES = 1024;
const MAX_GRAPH_DEPTH = 100;
const FRAME_CODEC_VERSION = 1;
const MAX_BRUSH_SIZE = 64;
const MAX_BRUSH_ANGLE = 180;
const MAX_PALETTE_COLORS = 256;
const MAX_ZOOM = 64;

const arrayTypes = {
  Uint8ClampedArray,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
};

type Reference = { ref: number };
type Node =
  | { object: Record<string, unknown> }
  | { array: unknown[] }
  | {
      type: keyof typeof arrayTypes | "ArrayBuffer";
      offset: number;
      bytes: number;
    };

export interface ReplayFrameState {
  snapshot: EditorSnapshot;
  pixels: PixelBuffer;
}

/** Capture immediately: published editor snapshots can still borrow live pixels.
 * Store shared arrays once within a frame, then compress the detached packet. */
export function serializeReplayFrame(state: ReplayFrameState): Uint8Array {
  const nodes: Node[] = [];
  const seen = new Map<object, number>();
  const buffers: Uint8Array[] = [];
  let byteLength = 0;
  const visit = (value: unknown, depth = 0): unknown => {
    if (depth > MAX_GRAPH_DEPTH) throw new RangeError("Replay frame is too complex.");
    if (value === undefined) return null;
    if (value === null || typeof value !== "object") return value;
    const old = seen.get(value);
    if (old !== undefined) return { ref: old };
    if (nodes.length >= MAX_NODES) throw new RangeError("Replay frame is too complex.");
    const ref = nodes.length;
    seen.set(value, ref);
    nodes.push({ object: {} });
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const type = value instanceof ArrayBuffer ? "ArrayBuffer" : value.constructor.name;
      if (type !== "ArrayBuffer" && !Object.prototype.hasOwnProperty.call(arrayTypes, type))
        throw new TypeError("Unsupported replay buffer.");
      nodes[ref] = {
        type: type as keyof typeof arrayTypes | "ArrayBuffer",
        offset: byteLength,
        bytes: bytes.length,
      };
      buffers.push(bytes);
      byteLength += bytes.length;
      if (byteLength > MAX_FRAME_BYTES) throw new RangeError("Replay frame is too large.");
    } else if (Array.isArray(value)) {
      nodes[ref] = { array: value.map((item) => visit(item, depth + 1)) };
    } else {
      const object: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) object[key] = visit(item, depth + 1);
      }
      nodes[ref] = { object };
    }
    return { ref } satisfies Reference;
  };
  const root = visit(state);
  const metadata = strToU8(JSON.stringify({ version: FRAME_CODEC_VERSION, root, nodes }));
  if (
    metadata.length > MAX_METADATA_BYTES ||
    metadata.length + byteLength + HEADER_BYTES > MAX_FRAME_BYTES
  )
    throw new RangeError("Replay frame is too large.");
  const packet = new Uint8Array(HEADER_BYTES + metadata.length + byteLength);
  new DataView(packet.buffer).setUint32(0, metadata.length, true);
  packet.set(metadata, HEADER_BYTES);
  let offset = HEADER_BYTES + metadata.length;
  for (const bytes of buffers) {
    packet.set(bytes, offset);
    offset += bytes.length;
  }
  return packet;
}

export function encodeReplayFrame(state: ReplayFrameState): Uint8Array {
  return deflateSync(serializeReplayFrame(state), { level: 1 });
}

export function inflateReplayBytes(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let size = 0;
  const stream = new Inflate((chunk) => {
    size += chunk.length;
    if (size > MAX_FRAME_BYTES) throw new RangeError("Replay frame is too large.");
    parts.push(chunk);
  });
  for (let offset = 0; offset < bytes.length; offset += INFLATE_CHUNK_BYTES)
    stream.push(
      bytes.subarray(offset, offset + INFLATE_CHUNK_BYTES),
      offset + INFLATE_CHUNK_BYTES >= bytes.length,
    );
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function decodeReplayFrame(bytes: Uint8Array): ReplayFrameState {
  if (!bytes.length || bytes.length > REPLAY_MAX_BYTES)
    throw new TypeError("Invalid replay frame.");
  return deserializeReplayFrame(inflateReplayBytes(bytes));
}

export function deserializeReplayFrame(packet: Uint8Array): ReplayFrameState {
  if (packet.length > MAX_FRAME_BYTES) throw new RangeError("Replay frame is too large.");
  if (packet.length < HEADER_BYTES) throw new TypeError("Invalid replay frame.");
  const metadataLength = new DataView(packet.buffer).getUint32(0, true);
  if (metadataLength > MAX_METADATA_BYTES || metadataLength + HEADER_BYTES > packet.length)
    throw new TypeError("Invalid replay metadata.");
  const metadata = JSON.parse(
    strFromU8(packet.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength)),
  );
  if (
    metadata.version !== FRAME_CODEC_VERSION ||
    !Array.isArray(metadata.nodes) ||
    metadata.nodes.length > MAX_NODES
  )
    throw new TypeError("Invalid replay metadata.");
  const nodes: Node[] = metadata.nodes;
  const binary = packet.subarray(HEADER_BYTES + metadataLength);
  const objects: unknown[] = [];
  objects.length = nodes.length;
  const visiting = new Set<number>();
  let decodedBufferBytes = 0;
  const read = (value: unknown, depth = 0): unknown => {
    if (depth > MAX_GRAPH_DEPTH) throw new TypeError("Invalid replay graph.");
    if (value === null || typeof value !== "object") return value;
    const ref = (value as Reference).ref;
    if (!Number.isInteger(ref) || ref < 0 || ref >= nodes.length || visiting.has(ref))
      throw new TypeError("Invalid replay reference.");
    if (objects[ref] !== undefined) return objects[ref];
    visiting.add(ref);
    const node = nodes[ref];
    let result: unknown;
    if ("array" in node && Array.isArray(node.array)) {
      result = node.array.map((item) => read(item, depth + 1));
    } else if ("type" in node) {
      if (
        !Number.isInteger(node.offset) ||
        !Number.isInteger(node.bytes) ||
        node.offset < 0 ||
        node.bytes < 0 ||
        node.offset + node.bytes > binary.length
      )
        throw new TypeError("Invalid replay buffer.");
      decodedBufferBytes += node.bytes;
      if (decodedBufferBytes > MAX_FRAME_BYTES) throw new RangeError("Replay frame is too large.");
      const buffer = binary.slice(node.offset, node.offset + node.bytes).buffer;
      if (node.type === "ArrayBuffer") result = buffer;
      else {
        if (!Object.prototype.hasOwnProperty.call(arrayTypes, node.type))
          throw new TypeError("Invalid replay buffer type.");
        const Constructor = arrayTypes[node.type];
        if (node.bytes % Constructor.BYTES_PER_ELEMENT)
          throw new TypeError("Invalid replay buffer size.");
        result = new Constructor(buffer);
      }
    } else if ("object" in node && node.object && typeof node.object === "object") {
      const object: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(node.object)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype")
          throw new TypeError("Invalid replay property.");
        object[key] = read(item, depth + 1);
      }
      result = object;
    } else throw new TypeError("Invalid replay node.");
    visiting.delete(ref);
    objects[ref] = result;
    return result;
  };
  const state = read(metadata.root) as ReplayFrameState;
  const snapshot = state?.snapshot;
  if (
    !snapshot?.document?.timeline ||
    !snapshot.settings?.brush ||
    !snapshot.view?.pan ||
    !Array.isArray(snapshot.palette)
  )
    throw new TypeError("Invalid replay editor state.");
  const color = (value: unknown) =>
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= UINT8_MAX);
  const settings = snapshot.settings;
  if (
    !Object.values(EditorToolId).includes(settings.tool as EditorToolId) ||
    !settings.dynamics ||
    !color(settings.foreground) ||
    !color(settings.background) ||
    !["circle", "square", "line", "image"].includes(settings.brush.shape) ||
    !Number.isInteger(settings.brush.size) ||
    settings.brush.size < 1 ||
    settings.brush.size > MAX_BRUSH_SIZE ||
    !Number.isFinite(settings.brush.angle) ||
    Math.abs(settings.brush.angle) > MAX_BRUSH_ANGLE ||
    !Number.isFinite(snapshot.view.zoom) ||
    snapshot.view.zoom <= 0 ||
    snapshot.view.zoom > MAX_ZOOM ||
    !Number.isFinite(snapshot.view.pan.x) ||
    !Number.isFinite(snapshot.view.pan.y) ||
    snapshot.palette.length > MAX_PALETTE_COLORS ||
    !snapshot.palette.every(color) ||
    typeof snapshot.status !== "string"
  )
    throw new TypeError("Invalid replay editor settings.");
  if (settings.brush.image) assertPixelBuffer(settings.brush.image);
  const mask = snapshot.document.selection;
  if (
    mask &&
    (!(mask.data instanceof Uint8Array) ||
      !Number.isSafeInteger(mask.width) ||
      !Number.isSafeInteger(mask.height) ||
      mask.width < 0 ||
      mask.height < 0 ||
      mask.data.length !== mask.width * mask.height ||
      !Number.isFinite(mask.x) ||
      !Number.isFinite(mask.y))
  )
    throw new TypeError("Invalid replay selection.");
  assertPixelBuffer(state.pixels);
  assertPixelBuffer(snapshot.document.layer.pixels);
  const timeline = snapshot.document.timeline;
  if (
    !Number.isInteger(timeline.activeFrame) ||
    timeline.activeFrame < 0 ||
    timeline.activeFrame >= timeline.frames.length ||
    !Number.isInteger(timeline.activeLayer) ||
    timeline.activeLayer < 0 ||
    timeline.activeLayer >= timeline.layers.length
  )
    throw new TypeError("Invalid replay timeline selection.");
  assertDocumentMemoryBudget(snapshot.document);
  if (
    state.pixels.width !== snapshot.document.width ||
    state.pixels.height !== snapshot.document.height
  )
    throw new TypeError("Invalid replay canvas size.");
  return state;
}
