import cancelIcon from "$assets/icons/pixelarticons/cancel.svg?url";
import checkIcon from "$assets/icons/pixelarticons/check.svg?url";
import menuIcon from "$assets/icons/pixelarticons/menu.svg?url";
import redoIcon from "$assets/icons/pixelarticons/redo.svg?url";
import sectionCopyIcon from "$assets/icons/pixelarticons/section-copy.svg?url";
import undoIcon from "$assets/icons/pixelarticons/undo.svg?url";
import tabIcon from "$assets/icons/xprite/browser.webp?url";
import copyIcon from "$assets/icons/xprite/copy.webp?url";
import deleteIcon from "$assets/icons/xprite/delete.webp?url";
import downloadIcon from "$assets/icons/xprite/download.svg?url";
import folderIcon from "$assets/icons/xprite/file-manager.webp?url";
import filePlusIcon from "$assets/icons/xprite/new-file.webp?url";
import cutIcon from "$assets/icons/xprite/touch-cut.webp?url";
import exportIcon from "$assets/icons/xprite/touch-export.webp?url";
import gridIcon from "$assets/icons/xprite/touch-grid.webp?url";
import moreVerticalIcon from "$assets/icons/xprite/touch-more.webp?url";
import clipboardIcon from "$assets/icons/xprite/touch-paste.webp?url";
import gearIcon from "$assets/icons/xprite/touch-settings.webp?url";
import sectionXIcon from "$assets/icons/xprite/touch-unselect.webp?url";
import workspaceSettingsIcon from "$assets/icons/xprite/workspace-settings.svg?url";
import frameIcon from "$assets/icons/xprite/zoom-actual.webp?url";
import zoomInIcon from "$assets/icons/xprite/zoom-in.webp?url";
import zoomOutIcon from "$assets/icons/xprite/zoom-out.webp?url";

import styles from "$/components/shared/pixel-art-icon/pixel-art-icon.module.css";

const iconSources = {
  cancel: cancelIcon,
  check: checkIcon,
  clipboard: clipboardIcon,
  copy: copyIcon,
  cut: cutIcon,
  delete: deleteIcon,
  download: downloadIcon,
  export: exportIcon,
  "file-plus": filePlusIcon,
  frame: frameIcon,
  folder: folderIcon,
  gear: gearIcon,
  grid: gridIcon,
  menu: menuIcon,
  "more-vertical": moreVerticalIcon,
  redo: redoIcon,
  "section-copy": sectionCopyIcon,
  "section-x": sectionXIcon,
  tab: tabIcon,
  "workspace-settings": workspaceSettingsIcon,
  undo: undoIcon,
  "zoom-in": zoomInIcon,
  "zoom-out": zoomOutIcon,
} as const;

const drawnIconNames = new Set<PixelArtIconName>([
  "clipboard",
  "copy",
  "cut",
  "delete",
  "export",
  "file-plus",
  "frame",
  "folder",
  "gear",
  "grid",
  "more-vertical",
  "section-x",
  "tab",
  "zoom-in",
  "zoom-out",
]);
const smallDrawnIconNames = new Set<PixelArtIconName>(["export", "grid"]);

export type PixelArtIconName = keyof typeof iconSources;

export function PixelArtIcon({ name, size }: { name: PixelArtIconName; size?: number }) {
  const source = iconSources[name];
  const maskImage = `url("${source}")`;
  const originalColor = name === "tab" || name === "folder";
  const className = [
    styles.icon,
    drawnIconNames.has(name) ? styles.drawn : undefined,
    smallDrawnIconNames.has(name) ? styles.smallDrawn : undefined,
    originalColor ? styles.originalColor : undefined,
    name === "workspace-settings" ? styles.workspaceSettings : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        ...(originalColor
          ? { backgroundImage: maskImage }
          : { maskImage, WebkitMaskImage: maskImage }),
        ...(size === undefined ? {} : { flexBasis: size, width: size, height: size }),
      }}
    />
  );
}
