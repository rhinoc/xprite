import type { PixelBuffer } from "@xprite/editor-core";

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
}

export const AGENT_INTERFACE_VERSION = 1;
export const AGENT_GLOBAL_NAME = "xpriteAgent";
export const AGENT_DOCUMENTATION_FILE = "agent/editor.md";
export enum AgentFileFormat {
  Png = "png",
  Aseprite = "aseprite",
  Gif = "gif",
  Spritesheet = "spritesheet",
  Tag = "tag",
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
  pixelate?(pixels: PixelBuffer, options: AgentPixelateOptions): Promise<PixelBuffer>;
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
