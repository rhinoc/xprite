import type { PixelBuffer, Rect, Rgba } from "$/base/primitives";
import { syncTimeline } from "$/document/document";
import { makeEditorImageWritable } from "$/document/pixel-ownership";
import { encodedPixels } from "$/document/pixel-storage";
import type { EditorDocument } from "$/document/types";
import { type TimelineFrame } from "$/timeline/timeline";
const TILE = 32;
type State = Pick<
  EditorDocument,
  "width" | "height" | "layer" | "selection" | "hiddenSelection" | "palette" | "timeline"
>;
interface Patch {
  image: PixelBuffer;
  x: number;
  y: number;
  width: number;
  height: number;
  buffer: Uint8ClampedArray;
}
export enum HistoryPersistenceEffect {
  NoDocumentContent = "no-document-content",
}

/** A transaction groups reversible commands, as in LibreSprite's GPLv2
 * app/cmd_transaction.h. */
export interface HistoryCommand {
  /** Unclassified custom commands invalidate all persistence buffer reuse. */
  readonly persistenceEffect?: HistoryPersistenceEffect;
  undo(doc: EditorDocument): void;
  redo(doc: EditorDocument): void;
  memoryBytes?(): number;
}
export interface UndoOptions {
  maxBytes: number;
  allowNonlinearHistory: boolean;
  gotoModified: boolean;
  showTooltip: boolean;
}
interface HistoryStateSnapshot {
  readonly index: number;
  readonly label: string;
  readonly current: boolean;
  readonly saved: boolean;
}
export interface HistorySnapshot extends UndoOptions {
  readonly states: readonly HistoryStateSnapshot[];
  readonly currentIndex: number;
  readonly initialSaved: boolean;
  readonly savedStateLost: boolean;
}
type Structure = Pick<State, "width" | "height" | "layer" | "timeline">;
class StructureCommand implements HistoryCommand {
  constructor(
    readonly before: Structure,
    readonly after: Structure,
  ) {}
  undo(doc: EditorDocument) {
    restoreStructure(doc, this.before);
  }
  redo(doc: EditorDocument) {
    restoreStructure(doc, this.after);
  }
}
class MaskCommand implements HistoryCommand {
  constructor(
    readonly before: Pick<State, "selection" | "hiddenSelection">,
    readonly after: Pick<State, "selection" | "hiddenSelection">,
  ) {}
  undo(doc: EditorDocument) {
    doc.selection = this.before.selection;
    doc.hiddenSelection = this.before.hiddenSelection;
  }
  redo(doc: EditorDocument) {
    doc.selection = this.after.selection;
    doc.hiddenSelection = this.after.hiddenSelection;
  }
}
class PaletteCommand implements HistoryCommand {
  constructor(
    readonly before: State["palette"],
    readonly after: State["palette"],
  ) {}
  undo(doc: EditorDocument) {
    doc.palette = this.before;
  }
  redo(doc: EditorDocument) {
    doc.palette = this.after;
  }
}
/** CopyRegion-style exchange: one saved buffer alternates with the live pixels. */
class PatchCommand implements HistoryCommand {
  constructor(readonly patches: readonly Patch[]) {}
  private swap() {
    for (const patch of this.patches) {
      const live = read(patch.image, patch);
      write(patch, patch.buffer);
      patch.buffer = live;
    }
  }
  undo() {
    this.swap();
  }
  redo() {
    this.swap();
  }
}
export class CommandTransaction implements HistoryCommand {
  constructor(
    readonly label: string,
    readonly commands: readonly HistoryCommand[],
  ) {}
  undo(doc: EditorDocument) {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo(doc);
  }
  redo(doc: EditorDocument) {
    for (const command of this.commands) command.redo(doc);
  }
}
interface Entry {
  command: CommandTransaction;
  parent: Entry | null;
  label: string;
  beforeId: number;
  afterId: number;
  beforeRasterId: number;
  afterRasterId: number;
}
const state = (doc: EditorDocument): State => {
  syncTimeline(doc);
  return {
    width: doc.width,
    height: doc.height,
    layer: { ...doc.layer },
    selection: doc.selection,
    hiddenSelection: doc.hiddenSelection,
    palette: doc.palette,
    timeline: doc.timeline,
  };
};
/** Aseprite visibility/editability/continuous flags are view choices, outside
 * command undo history. Preserve current flags for surviving layer identities. */
