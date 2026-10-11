import { PublicLanguage } from "../site/language.ts";

export enum ViewerHelpSection {
  Overview = "viewer-help",
  Png = "export-png",
  Gif = "export-gif",
}

/** Export instructions live with the viewer in both its static and interactive page. */
export const VIEWER_EXPORT_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "导出 PNG 和 GIF",
    introduction:
      "点「文件」→「打开文件…」，或拖入 .ase、.aseprite 工程。也可以用「打开示例」试用。文件在本地处理，图层显隐只影响预览和导出，原文件不受影响。",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "导出 PNG",
        steps: [
          "点时间轴上的帧，或用左右方向键切换到需要的帧。",
          "点图层旁的眼睛图标隐藏不需要的图层；隐藏不透明的背景层后，可导出透明背景。",
          "点「文件」→「导出当前帧（.png）」。",
        ],
        notes:
          "PNG 只包含当前帧的可见图层，保留半透明像素，尺寸和原画布一致。文件名为 工程名-frame-帧号.png，帧号从 1 开始。",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "导出 GIF",
        steps: [
          "点时间轴上的标签，或在「动画范围」中选择标签；选「所有帧」导出整段动画。没有标签时，默认导出全部帧。",
          "点图层旁的眼睛图标隐藏不需要的图层。",
          "点「文件」→「导出动画（.gif）」。只有一帧的工程请导出 PNG。",
        ],
        notes:
          "GIF 按原画布尺寸导出，沿用标签的播放方向和重复次数。所有帧共用最多 256 色，半透明像素会变成不透明；帧时长以 10 毫秒为单位，不足的部分舍去，例如 25 毫秒变为 20 毫秒。动画过大时，选择更短的标签导出。",
      },
    ],
    editing:
      "PNG 和 GIF 不保留工程的图层与标签。需要修改或放大作品时，点「文件」→「在 Xprite 中编辑」，编辑器会打开原始工程。",
  },
  [PublicLanguage.English]: {
    title: "Export PNG and GIF",
    introduction:
      "Choose File → Open file… or drop an .ase or .aseprite project here. Use Open example to try it first. Files are processed on your device. Layer visibility affects the preview and export; your original file stays unchanged.",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "Export PNG",
        steps: [
          "Click a frame in the timeline, or use the Left and Right arrow keys to select it.",
          "Click the eye beside a layer to hide it. Hide an opaque background layer to export a transparent background.",
          "Choose File → Export current frame (.png).",
        ],
        notes:
          "The PNG merges the current frame’s visible layers, keeps semi-transparent pixels, and uses the original canvas size. Files are named project-frame-N.png, with frame numbers starting at 1.",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "Export GIF",
        steps: [
          "Click a timeline tag or select one under Animation range. Choose All frames for the whole animation. Projects without tags export every frame.",
          "Click the eye beside a layer to hide it from the export.",
          "Choose File → Export animation (.gif). For a single-frame project, export PNG instead.",
        ],
        notes:
          "The GIF uses the original canvas size and follows the tag’s direction and repeat count. Frames share up to 256 colors; semi-transparent pixels become opaque. Frame durations use 10 ms steps, dropping the remainder: 25 ms becomes 20 ms. If an animation is too large, export a shorter tag.",
      },
    ],
    editing:
      "PNG and GIF do not keep project layers or tags. To edit or resize your work, choose File → Edit in Xprite to open the original project in the editor.",
  },
} as const;
