import {
  normalizeDocumentExportPreferences,
  type DocumentExportPreferences,
  type ExportRecord,
} from "$/managers/files/export-preferences";
import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  normalizeCanvasDisplayPreferences,
  type CanvasDisplayPreferences,
} from "$/managers/preferences/canvas-display-preferences";
import {
  normalizeTimelinePanelPreferences,
  readTimelinePanelPreferences,
  writeTimelinePanelDefaults,
  type TimelinePanelPreferences,
} from "$/managers/preferences/timeline-panel-preferences";
import {
  DEFAULT_VIEW,
  clampZoom,
  updateDocumentViewOptions,
  type DocumentViewOptions,
  type ViewSettings,
} from "@xprite/editor-core";

export enum CanvasDisplayPreferenceTarget {
  Document = "document",
  Defaults = "defaults",
}
interface DocumentPreferences {
  exports?: DocumentExportPreferences;
  view?: Partial<DocumentViewOptions>;
  viewport?: Pick<ViewSettings, "zoom" | "pan">;
  display?: CanvasDisplayPreferences;
  site?: { frame: number; layer: number };
  timeline: TimelinePanelPreferences;
}
const DOCUMENT_PREFERENCE_PREFIX = "xse.document.preferences.v1.";
const DOCUMENT_GENERATION_KEY = "xse.document.preferences.generation.v1";
const DEFAULT_VIEW_KEY = "xse.document.view-defaults.v1";
const VIEW_KEYS = [
  "symmetryMode",
  "symmetryX",
  "symmetryY",
  "tiledMode",
  "grid",
  "gridX",
  "gridY",
  "gridWidth",
  "gridHeight",
  "pixelGrid",
  "selectionEdges",
  "guides",
  "layerEdges",
  "slices",
  "tileNumbers",
  "brushPreview",
] as const;
function viewPreferences(value: unknown): Partial<DocumentViewOptions> {
  const source = value && typeof value === "object" ? (value as Partial<DocumentViewOptions>) : {};
  const normalized = updateDocumentViewOptions(DEFAULT_VIEW, source);
  return Object.fromEntries(
    VIEW_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, normalized[key]]),
  );
}

function sameCapturedView(a: Partial<DocumentViewOptions>, b: DocumentViewOptions): boolean {
  if (!VIEW_KEYS.every((key) => a[key] === b[key])) return false;
  if (!a.onionSkin || !b.onionSkin) return a.onionSkin === b.onionSkin;
  const keys = Object.keys(a.onionSkin) as (keyof NonNullable<DocumentViewOptions["onionSkin"]>)[];
  return (
    keys.length === Object.keys(b.onionSkin).length &&
    keys.every((key) => a.onionSkin![key] === b.onionSkin![key])
  );
}

function viewportPreferences(value: unknown): DocumentPreferences["viewport"] {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<Pick<ViewSettings, "zoom" | "pan">>;
  if (
    typeof source.zoom !== "number" ||
    !Number.isFinite(source.zoom) ||
    source.zoom <= 0 ||
    !source.pan ||
    !Number.isFinite(source.pan.x) ||
    !Number.isFinite(source.pan.y)
  )
    return undefined;
  return { zoom: clampZoom(source.zoom), pan: { x: source.pan.x, y: source.pan.y } };
}

/** Preference records use durable identities, never display names or artwork snapshots. */
export class DocumentPreferencesManager {
  private readonly cache = new Map<string, DocumentPreferences>();
  private readonly serialized = new Map<string, string>();
  private readonly persisted = new Map<string, DocumentPreferences>();
  private readonly capturedViews = new Map<
    string,
    {
      view: Partial<DocumentViewOptions>;
      frame: number | undefined;
      layer: number | undefined;
      preferences: DocumentPreferences;
    }
  >();
  private defaults: TimelinePanelPreferences;
  private generation = 0;
  private defaultView: Partial<DocumentViewOptions> = {};

