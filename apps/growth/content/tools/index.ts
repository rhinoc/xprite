export const TOOL_FILE_PRIVACY = "Processed on your device. No cloud upload.";

/** Data-only tool registry, shared by public discovery and the standalone tools app. */
export const TOOLS_HOME = {
  path: "/tools/",
  name: "Xprite Tools",
  title: "Free Online Pixel Art Tools | Xprite",
  headline: "Free online pixel art tools",
  description:
    "Create pixel art, preview Aseprite projects and convert GIF animations into sprite sheets. Files are processed on your device without uploading them to the cloud.",
} as const;

export const VIEWER_TOOL = {
  path: "/tools/viewer/",
  name: "Xprite Aseprite Viewer",
  label: "Aseprite Viewer",
  startTitle: "Inspect an Aseprite file",
  title: "Aseprite Viewer Online: Export GIF & PNG Free | Xprite",
  headline: "Free online Aseprite viewer",
  summary: "Preview Aseprite projects and export PNG frames or GIF animations.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Open Aseprite projects, preview layers and animation, and export PNG frames or GIF animations in your browser. Files stay on your device, with no cloud upload.",
  accept: ".ase,.aseprite",
  fileLabel: "Choose an Aseprite file",
  openLabel: "Open file",
  dropLabel: "Drop an .ase or .aseprite file",
  guidePath: "/help/en/",
} as const;

export const GIF_SHEET_TOOL = {
  path: "/tools/gif-to-sprite-sheet/",
  name: "Xprite GIF to Sprite Sheet",
  label: "GIF to Sprite Sheet",
  startTitle: "Turn a GIF into a sprite sheet",
  title: "GIF to Sprite Sheet: Free Online PNG Converter | Xprite",
  headline: "Free GIF to Sprite Sheet",
  summary: "Convert GIF animations into PNG sprite sheets with JSON frame data.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Turn GIF animations into PNG sprite sheets with custom layouts and spacing. Download frame coordinates and timing as JSON. Files stay on your device, with no cloud upload.",
  accept: ".gif,image/gif",
  fileLabel: "Choose a GIF file",
  openLabel: "Open GIF",
  dropLabel: "Drop a GIF file",
  guidePath: "/help/en/",
} as const;

export const ANIMAL_CROSSING_TOOL = {
  path: "/tools/animal-crossing-qr/",
  name: "Xprite Animal Crossing QR Converter",
  label: "Animal Crossing QR",
  startTitle: "Make a design for your island",
  title: "Animal Crossing QR Code Generator: PNG & Aseprite | Xprite",
  headline: "Animal Crossing design QR codes",
  summary:
    "Convert PNG images and Aseprite tilemaps into island designs, or open an existing design QR code and export it unchanged.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Create Animal Crossing island design QR codes from PNG images and Aseprite tilemaps, or read normal design QR images and export their original data. Files stay on your device.",
  accept: ".ase,.aseprite,.acnl,.png,.jpg,.jpeg,image/png,image/jpeg",
  fileLabel: "Choose artwork or an Animal Crossing QR image",
  openLabel: "Open file",
  dropLabel: "Drop artwork, a QR image or an .acnl file",
  guidePath: "/help/en/",
} as const;

export const EDITOR_TOOL = {
  path: "/",
  name: "Xprite Editor",
  headline: "Free online pixel art editor",
  summary: "Draw pixel art and animate sprites with layers, frames and palettes.",
  privacy: "Open and save .aseprite projects.",
  description:
    "Create pixel art and animations in Xprite. Open and save Aseprite projects in your browser.",
} as const;

export const TOOLS = [VIEWER_TOOL, GIF_SHEET_TOOL, ANIMAL_CROSSING_TOOL];
export const DIRECTORY_TOOLS = [EDITOR_TOOL, ...TOOLS];
export const TOOL_PATHS = [TOOLS_HOME.path, ...TOOLS.map((tool) => tool.path)];
export type PublicTool = (typeof TOOLS)[number];
