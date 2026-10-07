import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import type { ToolHostPort } from "$/managers/ports/tool-host";

export const browserToolHost: ToolHostPort = {
  ...browserToolAppearance,
};
