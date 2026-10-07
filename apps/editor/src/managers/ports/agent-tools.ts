import type { PixelBuffer } from "@xprite/editor-core";

export enum AgentToolName {
  GetContext = "getContext",
  Render = "render",
  ReadPixels = "readPixels",
  CreateDocument = "createDocument",
  ApplyBatch = "applyBatch",
  Undo = "undo",
  Redo = "redo",
  ExportDocument = "exportDocument",
}

export const AGENT_INTERFACE_VERSION = 1;
export const AGENT_GLOBAL_NAME = "xpriteAgent";
export const AGENT_DOCUMENTATION_FILE = "agent/editor.md";
export enum AgentFileFormat {
  Png = "png",
  Aseprite = "aseprite",
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
}
