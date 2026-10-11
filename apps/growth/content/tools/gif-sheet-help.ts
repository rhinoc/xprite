import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum GifSheetHelpSection {
  Overview = "gif-sheet-help",
  Png = "export-sprite-sheet",
  Json = "export-frame-data",
}

/** Sprite sheet and frame data instructions for the GIF converter's static and interactive page. */
export const GIF_SHEET_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "导出精灵表和帧数据",
    introduction:
      "点「文件」→「打开 GIF…」，或拖入 GIF 文件。也可以用「打开示例」试用。文件在本地处理，GIF 不超过 64 MiB、最多 10000 帧。每一帧都按 GIF 的画布合成为完整画面，再排进精灵表。",
    sections: [
      {
        id: GifSheetHelpSection.Png,
        title: "导出 PNG 精灵表",
        steps: [
          "在「精灵表布局」的「排列方式」中选择「按行排列」「按列排列」「水平」或「垂直」。",
          "按行排列时用「列数」设置每行的帧数，按列排列时用「行数」设置每列的帧数。默认值为帧数的平方根，向上取整。",
          "按需设置「边缘留白」「帧间距」和「尺寸为 2 的幂」，然后点「文件」→「导出精灵表（.png）」。",
        ],
        notes:
          "帧保持 GIF 的画布尺寸，不缩放、不裁剪。「边缘留白」和「帧间距」可设为 0 到 4096 像素；「尺寸为 2 的幂」只向上补齐精灵表的宽和高。精灵表每边不超过 32768 像素，总计不超过 6400 万像素。文件名与 GIF 相同，扩展名为 .png。",
      },
      {
        id: GifSheetHelpSection.Json,
        title: "导出 JSON 帧数据",
        steps: [
          "按「导出 PNG 精灵表」中的步骤设置布局。",
          "点「文件」→「导出帧数据（.json）」。",
          "点「文件」→「导出精灵表（.png）」，导出同一布局的精灵表。",
        ],
        notes:
          "JSON 对应当前布局，修改布局后 PNG 和 JSON 需要一起重新导出。frames 数组按播放顺序列出各帧：frame 是帧在精灵表中的 x、y、w、h，duration 是 GIF 的帧时长，单位为毫秒。帧名为 GIF 名-帧号.png，帧号从 0 开始。meta 记录精灵表的文件名和尺寸，不包含 GIF 的循环次数。文件名与 GIF 相同，扩展名为 .json。",
      },
    ],
    closing:
      "精灵表包含 GIF 的所有帧，不裁剪空白，也不合并重复帧。需要这些选项时，在 Xprite 编辑器中打开 GIF，在「导出精灵表」中勾选「裁剪精灵」或「合并重复项」。",
  },
  [PublicLanguage.English]: {
    title: "Export a sprite sheet and frame data",
    introduction:
      "Choose File → Open GIF… or drop a GIF file here. Use Open example to try it first. Files are processed on your device; a GIF can be up to 64 MiB and 10,000 frames. Each frame is composited into a full image at the GIF’s canvas size before it is placed on the sheet.",
    sections: [
      {
        id: GifSheetHelpSection.Png,
        title: "Export a PNG sprite sheet",
        steps: [
          "Under Sheet layout, choose a Layout: By rows, By columns, Horizontal or Vertical.",
          "For By rows, set Columns to the number of frames in each row; for By columns, set Rows to the number of frames in each column. The default is the square root of the frame count, rounded up.",
          "Set Border padding, Frame spacing and Power of two as needed, then choose File → Export sprite sheet (.png).",
        ],
        notes:
          "Frames keep the GIF’s canvas size and are not scaled or trimmed. Border padding and Frame spacing accept 0 to 4096 px; Power of two only rounds the sheet’s width and height up. Each side of the sheet can be up to 32,768 px, with at most 64 million pixels in total. The file uses the GIF’s name with a .png extension.",
      },
      {
        id: GifSheetHelpSection.Json,
        title: "Export JSON frame data",
        steps: [
          "Set the layout as described in Export a PNG sprite sheet.",
          "Choose File → Export frame data (.json).",
          "Choose File → Export sprite sheet (.png) to export the sheet with the same layout.",
        ],
        notes:
          "The JSON matches the current layout; after changing the layout, export the PNG and JSON again together. The frames array lists frames in playback order: frame gives each frame’s x, y, w and h on the sheet, and duration is the GIF frame duration in milliseconds. Frames are named name-N.png, with N starting at 0. meta records the sheet’s file name and size but not the GIF’s loop count. The file uses the GIF’s name with a .json extension.",
      },
    ],
    closing:
      "The sheet includes every GIF frame without trimming empty space or merging duplicate frames. For those options, open the GIF in the Xprite editor and check Trim Sprite or Merge Duplicates in Export Sprite Sheet.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
