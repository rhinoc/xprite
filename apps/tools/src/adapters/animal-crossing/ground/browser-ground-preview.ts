import type { IslandPreviewPort } from "$/managers/ports/animal-crossing-ground";

export const browserIslandPreview: IslandPreviewPort = {
  async create(host) {
    const { createIslandScene } =
      await import("$/adapters/animal-crossing/ground/three-island-scene");
    return createIslandScene(host);
  },
};
