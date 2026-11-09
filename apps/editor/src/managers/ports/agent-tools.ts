import type { PixelBuffer } from "@xprite/editor-core";
import type { ExportRasterText } from "@xprite/editor-core/import-export";

export enum AgentToolName {
  GetContext = "getContext",
  Render = "render",
  ReadPixels = "readPixels",
  Validate = "validate",
  CreateDocument = "createDocument",
  ImportImage = "importImage",
  ManageDocument = "manageDocument",
  ApplyBatch = "applyBatch",
  Undo = "undo",
  Redo = "redo",
  ExportDocument = "exportDocument",
  Palette = "palette",
  WritePreview = "writePreview",
  ListDocs = "listDocs",
  ReadDoc = "readDoc",
  ReleaseArtifact = "releaseArtifact",
}

export const AGENT_INTERFACE_VERSION = 2;
export const AGENT_GLOBAL_NAME = "xpriteAgent";
export const AGENT_DOCUMENTATION_FILE = "agent/editor.md";
export enum AgentFileFormat {
  Png = "png",
  Aseprite = "aseprite",
  Gif = "gif",
  Spritesheet = "spritesheet",
  Tag = "tag",
}

export enum AgentOutput {
  DataUrl = "dataUrl",
  Base64 = "base64",
  Url = "url",
}

export enum AgentPreviewBackground {
  Transparent = "transparent",
  Checkerboard = "checkerboard",
}

export enum AgentPreviewLayout {
  Strip = "strip",
  Grid = "grid",
}

export type AgentToolResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface AgentToolDefinition {
  name: AgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export type AgentPageApi = Readonly<
  Record<AgentToolName, (input?: unknown) => Promise<AgentToolResponse>>
> & {
  readonly version: number;
  describe(): readonly AgentToolDefinition[];
};

export interface AgentToolsPort {
  publish(options: {
    tools: readonly AgentToolDefinition[];
    execute(name: AgentToolName, input: unknown): Promise<AgentToolResponse>;
  }): () => void;
  encodePng(pixels: PixelBuffer): Promise<Uint8Array>;
  encodeBase64(bytes: Uint8Array): string;
  decodeBase64(value: string): Uint8Array;
  decodeImage(bytes: Uint8Array): Promise<PixelBuffer>;
  readonly rasterText?: ExportRasterText;
  artifacts?: {
    create(bytes: Uint8Array, mimeType: string, filename: string): string;
    revoke(url: string): void;
  };
  pixelate?(pixels: PixelBuffer, options: AgentPixelateOptions): Promise<PixelBuffer>;
  /** Agent handbook access: index of docs and per-path markdown fetch. */
  agentDocs?: {
    list(): Promise<{ id: string; title: string }[]>;
    read(path: string): Promise<string | null>;
  };
  /**
   * Optional agent preview directory. When present, the `writePreview` tool is
   * advertised; `connectPreviewDirectory` must be called from a user gesture.
   */
  previewDirectory?: {
    status(): Promise<{
      state: "connected" | "unavailable" | "disconnected";
      name?: string;
    }>;
    connect(): Promise<boolean>;
    disconnect(): Promise<void>;
    write(filename: string, bytes: Uint8Array): Promise<void>;
  };
}

export interface AgentPixelateOptions {
  method?: string;
  colorPicker?: string;
  targetWidth?: number;
  targetHeight?: number;
  outlineStrength?: number;
  removeNoise?: boolean;
}