function restoreState(doc: EditorDocument, restored: State) {
  restoreStructure(doc, restored);
  doc.selection = restored.selection;
  doc.hiddenSelection = restored.hiddenSelection;
  doc.palette = restored.palette;
}
function restoreStructure(doc: EditorDocument, restored: Structure) {
  const current = new Map(doc.timeline?.layers.map((layer) => [layer.id, layer]) ?? []);
  const timeline = restored.timeline
    ? {
        ...restored.timeline,
        layers: restored.timeline.layers.map((layer) => {
          const live = current.get(layer.id);
          return live
            ? {
                ...layer,
                visible: live.visible,
                locked: live.locked,
                flags: (layer.flags & ~51) | (live.flags & 51),
              }
            : layer;
        }),
      }
    : undefined;
  const active = timeline?.layers[timeline.activeLayer];
  Object.assign(doc, {
    width: restored.width,
    height: restored.height,
    timeline,
    layer: {
      ...restored.layer,
      ...(active ? { visible: active.visible, locked: active.locked } : {}),
    },
  });
}
function read(image: PixelBuffer, rect: Rect) {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++)
    data.set(
      image.data.subarray(
        ((rect.y + y) * image.width + rect.x) * 4,
        ((rect.y + y) * image.width + rect.x + rect.width) * 4,
      ),
      y * rect.width * 4,
    );
  return data;
}
function write(p: Patch, data: Uint8ClampedArray) {
  makeEditorImageWritable(p.image);
  for (let y = 0; y < p.height; y++)
    p.image.data.set(
      data.subarray(y * p.width * 4, (y + 1) * p.width * 4),
      ((p.y + y) * p.image.width + p.x) * 4,
    );
}
/** Frame palette metadata alone does not change an RGBA/grayscale raster.
 * Indexed palette edits replace projections/source sample metadata and do. */
