import { deflateSync, Inflate } from "fflate";

import type { ReplayCursorAppearance } from "$/managers/ports/replay";
import { validReplayCursor } from "$/managers/replay/replay-cursor";
import {
  REPLAY_MAX_BYTES,
  EditorPointerPhase,
  EditorToolId,
  type ReplayStreamFrame,
  type ReplayPointerSample,
} from "@xprite/editor-core";

export enum ReplayInteractionKind {
  Click = "click",
  Shortcut = "shortcut",
  Change = "change",
}

interface ReplayTarget {
  id?: string;
  role: string;
  label: string;
}
export interface ReplayInteraction {
  at: number;
  kind: ReplayInteractionKind;
  target: ReplayTarget | null;
  keys?: string;
}
interface ReplayPanelControl {
  role: string;
  label: string;
  value?: string;
  checked?: boolean;
}
interface ReplayPanel {
  role: string;
  title: string;
  controls: ReplayPanelControl[];
}
const SIGNATURE = new TextEncoder().encode("XPRPLAY3");
const LENGTH_BYTES = 4;
const HEADER_BYTES = SIGNATURE.length + LENGTH_BYTES;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_FRAMES = 1_000_000;
const MAX_INTERACTIONS = 500_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const FORMAT_VERSION = 3;
const MAX_POINTER_SAMPLES = 500_000;
const MAX_POINTER_COORDINATE = 1_000_000;
const MAX_BRUSH_SIZE = 64;
const MAX_LABEL_LENGTH = 512;

export interface ReplayFrame extends ReplayStreamFrame {
  at: number;
  timelineVisible: boolean;
  panels: ReplayPanel[];
}
export interface ReplayRecording {
  name: string;
  duration: number;
  frames: ReplayFrame[];
  interactions: ReplayInteraction[];
  pointers: RecordedReplayPointer[];
}

export interface RecordedReplayPointer extends ReplayPointerSample {
  cursor?: ReplayCursorAppearance | null;
}

export function replayFrameAt(frames: readonly ReplayFrame[], at: number): number {
  let low = 0,
    high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].at <= at) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function encodeReplayRecording(recording: ReplayRecording): Uint8Array {
  const rawMetadata = new TextEncoder().encode(
    JSON.stringify({
      version: FORMAT_VERSION,
      name: recording.name,
      duration: recording.duration,
      interactions: recording.interactions,
      pointers: recording.pointers,
      frames: recording.frames.map(({ data, ...frame }) => ({ ...frame, bytes: data.length })),
    }),
  );
  if (rawMetadata.length > MAX_METADATA_RAW_BYTES)
    throw new RangeError("The replay is too large to export.");
  const metadata = deflateSync(rawMetadata, { level: 1 });
  const length =
    HEADER_BYTES +
    metadata.length +
    recording.frames.reduce((sum, frame) => sum + frame.data.length, 0);
  if (metadata.length > MAX_METADATA_BYTES || length > REPLAY_MAX_BYTES)
    throw new RangeError("The replay is too large to export.");
  const result = new Uint8Array(length);
  result.set(SIGNATURE);
  new DataView(result.buffer).setUint32(SIGNATURE.length, metadata.length, true);
  result.set(metadata, HEADER_BYTES);
  let offset = HEADER_BYTES + metadata.length;
  for (const frame of recording.frames) {
    result.set(frame.data, offset);
    offset += frame.data.length;
  }
  return result;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_LABEL_LENGTH;
}
function validTime(at: unknown, duration: number): at is number {
  return typeof at === "number" && Number.isFinite(at) && at >= 0 && at <= duration;
}
function validPanels(value: unknown): value is ReplayPanel[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (panel) =>
        panel &&
        validText(panel.role) &&
        validText(panel.title) &&
        Array.isArray(panel.controls) &&
        panel.controls.length <= 128 &&
        panel.controls.every(
          (control: Record<string, unknown>) =>
            control &&
            validText(control.role) &&
            validText(control.label) &&
            (control.value === undefined || validText(control.value)) &&
            (control.checked === undefined || typeof control.checked === "boolean"),
        ),
    )
  );
}

const MAX_METADATA_RAW_BYTES = 128 * 1024 * 1024;
const INFLATE_CHUNK_BYTES = 1024;

function readMetadata(bytes: Uint8Array): string {
  const parts: Uint8Array[] = [];
  let size = 0;
  const stream = new Inflate((part) => {
    size += part.length;
    if (size > MAX_METADATA_RAW_BYTES) throw new TypeError("Invalid replay metadata.");
    parts.push(part);
  });
  for (let offset = 0; offset < bytes.length; offset += INFLATE_CHUNK_BYTES)
    stream.push(
      bytes.subarray(offset, offset + INFLATE_CHUNK_BYTES),
      offset + INFLATE_CHUNK_BYTES >= bytes.length,
    );
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}

