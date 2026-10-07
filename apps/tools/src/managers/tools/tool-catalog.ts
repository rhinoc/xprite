import {
  TOOLS_HOME,
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  ANIMAL_CROSSING_TOOL,
  DIRECTORY_TOOLS,
  type PublicTool,
} from "@xprite/growth-content/tools";
import viewerPreview from "@xprite/site-assets/showcase/ipad/hello/hello-frame-01.png?url";
import islandPreview from "@xprite/site-assets/tools/animal-crossing/acnh/winding-cobblestone.png?url";

export { TOOLS_HOME, VIEWER_TOOL, GIF_SHEET_TOOL, ANIMAL_CROSSING_TOOL, DIRECTORY_TOOLS };
export type { PublicTool };

export const TOOL_EXAMPLES = {
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