function sameRasterTimeline(a: State["timeline"], b: State["timeline"]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys)
    if (
      key !== "frames" &&
      key !== "slices" &&
      a[key as keyof typeof a] !== b[key as keyof typeof b]
    )
      return false;
  if (a.frames.length !== b.frames.length) return false;
  return a.frames.every((f, i) => {
    const g = b.frames[i];
    if (f === g) return true;
    const fields = new Set([...Object.keys(f), ...Object.keys(g)]);
    for (const key of fields)
      if (
        key !== "palette" &&
        key !== "cels" &&
        f[key as keyof TimelineFrame] !== g[key as keyof TimelineFrame]
      )
        return false;
    return f.cels.length === g.cels.length && f.cels.every((c, j) => c === g.cels[j]);
  });
}
/** Copy-on-write tile history: pointer movements capture each touched tile only once. */
export class EditorHistory {
  // Default is no limit; a positive limit is in bytes.
  constructor(private maxBytes = 0) {}
  private past: Entry[] = [];
  private current: Entry | null = null;
  private allowNonlinear = false;
  private gotoModified = true;
  private showTooltip = true;
  private active: {
    before: State;
    patches: Map<number, Patch>;
    image: PixelBuffer;
    label: string;
  } | null = null;
  private id = 0;
  private nextId = 0;
  private savedId = 0;
  private savedState: Entry | null = null;
  private savedStateLost = false;
  private rasterId = 0;
  private baseId = 0;
  private baseRasterId = 0;
  private historySnapshot: HistorySnapshot | null = null;
  private pixelBufferVersions = new WeakMap<Uint8ClampedArray, number>();
  private persistenceEpoch = 0;
  /** Monotonic invalidation, unlike undoable raster/content identities. */
  get persistenceBufferEpoch() {
    return this.persistenceEpoch;
  }
  getPixelBufferVersion(data: Uint8ClampedArray): number {
    return this.pixelBufferVersions.get(data) ?? 0;
  }
  private recordPersistenceMutation(command: HistoryCommand): void {
    if (command instanceof CommandTransaction) {
      for (const child of command.commands) this.recordPersistenceMutation(child);
    } else if (command instanceof PatchCommand) {
      const buffers = new Set(command.patches.map((patch) => patch.image.data));
      for (const data of buffers)
        this.pixelBufferVersions.set(data, this.getPixelBufferVersion(data) + 1);
      // Structure/Palette commands restore immutable containers; existing RGBA
      // arrays can only be edited through captured patches. Unclassified custom
      // commands provide no such guarantee, so invalidate the entire cache.
    } else if (
      !(command instanceof StructureCommand) &&
      !(command instanceof MaskCommand) &&
      !(command instanceof PaletteCommand) &&
      command.persistenceEffect !== HistoryPersistenceEffect.NoDocumentContent
    ) {
      this.persistenceEpoch++;
    }
  }
  /** RGBA raster identity excludes palette-only and selection-only changes. */
  get rasterIdentity() {
    return this.rasterId;
  }
  /** Selection-only entries retain this document-content identity. */
  get contentIdentity() {
    return this.id;
  }
  get canUndo() {
    return this.current !== null;
  }
  get canRedo() {
    return this.current !== (this.past[this.past.length - 1] ?? null);
  }
  get dirty() {
    if (this.savedStateLost) return true;
    // DocUndo::isInSavedStateOrSimilar walks chronological states, allowing
    // selection-only commands on either side of the saved state.
    let index = this.current ? this.past.indexOf(this.current) : -1;
    for (; index >= 0; index--) {
      const entry = this.past[index];
      if (entry === this.savedState) return false;
      if (entry.afterId !== entry.beforeId) break;
    }
    if (index < 0 && this.savedState === null) return false;
    for (
      let i = (this.current ? this.past.indexOf(this.current) : -1) + 1;
      i < this.past.length;
      i++
    ) {
      const entry = this.past[i];
      if (entry.afterId !== entry.beforeId) return true;
      if (entry === this.savedState) return false;
    }
    return true;
  }
  get transactionActive() {
    return this.active !== null;
  }
  reset(dirty = false) {
    this.persistenceEpoch++;
    this.pixelBufferVersions = new WeakMap();
    this.past = [];
    this.current = null;
    this.active = null;
    this.id = ++this.nextId;
    this.savedId = dirty ? -1 : this.id;
    this.savedState = null;
    this.savedStateLost = dirty;
    this.rasterId = this.id;
    this.baseId = this.id;
    this.baseRasterId = this.id;
    this.invalidateHistorySnapshot();
  }
  markSaved() {
    this.savedId = this.id;
    this.savedState = this.current;
    this.savedStateLost = false;
    this.invalidateHistorySnapshot();
  }
  setOptions(options: Partial<UndoOptions>) {
    if (options.maxBytes !== undefined) {
      if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0)
        throw new RangeError("Invalid undo memory limit");
      this.maxBytes = options.maxBytes;
      this.enforceLimit();
    }
    if (options.allowNonlinearHistory !== undefined)
      this.allowNonlinear = options.allowNonlinearHistory;
    if (options.gotoModified !== undefined) this.gotoModified = options.gotoModified;
    if (options.showTooltip !== undefined) this.showTooltip = options.showTooltip;
    this.invalidateHistorySnapshot();
  }
  getOptions(): UndoOptions {
    return {
      maxBytes: this.maxBytes,
      allowNonlinearHistory: this.allowNonlinear,
      gotoModified: this.gotoModified,
      showTooltip: this.showTooltip,
    };
  }
  get nextUndoLabel() {
    return this.current?.label ?? "";
  }
  get nextRedoLabel() {
    return this.past[this.current ? this.past.indexOf(this.current) + 1 : 0]?.label ?? "";
  }
  getStates(): readonly HistoryStateSnapshot[] {
    return this.getHistorySnapshot().states;
  }
  getHistorySnapshot(): HistorySnapshot {
    if (this.historySnapshot) return this.historySnapshot;
    this.historySnapshot = {
      states: this.past.map((entry, index) => ({
        index,
        label: entry.label,
        current: entry === this.current,
        saved: entry === this.savedState,
      })),
      currentIndex: this.current ? this.past.indexOf(this.current) : -1,
      initialSaved: !this.savedStateLost && this.savedState === null,
      savedStateLost: this.savedStateLost,
      ...this.getOptions(),
    };
    return this.historySnapshot;
  }
  private invalidateHistorySnapshot() {
    this.historySnapshot = null;
  }
  begin(doc: EditorDocument, label = "Transaction") {
    if (this.active) throw new Error("Nested editor transaction");
    makeEditorImageWritable(doc.layer.pixels);
    const before = state(doc);
    // Tilemap projections are working copies. Shared Tilesets and tile grids
    // are replaced immutably when the transaction commits.
    if (doc.timeline?.layers[doc.timeline.activeLayer].kind === "tilemap")
      doc.layer = {
        ...doc.layer,
        pixels: { ...doc.layer.pixels, data: doc.layer.pixels.data.slice() },
      };
    this.active = {
      before,
      patches: new Map(),
      image: doc.layer.pixels,
      label,
    };
  }
  capture(image: PixelBuffer, rect: Rect) {
    const a = this.active;
    if (!a || image !== a.image) return;
    const left = Math.max(0, Math.floor(rect.x / TILE) * TILE),
      top = Math.max(0, Math.floor(rect.y / TILE) * TILE),
      right = Math.min(image.width, Math.ceil(rect.x + rect.width)),
      bottom = Math.min(image.height, Math.ceil(rect.y + rect.height));
    for (let y = top; y < bottom; y += TILE)
      for (let x = left; x < right; x += TILE) {
        const key = y * image.width + x;
        if (a.patches.has(key)) continue;
        const r = {
          x,
          y,
          width: Math.min(TILE, image.width - x),
          height: Math.min(TILE, image.height - y),
        };
        a.patches.set(key, {
          ...r,
          image,
          buffer: read(image, r),
        });
      }
  }
  cancel(doc: EditorDocument) {
    if (!this.active) return;
    for (const p of this.active.patches.values()) write(p, p.buffer);
    restoreState(doc, this.active.before);
    this.active = null;
  }
  commit(
    doc: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    const a = this.active;
    if (!a) return false;
    this.active = null;
    const patches = [...a.patches.values()].filter((p) => {
      const after = read(p.image, p);
      return p.buffer.some((v, i) => v !== after[i]);
    });
    // A visible new mask supersedes any previously hidden mask.
    if (doc.selection) doc.hiddenSelection = null;
    const after = state(doc),
      before = a.before;
    // Aseprite SetMask snapshots the old mask only when it was visible.
    // Apply on commit, not begin, so cancelled gestures retain hidden state.
    if (replacesSelection && !before.selection) before.hiddenSelection = null;
    const modifiesRaster =
      patches.length > 0 ||
      before.width !== after.width ||
      before.height !== after.height ||
      !sameRasterTimeline(before.timeline, after.timeline) ||
      before.layer.pixels !== after.layer.pixels ||
      before.layer.x !== after.layer.x ||
      before.layer.y !== after.layer.y ||
      before.layer.visible !== after.layer.visible ||
      before.layer.locked !== after.layer.locked ||
      before.layer.name !== after.layer.name;
    const modifiesDocument =
      modifiesRaster || before.palette !== after.palette || before.timeline !== after.timeline;
    if (
      !modifiesDocument &&
      before.selection === after.selection &&
      before.hiddenSelection === after.hiddenSelection &&
      !extraCommands.length
    )
      return false;
    const structureChanged =
      before.width !== after.width ||
      before.height !== after.height ||
      before.timeline !== after.timeline ||
      before.layer.pixels !== after.layer.pixels ||
      before.layer.x !== after.layer.x ||
      before.layer.y !== after.layer.y ||
      before.layer.name !== after.layer.name ||
      before.layer.visible !== after.layer.visible ||
      before.layer.locked !== after.layer.locked ||
      before.layer.opacity !== after.layer.opacity ||
      before.layer.celOpacity !== after.layer.celOpacity ||
      before.layer.zIndex !== after.layer.zIndex;
    const commands: HistoryCommand[] = [];
    if (before.selection !== after.selection || before.hiddenSelection !== after.hiddenSelection)
      commands.push(
        new MaskCommand(
          { selection: before.selection, hiddenSelection: before.hiddenSelection },
          { selection: after.selection, hiddenSelection: after.hiddenSelection },
        ),
      );
    if (before.palette !== after.palette)
      commands.push(new PaletteCommand(before.palette, after.palette));
    if (structureChanged)
      commands.push(
        new StructureCommand(
          {
            width: before.width,
            height: before.height,
            layer: before.layer,
            timeline: before.timeline,
          },
          {
            width: after.width,
            height: after.height,
            layer: after.layer,
            timeline: after.timeline,
          },
        ),
      );
    commands.push(...extraCommands);
    if (patches.length) commands.push(new PatchCommand(patches));
    const entry = {
      command: new CommandTransaction(a.label, commands),
      parent: this.current,
      label: a.label,
      beforeId: this.id,
      // Selection tools / DeselectMask use DoesntModifyDocument upstream.
      // Keep their undo entry without advancing the saved content identity.
      afterId: modifiesDocument ? ++this.nextId : this.id,
      beforeRasterId: this.rasterId,
      afterRasterId: modifiesRaster ? this.nextId : this.rasterId,
    };
    this.id = entry.afterId;
    this.rasterId = entry.afterRasterId;
    this.recordPersistenceMutation(entry.command);
    if (!this.allowNonlinear) this.clearRedo();
    this.past.push(entry);
    this.current = entry;
    this.enforceLimit();
    this.invalidateHistorySnapshot();
    return true;
  }
  private clearRedo() {
    const index = this.current ? this.past.indexOf(this.current) : -1;
    const removed = this.past.splice(index + 1);
    if (this.savedState && removed.includes(this.savedState)) {
      this.savedState = null;
      this.savedStateLost = true;
    }
  }
  private retainedBytes(): number {
    // Bound retained history, while preserving at least the latest transaction.
    let bytes = 0;
    const retained = new Set<PixelBuffer>();
    const sourceSampleBytes = new Set<Uint8Array | Uint32Array>();
    const masks = new Set<Uint8Array>();
    const paletteColors = new Set<Rgba>();
    const frameLists = new Set<readonly TimelineFrame[]>();
    const frames = new Set<TimelineFrame>();
    const palettes = new Set<NonNullable<State["palette"]>>();
    const countImage = (image: PixelBuffer) => {
      if (retained.has(image)) return;
      retained.add(image);
      bytes += encodedPixels(image)?.bytes.byteLength ?? image.data.byteLength;
    };
    const countBufferBytes = (data: Uint8Array | Uint32Array | undefined) => {
      if (data && !sourceSampleBytes.has(data)) {
        sourceSampleBytes.add(data);
        bytes += data.byteLength;
      }
    };
    const countPalette = (palette: NonNullable<State["palette"]> | undefined) => {
      if (!palette || palettes.has(palette)) return;
      palettes.add(palette);
      for (const color of palette)
        if (!paletteColors.has(color)) {
          paletteColors.add(color);
          bytes += color.length * 8;
        }
    };
    const countStructure = (state: Structure) => {
      countImage(state.layer.pixels);
      const profile = state.timeline?.asepriteSource?.colorProfile;
      if (profile?.type === "icc") countBufferBytes(profile.data);
      for (const tileset of state.timeline?.tilesets ?? []) {
        countBufferBytes(tileset.pixels);
        countBufferBytes(tileset.asepritePixels);
      }
      const list = state.timeline?.frames;
      if (!list || frameLists.has(list)) return;
      frameLists.add(list);
      for (const frame of list) {
        if (frames.has(frame)) continue;
        frames.add(frame);
        countPalette(frame.palette);
        for (const cel of frame.cels)
          if (cel) {
            countImage(cel.pixels);
            countBufferBytes(cel.asepriteSamples?.data);
            countBufferBytes(cel.tilemap?.tiles);
          }
      }
    };
    const countMask = (mask: State["selection"] | undefined) => {
      if (mask && !masks.has(mask.data)) {
        masks.add(mask.data);
        bytes += mask.data.byteLength;
      }
    };
    for (const entry of this.past)
      for (const command of entry.command.commands) {
        if (command instanceof StructureCommand) {
          countStructure(command.before);
          countStructure(command.after);
        } else if (command instanceof MaskCommand) {
          countMask(command.before.selection);
          countMask(command.before.hiddenSelection);
          countMask(command.after.selection);
          countMask(command.after.hiddenSelection);
        } else if (command instanceof PaletteCommand) {
          countPalette(command.before);
          countPalette(command.after);
        } else if (command instanceof PatchCommand)
          bytes += command.patches.reduce((sum, patch) => sum + patch.buffer.byteLength, 0);
        else bytes += command.memoryBytes?.() ?? 32;
      }
    return bytes;
  }
  private deleteFirstState(): boolean {
    const first = this.past[0];
    if (!first || this.current === first) return false;
    let nextFirst: Entry | undefined;
    for (let i = this.past.length - 1; i > 0; i--) {
      if (this.past[i].parent === first) {
        nextFirst = this.past[i];
        break;
      }
    }
    if (!nextFirst) {
      this.past.shift();
      if (this.savedState === first) {
        this.savedState = null;
        this.savedStateLost = true;
      }
      this.baseId = first.beforeId;
      this.baseRasterId = first.beforeRasterId;
      return true;
    }
    const count = this.past.indexOf(nextFirst);
    if (this.current && this.past.indexOf(this.current) < count) return false;
    const removed = this.past.splice(0, count);
    if (this.savedState && removed.includes(this.savedState)) {
      this.savedState = null;
      this.savedStateLost = true;
    }
    nextFirst.parent = null;
    this.baseId = nextFirst.beforeId;
    this.baseRasterId = nextFirst.beforeRasterId;
    return true;
  }
  private enforceLimit() {
    if (!this.maxBytes) return;
    while (
      this.past.length > 1 &&
      this.retainedBytes() > this.maxBytes &&
      this.deleteFirstState()
    ) {
      /* History retains states needed by the current branch. */
    }
  }
  undo(doc: EditorDocument) {
    if (!this.current) return false;
    const previous = this.past[this.past.indexOf(this.current) - 1] ?? null;
    this.moveToEntry(doc, previous);
    return true;
  }
  redo(doc: EditorDocument) {
    if (!this.canRedo) return false;
    this.moveToEntry(doc, this.past[this.current ? this.past.indexOf(this.current) + 1 : 0]);
    return true;
  }
  /** Move through the saved parent chain, including an alternate branch. */
  moveToState(doc: EditorDocument, index: number) {
    if (!Number.isInteger(index) || index < -1 || index >= this.past.length)
      throw new RangeError("Invalid undo state");
    this.moveToEntry(doc, index === -1 ? null : this.past[index]);
  }
  private moveToEntry(doc: EditorDocument, destination: Entry | null) {
    if (destination === this.current) return;
    const ancestors = new Set<Entry | null>();
    for (let state = this.current; state; state = state.parent) ancestors.add(state);
    ancestors.add(null);
    let common = destination;
    while (common && !ancestors.has(common)) common = common.parent;
    while (this.current !== common) {
      const state = this.current!;
      state.command.undo(doc);
      this.recordPersistenceMutation(state.command);
      this.current = state.parent;
    }
    const path: Entry[] = [];
    for (let state = destination; state !== common; state = state!.parent) path.push(state!);
    for (let i = path.length - 1; i >= 0; i--) {
      path[i].command.redo(doc);
      this.recordPersistenceMutation(path[i].command);
      this.current = path[i];
    }
    this.id = this.current?.afterId ?? this.baseId;
    this.rasterId = this.current?.afterRasterId ?? this.baseRasterId;
    this.invalidateHistorySnapshot();
  }
}
