import { sharedAgentPreviewDirectory } from "$/adapters/agent/preview-directory";
import { ImageImportWorkerClient } from "$/adapters/workers/import-client";
import {
  AGENT_GLOBAL_NAME,
  AGENT_INTERFACE_VERSION,
  AgentToolName,
  type AgentPixelateOptions,
  type AgentToolsPort,
  type AgentToolResponse,
  type AgentPageApi,
} from "$/managers/ports/agent-tools";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { CellColorPicker, PixelationMethod, PixelateOptions } from "@xprite/pixelate";

const BASE64_CHUNK_BYTES = 8192;
const REGISTRATION_ERROR_EVENT = "xprite-agent-registration-error";

declare global {
  interface Window {
    readonly xpriteAgent?: AgentPageApi;
  }
}

interface WebModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(input: unknown, options: { signal: AbortSignal }): Promise<AgentToolResponse>;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}

/** Browser publication only; all edits and tool definitions belong to the manager. */
export function createBrowserAgentToolsPort(): AgentToolsPort {
  const previewDirectory = sharedAgentPreviewDirectory();
  let pixelateWorker: ImageImportWorkerClient | undefined;
  return {
    encodePng: async (pixels) => new Uint8Array(await (await encodePngBlob(pixels)).arrayBuffer()),
    encodeBase64: (bytes) => {
      let binary = "";
      for (let at = 0; at < bytes.length; at += BASE64_CHUNK_BYTES)
        binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK_BYTES));
      return btoa(binary);
    },
    decodeBase64: (value) => {
      let binary: string;
      try {
        binary = atob(value);
      } catch {
        throw new Error("bytes must be base64");
      }
      const bytes = new Uint8Array(binary.length);
      for (let at = 0; at < binary.length; at += BASE64_CHUNK_BYTES) {
        const end = Math.min(at + BASE64_CHUNK_BYTES, binary.length);
        for (let index = at; index < end; index++) bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    },
    decodeImage: async (bytes) => decodeImageBlob(new Blob([bytes.buffer as ArrayBuffer])),
    pixelate: (pixels: PixelBuffer, options: AgentPixelateOptions) => {
      const worker = (pixelateWorker ??= new ImageImportWorkerClient());
      const request: PixelateOptions = {};
      if (options.method !== undefined) request.method = options.method as PixelationMethod;
      if (options.colorPicker !== undefined)
        request.colorPicker = options.colorPicker as CellColorPicker;
      if (options.targetWidth !== undefined) request.targetWidth = options.targetWidth;
      if (options.targetHeight !== undefined) request.targetHeight = options.targetHeight;
      if (options.outlineStrength !== undefined) request.outlineStrength = options.outlineStrength;
      if (options.removeNoise !== undefined) request.removeNoise = options.removeNoise;
      return worker.pixelate(pixels, request);
    },
    publish: ({ tools, execute }) => {
      const lifetime = new AbortController();
      const api = Object.freeze({
        version: AGENT_INTERFACE_VERSION,
        describe: () => structuredClone(tools),
        ...Object.fromEntries(
          tools.map((tool) => [
            tool.name,
            (input: unknown = {}) =>
              lifetime.signal.aborted
                ? Promise.resolve({
                    ok: false,
                    error: { code: "unavailable", message: "Editor interface is no longer active" },
                  })
                : execute(tool.name, input),
          ]),
        ),
      });
      Object.defineProperty(window, AGENT_GLOBAL_NAME, { value: api, configurable: true });
      const modelContext = (document as Document & { modelContext?: WebModelContext }).modelContext;
      if (typeof modelContext?.registerTool === "function") {
        // Serialize registration so disposal cannot leak tools from a pending registration.
        void (async () => {
          for (const tool of tools) {
            if (lifetime.signal.aborted) return;
            try {
              await modelContext.registerTool(
                {
                  name: `xprite_${tool.name}`,
                  description: tool.description,
                  inputSchema: structuredClone(tool.inputSchema),
                  annotations: { readOnlyHint: tool.readOnly, untrustedContentHint: true },
                  execute: async (input, options) => {
                    if (lifetime.signal.aborted || options.signal.aborted)
                      return {
                        ok: false,
                        error: { code: "cancelled", message: "Tool call cancelled" },
                      };
                    // Synchronous edits finish atomically before cancellation can interrupt them.
                    return execute(tool.name as AgentToolName, input);
                  },
                },
                { signal: lifetime.signal },
              );
            } catch (reason) {
              if (!lifetime.signal.aborted)
                window.dispatchEvent(
                  new CustomEvent(REGISTRATION_ERROR_EVENT, {
                    detail: {
                      tool: tool.name,
                      message: reason instanceof Error ? reason.message : String(reason),
                    },
                  }),
                );
            }
          }
        })();
      }
      return () => {
        lifetime.abort();
        if (Reflect.get(window, AGENT_GLOBAL_NAME) === api)
          Reflect.deleteProperty(window, AGENT_GLOBAL_NAME);
      };
    },
    previewDirectory: {
      status: async () => {
        if (!previewDirectory.supported) return { state: "unavailable" };
        const handle = await previewDirectory.granted();
        return handle ? { state: "connected", name: handle.name } : { state: "disconnected" };
      },
      connect: async () => (await previewDirectory.connect()) !== null,
      disconnect: () => previewDirectory.disconnect(),
      write: async (filename, bytes) => {
        const handle = await previewDirectory.granted();
        if (!handle)
          throw Object.assign(new Error("Preview directory is not connected"), {
            code: "preview_directory_permission_required",
          });
        const file = await handle.getFileHandle(filename, { create: true });
        const stream = await file.createWritable();
        await stream.write(bytes);
        await stream.close();
      },
    },
  };
}
