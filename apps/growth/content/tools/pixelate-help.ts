import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum PixelateHelpSection {
  Overview = "pixelate-help",
  Convert = "convert-image-to-pixel-art",
  Recover = "recover-pixel-grid",
  Result = "save-pixelation-result",
}

/** Pixelation and grid-recovery instructions for the standalone image tool. */
export const PIXELATE_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "图片像素化与网格恢复",
    introduction:
      "打开 PNG、JPEG 或 WebP 图片，也可用「打开示例」试用。图片在本地处理，源文件不会被覆盖。",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "将图片转换为像素画",
        steps: [
          "在「Action」中选择「Convert image」，再选尺寸预设，或填写「Width」「Height」。",
          "在「Method」中选择处理方式，对照原图和预览调整结果；需要时限制颜色或选择调色板。",
        ],
        notes:
          "开启「Lock aspect ratio」可按原图比例调整尺寸。「Keep original dimensions」会把像素化结果放大到原图尺寸。",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "恢复放大的像素网格",
        steps: [
          "在「Action」中选择「Recover pixel grid」，开启「Automatic grid」使用检测到的网格。",
          "没有检测到可靠网格时，关闭「Automatic grid」，填写「Cell width」和「Cell height」。",
        ],
        notes: "单元格宽高按原图像素计算。",
      },
      {
        id: PixelateHelpSection.Result,
        title: "保存或继续编辑",
        steps: ["点「Download PNG」保存结果，或点「Continue editing」在 Xprite 编辑器中继续绘制。"],
        notes: "导出 PNG 会在主文件名后添加 -pixelated 或 -restored；原图保持不变。",
      },
    ],
    closing: "结果预览会随设置更新；切换操作后也可以继续比较原图和新结果。",
  },
  [PublicLanguage.English]: {
    title: "Pixelate an image or recover its grid",
    introduction:
      "Open a PNG, JPEG, or WebP image, or use Open example to try the tool. Images are processed on your device, and the source file is never overwritten.",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "Convert an image to pixel art",
        steps: [
          "Under Action, choose Convert image. Pick a size preset or enter Width and Height.",
          "Choose a Method and compare the preview with the original. Limit colors or select a palette when needed.",
        ],
        notes:
          "Lock aspect ratio keeps the source proportions. Keep original dimensions scales the pixelated result back to the source image size.",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "Recover an enlarged pixel grid",
        steps: [
          "Under Action, choose Recover pixel grid and leave Automatic grid on to use a detected grid.",
          "If no reliable grid is detected, turn Automatic grid off and enter Cell width and Cell height.",
        ],
        notes: "Cell sizes are measured in pixels of the original image.",
      },
      {
        id: PixelateHelpSection.Result,
        title: "Save or continue editing",
        steps: [
          "Choose Download PNG to save the result, or Continue editing to open it in the Xprite editor.",
        ],
        notes:
          "The PNG filename adds -pixelated or -restored before the extension; the original stays unchanged.",
      },
    ],
    closing:
      "The preview updates with the current settings, and you can compare each result with the original.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
