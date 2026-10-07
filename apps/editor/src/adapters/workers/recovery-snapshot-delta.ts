import type { EditorPersistenceSnapshot } from "@xprite/editor-core";

const MAX_RETAINED_BYTES = 128 * 1024 * 1024;
const MAX_RETAINED_BUFFERS = 512;

export interface RecoverySnapshotDelta {
  snapshot: EditorPersistenceSnapshot;
  references: Map<object, number>;
  additions: Map<number, ArrayBufferView | ArrayBuffer>;
  retained: number[];
  reset: boolean;
}

type Binary = ArrayBufferView | ArrayBuffer;

function retainedSize(value: Binary): number {
  // Structured cloning a view retains its complete backing buffer, even when the
  // visible slice is small. Conservatively count each view's full allocation.
  return value instanceof ArrayBuffer ? value.byteLength : value.buffer.byteLength;
}

/** Copy metadata containers while keeping binary ownership at the message boundary.
 * Shared pixel identities and metadata graphs remain shared within each snapshot. */
function mapGraph(value: unknown, binary: (value: object) => unknown): unknown {
  const seen = new WeakMap<object, unknown>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const replacement = binary(value);
    if (replacement !== undefined) {
      seen.set(value, replacement);
      return replacement;
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Date)
      return value;
    const copy: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(copy, key, {
        value: visit(child),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  };
  return visit(value);
}

/** Used only for core-branded immutable committed snapshots. Editable, undo,
 * committed and retry buffers are never detached. The worker owns its clones. */
export class RecoverySnapshotDeltaSender {
  private readonly buffers = new Map<Binary, number>();
  private bytes = 0;
  private nextId = 1;
  private reset = true;

  constructor(
    private readonly maxBytes = MAX_RETAINED_BYTES,
    private readonly maxBuffers = MAX_RETAINED_BUFFERS,
  ) {}

  encode(snapshot: EditorPersistenceSnapshot): RecoverySnapshotDelta {
    const references = new Map<object, number>();
    const additions = new Map<number, Binary>();
    const metadata = mapGraph(snapshot, (value) => {
      if (!(value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return undefined;
      const buffer = value as Binary;
      // A cel bigger than the budget stays inline; it never becomes retained state.
      if (retainedSize(buffer) > this.maxBytes) return buffer;
      let id = this.buffers.get(buffer);
      if (id !== undefined) this.buffers.delete(buffer);
      else {
        id = this.nextId++;
        this.bytes += retainedSize(buffer);
        additions.set(id, buffer);
      }
      this.buffers.set(buffer, id);
      const reference = {};
      references.set(reference, id);
      return reference;
    }) as EditorPersistenceSnapshot;
    while (this.bytes > this.maxBytes || this.buffers.size > this.maxBuffers) {
      const oldest = this.buffers.keys().next().value;
      if (!oldest) break;
      this.bytes -= retainedSize(oldest);
      this.buffers.delete(oldest);
    }
    const result = {
      snapshot: metadata,
      references,
      additions,
      retained: [...this.buffers.values()],
      reset: this.reset,
    };
    this.reset = false;
    return result;
  }

  clear(): void {
    this.buffers.clear();
    this.bytes = 0;
    this.reset = true;
  }
}

export class RecoverySnapshotDeltaReceiver {
  private readonly buffers = new Map<number, Binary>();

  constructor(
    private readonly maxBytes = MAX_RETAINED_BYTES,
    private readonly maxBuffers = MAX_RETAINED_BUFFERS,
  ) {}

  decode(delta: RecoverySnapshotDelta): EditorPersistenceSnapshot {
    if (delta.reset) this.buffers.clear();
    for (const [id, buffer] of delta.additions) {
      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        !(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer)) ||
        this.buffers.has(id)
      )
        throw new Error("Invalid recovery snapshot buffer");
      this.buffers.set(id, buffer);
    }
    const snapshot = mapGraph(delta.snapshot, (reference) => {
      const id = delta.references.get(reference);
      if (id === undefined) return undefined;
      const buffer = this.buffers.get(id);
      if (!buffer) throw new Error("Missing recovery snapshot buffer");
      return buffer;
    }) as EditorPersistenceSnapshot;
    // Prune only after restoring: an over-budget snapshot may reference buffers
    // evicted by this same request. In-flight encodes retain their own references.
    const retained = new Set(delta.retained);
    let bytes = 0;
    for (const [id, buffer] of this.buffers) {
      if (!retained.has(id)) this.buffers.delete(id);
      else bytes += retainedSize(buffer);
    }
    if (bytes > this.maxBytes || this.buffers.size > this.maxBuffers) {
      this.buffers.clear();
      throw new Error("Recovery snapshot buffer cache exceeds its limit");
    }
    return snapshot;
  }
}
