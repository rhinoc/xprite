import type { AppearanceMode } from "@xprite/editor-ui/appearance";

export interface ToolHostPort {
  readAppearance(): AppearanceMode;
  watchAppearance(listener: (mode: AppearanceMode) => void): () => void;
}
