import type { PixelBuffer, Rgba } from "$/base/primitives";
import type { EditorProject } from "$/document/project";
import type {
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelGridAnalysis,
  PixelArtClassification,
  PixelationAlgorithm,
  PixelateOptions,
  PixelationSettings,
} from "$/import-export/image/import";
/** What the import dialog remembers of its last Pixelate import for the silent path. */
export type ImportPixelationMemory = Partial<
  Pick<
    PixelationSettings,
    "prepass" | "lineGuide" | "colorPicker" | "reduceColors" | "maxColors" | "dither"
  >
>;
export interface SessionSource<Source> {
  readonly palette?: readonly Rgba[];
  readonly source: Source;
  readonly name: string;
}
export enum SessionSaveIntent {
  Save = "save",
  SaveAs = "save-as",
  Export = "export",
}
export type SessionWriteResult =
  | {
      method: "file" | "picker" | "download";
      name: string;
      format?: "png" | "aseprite";
      recentIdentity?: string;
    }
  | { cancelled: true };
/** A sprite project kept alongside its current composite preview. The
 * timeline may retain asepriteSource metadata so a later save can round-trip
 * the original .ase/.aseprite graph. */
export type SessionProject = EditorProject & { pngImage?: PixelBuffer };
export interface RecentImageItem {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
}
/** Immutable persistence snapshot. Ports must not mutate or transfer its buffers.
 * The opaque content version survives reordering and hydration, but is replaced
 * whenever a record's pixels or project change. */
export interface SessionRecentImage {
  readonly id: string;
  readonly name: string;
  readonly image: PixelBuffer;
  readonly project?: SessionProject;
  readonly contentVersion?: object;
}
/** Lightweight durable record. Its opaque version allows ordered writes without loading content. */
export interface SessionRecentMetadata extends RecentImageItem {
  readonly contentVersion: object;
}
/** An ordered catalog may retain durable records whose content has not been loaded. */
export type SessionRecentEntry = SessionRecentImage | SessionRecentMetadata;
/** Maps storage-specific identities to the stable identity used by recent files. */
export interface RecentIdentityPort {
  resolve(identity: string): string | null;
  link(identity: string, recentId: string): void;
}
export interface EditorSessionPorts<Source> {
  listRecentImages?(): Promise<readonly SessionRecentMetadata[]>;
  readRecentImage?(id: string): Promise<SessionRecentImage | null>;
  saveRecentImages?(images: readonly SessionRecentEntry[]): Promise<void>;
  /** Probe a source before single-image decoding. Return null for static images;
   * throw when a recognized project or animation is unsupported or malformed. */
  decodeProject?(source: Source): Promise<SessionProject | null>;
  /** Stable source identity supplied by a platform adapter, independent of display name. */
  identifySource?(source: Source): Promise<string | null>;
  decode(source: Source): Promise<PixelBuffer>;
  analyze(image: PixelBuffer, options?: PixelArtAnalysisOptions): Promise<PixelArtAnalysis>;
  pixelate(image: PixelBuffer, options: PixelateOptions): Promise<PixelBuffer>;
  write(
    image: PixelBuffer,
    name: string,
    intent: SessionSaveIntent,
    documentKey?: string,
  ): Promise<SessionWriteResult>;
  writeProject?(
    project: SessionProject,
    name: string,
    intent: SessionSaveIntent,
    documentKey?: string,
  ): Promise<SessionWriteResult>;
  /** Retrieve import dialog preference to determine if the dialog should be shown. */
  getImportPreference?(): {
    choice: string;
    algorithm: string;
    colorPicker?: string;
    /** The pixelation the dialog last imported with; the silent Pixelate path repeats it. */
    pixelation?: ImportPixelationMemory | null;
  };
  releaseSource?(source: Source): void;
  dispose?(): void;
}
export interface SessionSize {
  width: number;
  height: number;
  colorDepth?: 8 | 16 | 32;
  background?: "transparent" | "white" | "black";
  palette?: readonly Rgba[];
}

export enum SessionOperation {
  Initialization = "initialization",
  Import = "import",
  Pixelate = "pixelate",
  New = "new",
  Recent = "recent",
  Save = "save",
  Text = "text",
  Editor = "editor",
}
export interface SessionError {
  readonly operation: SessionOperation;
  readonly message: string;
}
export interface SessionPendingImport {
  readonly sourcePalette: readonly Rgba[];
  readonly grid: PixelGridAnalysis | null;
  /** Grid algorithm the preview was produced with; starts as the remembered one (Auto by default). */
  readonly algorithm: PixelationAlgorithm;
  readonly pixels: PixelBuffer;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly classification: PixelArtClassification;
}
export interface SessionReplacement {
  readonly kind: "import" | "new" | "recent" | "close" | "exit";
  readonly name: string;
}
export enum SessionOutcome {
  Created = "created",
  Activated = "activated",
  Confirmation = "confirmation",
  Pending = "pending",
  Error = "error",
  Ignored = "ignored",
  Cancelled = "cancelled",
  Closed = "closed",
}
export interface EditorSessionSnapshot {
  readonly busy: boolean;
  readonly saving: boolean;
  readonly pendingImport: SessionPendingImport | null;
  readonly replacement: SessionReplacement | null;
  readonly pixelationPreview: PixelBuffer | null;
  readonly pixelationPalette: readonly Rgba[];
  readonly pixelationPreviewing: boolean;
  readonly pixelationError: string | null;
  readonly pixelationOptions: Readonly<PixelationSettings>;
  readonly newSize: Readonly<SessionSize>;
  readonly error: SessionError | null;
  readonly notice: string;
  readonly recentFiles: readonly RecentImageItem[];
  /** Only user-requested document activation increments this; bootstrap does not. */
  readonly documentActivation: number;
  readonly documentActivationKind: "initial" | "replace" | "activate" | "close";
  readonly exitRequests: number;
  readonly persisting: boolean;
  readonly prompt: "error" | "replacement" | "pixelation" | null;
}
export interface SessionInitialOptions {
  palette?: readonly Rgba[];
  foreground?: Rgba;
  background?: Rgba;
  rememberInitial?: boolean;
  initialRecentId?: string;
  /** Decode and remember the source without installing it as the editor document. */
  rememberOnly?: boolean;
  /** Let startup render after the document is ready while recents persist in the background. */
  awaitPersistence?: boolean;
}
