import {
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  ANIMAL_CROSSING_TOOL,
  PIXELATE_TOOL,
  FIX_AI_PIXEL_ART_TOOL,
  BEADS_TOOL,
  type PublicTool,
} from "@xprite/growth-content/tools";
import viewerPreview from "@xprite/site-assets/showcase/ipad/hello/hello-frame-01.png?url";
import islandPreview from "@xprite/site-assets/tools/animal-crossing/acnh/winding-cobblestone.png?url";
import warriorPreview from "@xprite/site-assets/tools/fix-ai-pixel-art/ai-warrior.png?url";
import pearlPreview from "@xprite/site-assets/tools/pixelate/girl-with-a-pearl-earring.jpg?url";

export {
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  FIX_AI_PIXEL_ART_TOOL,
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
};
export type { PublicTool };

export const TOOL_EXAMPLES = {
  [BEADS_TOOL.path]: {
    name: "hello-frame-01.png",
    preview: viewerPreview,
    alt: "Hello pixel art example",
    width: 128,
    height: 80,
  },
  [PIXELATE_TOOL.path]: {
    name: "girl-with-a-pearl-earring.jpg",
    preview: pearlPreview,
    alt: "Girl with a Pearl Earring by Johannes Vermeer",
    width: 850,
    height: 1007,
  },
  [FIX_AI_PIXEL_ART_TOOL.path]: {
    name: "ai-warrior.png",
    preview: warriorPreview,
    alt: "AI-generated warrior pixel art example",
    width: 2048,
    height: 2048,
  },
  [ANIMAL_CROSSING_TOOL.path]: {
    name: "acnh-winding-cobblestone.png",
    preview: islandPreview,
    alt: "ACNH Winding Cobblestone Path by Amy, with transparent edges",
    width: 96,
    height: 96,
  },
  [VIEWER_TOOL.path]: {
    name: "hello.aseprite",
    preview: viewerPreview,
    alt: "Hello sprite animation preview",
    width: 128,
    height: 80,
  },
  [GIF_SHEET_TOOL.path]: {
    name: "hello.gif",
    preview: viewerPreview,
    alt: "Hello GIF animation preview",
    width: 128,
    height: 80,
  },
};
