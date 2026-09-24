import data from "$/drawing/data/tool-capabilities.json";
/** Product-owned behavior and control availability for an editor tool. */
export function getXpriteToolCapabilities(tool: string) {
  const result = data.tools[tool as keyof typeof data.tools];
  if (!result) {
    throw new Error(`Unknown editor tool: ${tool}`);
  }
  return result;
}
