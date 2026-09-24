import type { PixelBuffer, Rgba } from "$/base/primitives";
import type { EditorProject } from "$/document/project";
import type {
  PixelArtAnalysis,
  PixelArtClassification,
  PixelateOptions,
  PixelationMethod,
} from "$/import-export/image/import";
export interface SessionSource<Source> {
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
/** Ports capture browser resources synchronously, before returning their promise. */
export interface SessionRecentImage {
  readonly id: string;
  readonly name: string;
  readonly image: PixelBuffer;
  readonly project?: SessionProject;
}
/** Maps storage-specific identities to the stable identity used by recent files. */
export interface RecentIdentityPort {
  resolve(identity: string): string | null;
  link(identity: string, recentId: string): void;
}
export interface EditorSessionPorts<Source> {
  loadRecentImages?(): Promise<readonly SessionRecentImage[]>;
  saveRecentImages?(images: readonly SessionRecentImage[]): Promise<void>;
  /** Probe a source before single-image decoding. Return null for static images;
   * throw when a recognized project or animation is unsupported or malformed. */
  decodeProject?(source: Source): Promise<SessionProject | null>;
  /** Stable source identity supplied by a platform adapter, independent of display name. */
  identifySource?(source: Source): Promise<string | null>;
  decode(source: Source): Promise<PixelBuffer>;
  analyze(image: PixelBuffer): Promise<PixelArtAnalysis>;
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
export interface SessionPixelationOptions {
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  method: PixelationMethod;
  preserveDimensions: boolean;
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
  readonly pixelationOptions: Readonly<SessionPixelationOptions>;
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
