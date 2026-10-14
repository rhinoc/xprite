import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../../packages/palette-assets/", import.meta.url);
const records = JSON.parse(readFileSync(new URL("beads/records.json", root), "utf8"));
for (const palette of records) {
  const lines = [
    "GIMP Palette",
    `Name: ${palette.name}`,
    "#",
    "# Generated from beads/records.json.",
    `# Source: ${palette.source}`,
    `# Revision: ${palette.revision}`,
    "# Color values are community screen references; physical beads may differ.",
    ...palette.colors.map(
      ({ code, name, rgb, credit }) =>
        `${rgb.join(" ")} ${code} ${name}${credit ? ` (${credit})` : ""}`,
    ),
  ];
  writeFileSync(fileURLToPath(new URL(palette.file, root)), lines.join("\n") + "\n");
}
