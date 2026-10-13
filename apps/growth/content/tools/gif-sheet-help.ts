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
      "精灵表包含 GIF 的所有帧，不裁剪空白，也不合并重复帧。需要这些选项时，在 Xprite 编辑器中打开 GIF，在「导出」对话框中选择「精灵表」，再勾选「裁剪精灵」或「合并重复项」。",
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
      "The sheet includes every GIF frame without trimming empty space or merging duplicate frames. For those options, open the GIF in the Xprite editor, choose Sprite Sheet in the Export dialog, and check Trim Sprite or Merge Duplicates.",
  },
  [PublicLanguage.Japanese]: {
    title: "スプライトシートとフレームデータをエクスポート",
    introduction:
      "「ファイル」→「GIF を開く…」を選ぶか、GIF ファイルをここにドロップします。「サンプルを開く」で試すこともできます。ファイルは端末内で処理され、GIF は最大 64 MiB・10,000 フレームまで扱えます。各フレームは GIF のキャンバスサイズの 1 枚の画像に合成されてからシートに配置されます。",
    sections: [
      {
        id: GifSheetHelpSection.Png,
        title: "PNG スプライトシートをエクスポート",
        steps: [
          "「シートのレイアウト」で「レイアウト」を「行ごと」「列ごと」「横一列」「縦一列」から選びます。",
          "「行ごと」では「列数」に 1 行あたりのフレーム数を、「列ごと」では「行数」に 1 列あたりのフレーム数を設定します。初期値はフレーム数の平方根を切り上げた値です。",
          "必要に応じて「外周の余白」「フレームの間隔」「2 の累乗」を設定し、「ファイル」→「スプライトシートをエクスポート（.png）」を選びます。",
        ],
        notes:
          "フレームは GIF のキャンバスサイズのままで、拡大縮小やトリミングはされません。「外周の余白」と「フレームの間隔」は 0〜4096 px で、「2 の累乗」はシートの幅と高さを切り上げるだけです。シートの各辺は最大 32,768 px、合計 6,400 万ピクセルまでです。ファイル名は GIF の名前に拡張子 .png を付けたものです。",
      },
      {
        id: GifSheetHelpSection.Json,
        title: "JSON フレームデータをエクスポート",
        steps: [
          "「PNG スプライトシートをエクスポート」と同じ手順でレイアウトを設定します。",
          "「ファイル」→「フレームデータをエクスポート（.json）」を選びます。",
          "「ファイル」→「スプライトシートをエクスポート（.png）」を選ぶと、同じレイアウトのシートをエクスポートできます。",
        ],
        notes:
          "JSON は現在のレイアウトに対応しています。レイアウトを変えたら、PNG と JSON を一緒にエクスポートし直してください。frames 配列には再生順にフレームが並び、frame は各フレームのシート上の x・y・w・h、duration は GIF のフレーム表示時間（ミリ秒）です。フレーム名は name-N.png で、N は 0 から始まります。meta にはシートのファイル名とサイズが記録されますが、GIF のループ回数は含まれません。ファイル名は GIF の名前に拡張子 .json を付けたものです。",
      },
    ],
    closing:
      "シートには GIF のすべてのフレームが含まれ、余白のトリミングや重複フレームの統合は行われません。これらを使うには、GIF を Xprite エディターで開き、エクスポートダイアログで「スプライトシート」を選んで「スプライトをトリミング」や「重複を統合」にチェックを入れてください。",
  },
  [PublicLanguage.Korean]: {
    title: "스프라이트 시트와 프레임 데이터 내보내기",
    introduction:
      "파일 → GIF 열기…를 선택하거나 GIF 파일을 여기에 끌어 놓으세요. 예제 열기로 먼저 사용해 볼 수도 있습니다. 파일은 기기에서 처리되며, GIF는 최대 64MiB, 10,000프레임까지 지원합니다. 각 프레임은 GIF 캔버스 크기의 완전한 이미지로 합성된 뒤 시트에 배치됩니다.",
    sections: [
      {
        id: GifSheetHelpSection.Png,
        title: "PNG 스프라이트 시트 내보내기",
        steps: [
          "시트 레이아웃에서 레이아웃을 행 우선, 열 우선, 가로, 세로 중에서 고르세요.",
          "행 우선은 열에 한 행의 프레임 수를, 열 우선은 행에 한 열의 프레임 수를 설정하세요. 기본값은 프레임 수의 제곱근을 올림한 값입니다.",
          "필요하면 테두리 여백, 프레임 간격, 2의 거듭제곱을 설정한 다음 파일 → 스프라이트 시트 내보내기(.png)를 선택하세요.",
        ],
        notes:
          "프레임은 GIF 캔버스 크기를 유지하며 크기 조정이나 잘라내기를 하지 않습니다. 테두리 여백과 프레임 간격은 0~4096px이며, 2의 거듭제곱은 시트의 너비와 높이를 올림만 합니다. 시트의 각 변은 최대 32,768px, 전체는 최대 6,400만 픽셀입니다. 파일 이름은 GIF 이름에 .png 확장자를 붙인 것입니다.",
      },
      {
        id: GifSheetHelpSection.Json,
        title: "JSON 프레임 데이터 내보내기",
        steps: [
          "PNG 스프라이트 시트 내보내기와 같은 방법으로 레이아웃을 설정하세요.",
          "파일 → 프레임 데이터 내보내기(.json)를 선택하세요.",
          "파일 → 스프라이트 시트 내보내기(.png)를 선택하면 같은 레이아웃의 시트를 내보낼 수 있습니다.",
        ],
        notes:
          "JSON은 현재 레이아웃과 일치합니다. 레이아웃을 바꾼 뒤에는 PNG와 JSON을 함께 다시 내보내세요. frames 배열에는 재생 순서대로 프레임이 나열되며, frame은 시트에서 각 프레임의 x, y, w, h를, duration은 GIF 프레임 지속 시간(밀리초)을 나타냅니다. 프레임 이름은 name-N.png이고 N은 0부터 시작합니다. meta에는 시트의 파일 이름과 크기가 기록되지만 GIF 반복 횟수는 들어가지 않습니다. 파일 이름은 GIF 이름에 .json 확장자를 붙인 것입니다.",
      },
    ],
    closing:
      "시트에는 GIF의 모든 프레임이 들어가며, 빈 공간을 잘라내거나 중복 프레임을 합치지 않습니다. 이런 옵션이 필요하면 Xprite 에디터에서 GIF를 열고 내보내기 대화 상자에서 스프라이트 시트를 선택한 뒤 스프라이트 트리밍이나 중복 병합을 체크하세요.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
