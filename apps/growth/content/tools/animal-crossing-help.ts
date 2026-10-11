import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum AnimalCrossingHelpSection {
  Overview = "animal-crossing-help",
  Convert = "create-design",
  Existing = "export-existing-design",
}

/** Conversion and import instructions for the Animal Crossing converter's static and interactive page. */
export const ANIMAL_CROSSING_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "制作和导入岛屿设计",
    introduction:
      "点「文件」→「打开文件…」，或拖入 PNG、JPEG、.ase、.aseprite 或 .acnl 文件。也可以用「打开示例」试用。文件在本地处理，不超过 64 MiB；PNG 和 JPEG 图片最多 16,777,216 像素，相当于 4096 × 4096。",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "生成设计二维码",
        steps: [
          "在「设计信息」中填写「标题」「作者」和「岛屿／城镇」。多帧的 Aseprite 工程可在「帧」中选择要转换的帧，只合成可见图层。",
          "在「转换方式」中选择「单个设计」或「拆分为图块」。拆分时设置「图块宽度」和「图块高度」，需要时展开「偏移与间距」；可见的瓦片地图（Tilemap）图层默认按瓦片尺寸拆分。",
          "点「生成二维码」，在「转换结果」中检查颜色，再点「下载」保存当前设计的二维码 PNG。",
        ],
        notes:
          "每个设计为 32 × 32 像素，最多 15 种颜色加透明。图块按最近的像素缩放；不透明度低于一半的像素变为透明，其余像素变为不透明。所有图块共用一组取自《来吧！动物森友会》调色板的颜色。一次最多生成 256 个设计，「下载全部 N 个设计」会把它们打包成 ZIP。",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "导出已有设计",
        steps: [
          "打开含有普通设计二维码的 PNG 或 JPEG 图片，或打开 .acnl 文件。",
          "在「设计信息」中查看标题、作者和岛屿名称。",
          "点「下载」保存二维码 PNG。",
        ],
        notes:
          "已有设计按原始数据导出，标题、作者、调色板和像素都保持不变，也不能修改转换设置。只支持 32 × 32 的普通设计。",
      },
    ],
    closing:
      "导入《集合啦！动物森友会》时，在 Nintendo Switch App 中打开 NookLink →「我的设计」，扫描二维码，需要 Nintendo Switch Online 会员。拆分出的多个设计要逐个扫描：每扫描一个，先在游戏中下载，再扫描下一个。",
  },
  [PublicLanguage.English]: {
    title: "Make and import island designs",
    introduction:
      "Choose File → Open file… or drop a PNG, JPEG, .ase, .aseprite or .acnl file here. Use Open example to try it first. Files are processed on your device and can be up to 64 MiB; PNG and JPEG images can have up to 16,777,216 pixels, the same as 4096 × 4096.",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "Create design QR codes",
        steps: [
          "Under Design information, enter the Title, Creator and Island / town. For a multi-frame Aseprite project, choose the Frame to convert; only visible layers are merged.",
          "Under Convert as, choose One design or Split into tiles. For tiles, set Cell width and Cell height, and open Offsets and spacing if needed. A visible tilemap layer is split by its tile size by default.",
          "Click Generate QR codes, check the colors in Converted, then click Download to save the current design’s QR PNG.",
        ],
        notes:
          "Each design is 32 × 32 pixels with up to 15 colors plus transparency. Cells are scaled using the nearest pixel. Pixels less than half opaque become transparent, and the rest become opaque. All tiles share one set of colors from the Animal Crossing: New Leaf palette. One conversion makes up to 256 designs, and Download all N designs saves them as a ZIP.",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "Export an existing design",
        steps: [
          "Open a PNG or JPEG image of a normal design QR code, or open an .acnl file.",
          "Check the title, creator and island name under Design information.",
          "Click Download to save the QR PNG.",
        ],
        notes:
          "An existing design is exported from its original data, so its title, creator, palette and pixels stay unchanged, and conversion settings are unavailable. Only normal 32 × 32 designs are supported.",
      },
    ],
    closing:
      "To import a design into Animal Crossing: New Horizons, open NookLink → Designs in the Nintendo Switch App and scan the QR code. A Nintendo Switch Online membership is required. Scan split designs one at a time, downloading each in the game before scanning the next.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
