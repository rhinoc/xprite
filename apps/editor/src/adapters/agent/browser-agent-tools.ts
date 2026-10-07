import {
  AGENT_GLOBAL_NAME,
  AGENT_INTERFACE_VERSION,
  AgentToolName,
  type AgentToolsPort,
  type AgentToolResponse,
  type AgentPageApi,
} from "$/managers/ports/agent-tools";
import { encodePngBlob } from "@xprite/bedrock/browser/images";

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
  return {
    encodePng: async (pixels) => new Uint8Array(await (await encodePngBlob(pixels)).arrayBuffer()),
    encodeBase64: (bytes) => {
      let binary = "";
      for (let at = 0; at < bytes.length; at += BASE64_CHUNK_BYTES)
        binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK_BYTES));
      return btoa(binary);
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
  };
}