  constructor(private readonly storage: PreferenceStoragePort) {
    this.defaults = readTimelinePanelPreferences(undefined, storage);
    try {
      const generation = Number(storage?.getItem(DOCUMENT_GENERATION_KEY));
      if (Number.isSafeInteger(generation) && generation >= 0) this.generation = generation;
    } catch {
      /* The initial generation remains usable in this workspace. */
    }
    try {
      this.defaultView = viewPreferences(JSON.parse(storage?.getItem(DEFAULT_VIEW_KEY) ?? "null"));
    } catch {
      /* Retain default visibility when stored preferences are unavailable. */
    }
  }
  getDefaultView = () => this.defaultView;
  getTimelineDefaults = () => this.defaults;
  setDefaultView(value: DocumentViewOptions) {
    this.defaultView = viewPreferences(value);
    try {
      this.storage?.setItem(DEFAULT_VIEW_KEY, JSON.stringify(this.defaultView));
    } catch {
      /* Defaults remain available in this workspace. */
    }
  }
  setTimelineDefaults(value: TimelinePanelPreferences) {
    this.defaults = normalizeTimelinePanelPreferences(value);
    writeTimelinePanelDefaults(this.defaults, this.storage);
  }
  get(key: string): DocumentPreferences {
    const cached = this.cache.get(key);
    if (cached) return cached;
    let next: DocumentPreferences = { timeline: this.defaults };
    try {
      const saved = JSON.parse(
        this.storage?.getItem(DOCUMENT_PREFERENCE_PREFIX + encodeURIComponent(key)) ?? "null",
      );
      if (saved?.version === 1 && saved.generation === this.generation) {
        this.serialized.set(key, JSON.stringify(saved));
        const viewport = viewportPreferences(saved.viewport);
        next = {
          ...(viewport ? { viewport } : {}),
          ...(Number.isSafeInteger(saved.site?.frame) &&
          saved.site.frame >= 0 &&
          Number.isSafeInteger(saved.site?.layer) &&
          saved.site.layer >= 0
            ? { site: { frame: saved.site.frame, layer: saved.site.layer } }
            : {}),
          timeline: saved.timeline
            ? normalizeTimelinePanelPreferences(saved.timeline)
            : this.defaults,
          ...(saved.view ? { view: viewPreferences(saved.view) } : {}),
          ...(saved.display ? { display: normalizeCanvasDisplayPreferences(saved.display) } : {}),
          ...(saved.exports ? { exports: normalizeDocumentExportPreferences(saved.exports) } : {}),
        };
      }
    } catch {
      /* Use defaults for malformed or inaccessible records. */
    }
    this.cache.set(key, next);
    return next;
  }
  has(key: string): boolean {
    const preferences = this.get(key);
    return (
      !!preferences.view ||
      !!preferences.viewport ||
      !!preferences.display ||
      this.serialized.has(key)
    );
  }
  resetAll() {
    this.generation++;
    this.cache.clear();
    this.serialized.clear();
    this.persisted.clear();
    this.capturedViews.clear();
    try {
      this.storage?.setItem(DOCUMENT_GENERATION_KEY, String(this.generation));
    } catch {
      /* The cleared cache is authoritative for the current workspace. */
    }
  }
  reset(key: string) {
    this.cache.set(key, { timeline: this.defaults });
    this.serialized.delete(key);
    this.persisted.delete(key);
    this.capturedViews.delete(key);
  }
  copy(from: string, to: string) {
    this.write(to, this.get(from));
  }
  copyExports(from: string, to: string) {
    const exports = this.get(from).exports;
    if (exports) this.write(to, { ...this.get(to), exports });
  }
  setExport(key: string, record: ExportRecord) {
    const current = this.get(key);
    this.write(key, {
      ...current,
      exports: {
        ...current.exports,
        [record.type]: structuredClone(record.options),
        lastType: record.type,
      },
    });
  }
  setDisplay(key: string, display: CanvasDisplayPreferences) {
    return this.write(key, {
      ...this.get(key),
      display: normalizeCanvasDisplayPreferences(display),
    });
  }
  setTimeline(key: string, value: TimelinePanelPreferences) {
    return this.write(key, {
      ...this.get(key),
      timeline: normalizeTimelinePanelPreferences(value),
    });
  }
  captureViewport(key: string, view: Pick<ViewSettings, "zoom" | "pan">): void {
    const viewport = viewportPreferences(view);
    if (!viewport) return;
    const current = this.get(key);
    if (
      this.persisted.get(key) === current &&
      current.viewport?.zoom === viewport.zoom &&
      current.viewport.pan.x === viewport.pan.x &&
      current.viewport.pan.y === viewport.pan.y
    )
      return;
    this.write(key, { ...current, viewport });
  }
  captureView(
    key: string,
    view: DocumentViewOptions,
    site?: { frame: number; layer: number },
  ): boolean {
    const current = this.get(key);
    const captured = this.capturedViews.get(key);
    // Compare only persisted inputs, so pointer and pan updates need no record
    // serialization. Record identity also invalidates this shortcut after edits.
    if (
      captured &&
      sameCapturedView(captured.view, view) &&
      captured.frame === site?.frame &&
      captured.layer === site?.layer &&
      captured.preferences === current &&
      this.persisted.get(key) === current
    )
      return false;
    const nextView = viewPreferences(view);
    const nextTimeline = normalizeTimelinePanelPreferences({
      ...current.timeline,
      onionSkin: view.onionSkin,
    });
    const sameView =
      current.view &&
      Object.keys(current.view).length === Object.keys(nextView).length &&
      VIEW_KEYS.every((key) => current.view![key] === nextView[key]);
    const sameOnion =
      Object.keys(current.timeline.onionSkin).length ===
        Object.keys(nextTimeline.onionSkin).length &&
      Object.entries(nextTimeline.onionSkin).every(([field, value]) =>
        Object.is(current.timeline.onionSkin[field as keyof typeof nextTimeline.onionSkin], value),
      );
    const sameTimeline =
      sameOnion &&
      Object.keys(current.timeline).length === Object.keys(nextTimeline).length &&
      (Object.keys(nextTimeline) as (keyof TimelinePanelPreferences)[]).every(
        (field) => field === "onionSkin" || Object.is(current.timeline[field], nextTimeline[field]),
      );
    const changed = this.write(key, {
      ...current,
      view: sameView ? current.view : nextView,
      ...(site ? { site: { ...site } } : {}),
      timeline: sameTimeline ? current.timeline : nextTimeline,
    });
    this.capturedViews.set(key, {
      view: {
        ...Object.fromEntries(VIEW_KEYS.map((key) => [key, view[key]])),
        onionSkin: view.onionSkin ? { ...view.onionSkin } : undefined,
      },
      frame: site?.frame,
      layer: site?.layer,
      preferences: this.get(key),
    });
    return changed;
  }
  private write(key: string, value: DocumentPreferences): boolean {
    if (this.persisted.get(key) === value) return false;
    const serialized = JSON.stringify({ version: 1, generation: this.generation, ...value });
    if (this.serialized.get(key) === serialized) {
      this.cache.set(key, value);
      this.persisted.set(key, value);
      return false;
    }
    this.cache.set(key, value);
    try {
      this.storage?.setItem(DOCUMENT_PREFERENCE_PREFIX + encodeURIComponent(key), serialized);
      this.serialized.set(key, serialized);
      this.persisted.set(key, value);
    } catch {
      /* Keep the updated record in memory when storage is unavailable. */
    }
    return true;
  }
}