export function decodeReplayRecording(bytes: Uint8Array, segment = false): ReplayRecording {
  const invalid = () => {
    throw new TypeError("Invalid replay file.");
  };
  if (
    bytes.length < HEADER_BYTES ||
    bytes.length > REPLAY_MAX_BYTES ||
    !SIGNATURE.every((value, index) => bytes[index] === value)
  )
    invalid();
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    SIGNATURE.length,
    true,
  );
  if (metadataLength > MAX_METADATA_BYTES || metadataLength + HEADER_BYTES > bytes.length)
    invalid();
  const metadata = JSON.parse(
    readMetadata(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength)),
  );
  if (
    metadata.version !== FORMAT_VERSION ||
    !validText(metadata.name) ||
    !Number.isFinite(metadata.duration) ||
    metadata.duration < 0 ||
    metadata.duration > MAX_DURATION_MS ||
    !Array.isArray(metadata.frames) ||
    (!segment && !metadata.frames.length) ||
    metadata.frames.length > MAX_FRAMES ||
    !Array.isArray(metadata.interactions) ||
    metadata.interactions.length > MAX_INTERACTIONS ||
    !Array.isArray(metadata.pointers) ||
    metadata.pointers.length > MAX_POINTER_SAMPLES
  )
    invalid();
  let previous = -1;
  let offset = HEADER_BYTES + metadataLength;
  const frames: ReplayFrame[] = metadata.frames.map((frame: Record<string, unknown>) => {
    if (
      !validTime(frame.at, metadata.duration) ||
      frame.at < previous ||
      !Number.isSafeInteger(frame.bytes) ||
      (frame.bytes as number) <= 0 ||
      offset + (frame.bytes as number) > bytes.length ||
      typeof frame.editorChanged !== "boolean" ||
      typeof frame.editorKeyframe !== "boolean" ||
      typeof frame.pixelsKeyframe !== "boolean" ||
      (frame.editorKeyframe && !frame.editorChanged) ||
      typeof frame.timelineVisible !== "boolean" ||
      !validPanels(frame.panels)
    )
      invalid();
    const at = frame.at as number;
    const length = frame.bytes as number;
    const data = bytes.slice(offset, offset + length);
    offset += length;
    previous = at;
    return {
      at,
      data,
      editorChanged: frame.editorChanged as boolean,
      editorKeyframe: frame.editorKeyframe as boolean,
      pixelsKeyframe: frame.pixelsKeyframe as boolean,
      timelineVisible: frame.timelineVisible as boolean,
      panels: frame.panels as ReplayPanel[],
    };
  });
  if (
    offset !== bytes.length ||
    (!segment && (frames[0].at !== 0 || !frames[0].editorKeyframe || !frames[0].pixelsKeyframe))
  )
    invalid();
  previous = -1;
  const interactions: ReplayInteraction[] = metadata.interactions.map(
    (event: ReplayInteraction) => {
      if (
        !event ||
        !validTime(event.at, metadata.duration) ||
        event.at < previous ||
        ![
          ReplayInteractionKind.Click,
          ReplayInteractionKind.Shortcut,
          ReplayInteractionKind.Change,
        ].includes(event.kind) ||
        (event.keys !== undefined && !validText(event.keys)) ||
        (event.target !== null &&
          (!event.target ||
            !validText(event.target.role) ||
            !validText(event.target.label) ||
            (event.target.id !== undefined && !validText(event.target.id))))
      )
        invalid();
      previous = event.at;
      return { at: event.at, kind: event.kind, target: event.target, keys: event.keys };
    },
  );
  previous = -1;
  let stroke = 0;
  const pointers: RecordedReplayPointer[] = metadata.pointers.map(
    (sample: RecordedReplayPointer) => {
      if (
        !sample ||
        !validTime(sample.at, metadata.duration) ||
        sample.at < previous ||
        !Number.isSafeInteger(sample.stroke) ||
        sample.stroke < stroke ||
        !Object.values(EditorPointerPhase).includes(sample.phase) ||
        typeof sample.pressed !== "boolean" ||
        !Object.values(EditorToolId).includes(sample.tool as EditorToolId) ||
        !Number.isFinite(sample.size) ||
        sample.size < 1 ||
        sample.size > MAX_BRUSH_SIZE ||
        !Number.isFinite(sample.pressure) ||
        sample.pressure < 0 ||
        sample.pressure > 1 ||
        (sample.cursor !== undefined && !validReplayCursor(sample.cursor)) ||
        (sample.point !== null &&
          (!sample.point ||
            !Number.isFinite(sample.point.x) ||
            !Number.isFinite(sample.point.y) ||
            Math.abs(sample.point.x) > MAX_POINTER_COORDINATE ||
            Math.abs(sample.point.y) > MAX_POINTER_COORDINATE))
      )
        invalid();
      previous = sample.at;
      stroke = sample.stroke;
      return sample;
    },
  );
  return { name: metadata.name, duration: metadata.duration, frames, interactions, pointers };
}
