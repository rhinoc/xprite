import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum FixAiPixelArtHelpSection {
  Overview = "fix-ai-pixel-art-help",
  Recover = "recover-ai-pixel-grid",
  Result = "save-fixed-result",
}

/** Instructions for fixing AI-generated or soft pixel art using grid recovery. */
export const FIX_AI_PIXEL_ART_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "修复 AI 生成的像素画",
    introduction:
      "打开模糊或 AI 生成的像素画图片（PNG、JPEG 或 WebP），自动将其对齐到真实的像素网格。图片在本地处理，源文件不会被覆盖。",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "恢复像素网格",
        steps: [
          "打开图片后，工具会自动检测并恢复原始像素网格。",
          "如果自动检测失败，可以关闭「自动网格」并手动输入「图块宽度」和「图块高度」。",
        ],
        notes: "单元格宽高按原图像素计算。可以选择不同的单元格颜色提取方式。",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "保存或继续编辑",
        steps: ["点「导出…」保存 PNG 结果，或点「继续编辑」在 Xprite 编辑器中继续绘制。"],
        notes: "导出 PNG 会在主文件名后添加 -fixed；原图保持不变。",
      },
    ],
    closing: "结果预览会实时更新；可以调整设置直到得到满意的结果。",
  },
  [PublicLanguage.English]: {
    title: "Fix AI-generated pixel art",
    introduction:
      "Open a soft or AI-generated pixel art image (PNG, JPEG, or WebP) and automatically snap it to a real pixel grid. Images are processed on your device, and the source file is never overwritten.",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "Recover the pixel grid",
        steps: [
          "After opening an image, the tool automatically detects and recovers the original pixel grid.",
          "If automatic detection fails, turn off Automatic grid and manually enter Cell width and Cell height.",
        ],
        notes: "Cell sizes are measured in pixels of the original image. You can choose different cell color extraction methods.",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "Save or continue editing",
        steps: [
          "Click Export… to save the PNG, or Edit more to open the result in the Xprite editor as a new project.",
        ],
        notes:
          "The PNG filename adds -fixed before the extension; the original stays unchanged.",
      },
    ],
    closing:
      "The preview updates with the current settings, and you can adjust them until you get the desired result.",
  },
  [PublicLanguage.Japanese]: {
    title: "AI 生成のドット絵を修正",
    introduction:
      "ぼやけた AI 生成のドット絵（PNG、JPEG、WebP）を開き、自動的に本物のピクセルグリッドに吸着させます。画像は端末内で処理され、元のファイルが上書きされることはありません。",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "ピクセルグリッドを復元",
        steps: [
          "画像を開くと、ツールが自動的に元のピクセルグリッドを検出して復元します。",
          "自動検出が失敗した場合は、「自動グリッド」をオフにして「マスの幅」と「マスの高さ」を手動で入力します。",
        ],
        notes: "マスのサイズは元の画像のピクセル単位で指定します。マスの色抽出方式を選べます。",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "保存または編集を続ける",
        steps: [
          "「エクスポート…」で PNG を保存するか、「さらに編集」で Xprite エディターに新しいプロジェクトとして開きます。",
        ],
        notes:
          "PNG のファイル名は拡張子の前に -fixed が付き、元のファイルは変更されません。",
      },
    ],
    closing: "プレビューは現在の設定で更新され、満足のいく結果が得られるまで調整できます。",
  },
  [PublicLanguage.Korean]: {
    title: "AI 생성 픽셀 아트 수정",
    introduction:
      "흐릿한 AI 생성 픽셀 아트 이미지(PNG, JPEG, WebP)를 열어 자동으로 실제 픽셀 격자에 맞춥니다. 이미지는 기기에서 처리되며 원본 파일을 덮어쓰지 않습니다.",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "픽셀 격자 복원",
        steps: [
          "이미지를 열면 도구가 자동으로 원본 픽셀 격자를 감지하고 복원합니다.",
          "자동 감지가 실패하면 자동 격자를 끄고 칸 너비와 칸 높이를 수동으로 입력하세요.",
        ],
        notes: "칸 크기는 원본 이미지의 픽셀 단위입니다. 다양한 칸 색상 추출 방법을 선택할 수 있습니다.",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "저장하거나 계속 편집하기",
        steps: ["PNG 다운로드로 결과를 저장하거나, 계속 편집으로 Xprite 에디터에서 여세요."],
        notes:
          "PNG 파일 이름에는 확장자 앞에 -fixed가 붙으며 원본은 바뀌지 않습니다.",
      },
    ],
    closing: "미리 보기는 현재 설정에 맞춰 업데이트되며, 원하는 결과를 얻을 때까지 조정할 수 있습니다.",
  },
  [PublicLanguage.Russian]: {
    title: "Исправление пиксель-арта, созданного ИИ",
    introduction:
      "Откройте размытое или созданное ИИ изображение пиксель-арта (PNG, JPEG или WebP) и автоматически привяжите его к настоящей пиксельной сетке. Изображения обрабатываются на вашем устройстве, исходный файл никогда не перезаписывается.",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "Восстановление пиксельной сетки",
        steps: [
          "После открытия изображения инструмент автоматически определяет и восстанавливает исходную пиксельную сетку.",
          "Если автоопределение не сработало, отключите автоопределение сетки и вручную введите ширину и высоту ячейки.",
        ],
        notes: "Размер ячеек измеряется в пикселях исходного изображения. Вы можете выбрать различные методы извлечения цвета ячеек.",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "Сохранение или дальнейшая правка",
        steps: [
          "Нажмите «Скачать PNG», чтобы сохранить результат, или «Продолжить редактирование», чтобы открыть его в редакторе Xprite.",
        ],
        notes:
          "К имени PNG перед расширением добавляется -fixed; оригинал не меняется.",
      },
    ],
    closing:
      "Предпросмотр обновляется по текущим настройкам, и вы можете их корректировать, пока не получите желаемый результат.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Consertar pixel art gerada por IA",
    introduction:
      "Abra uma imagem de pixel art suave ou gerada por IA (PNG, JPEG ou WebP) e ajuste-a automaticamente a uma grade de pixels real. As imagens são processadas no seu dispositivo, e o arquivo original nunca é sobrescrito.",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "Recuperar a grade de pixels",
        steps: [
          "Após abrir uma imagem, a ferramenta detecta e recupera automaticamente a grade de pixels original.",
          "Se a detecção automática falhar, desative Grade automática e informe manualmente Largura da célula e Altura da célula.",
        ],
        notes: "O tamanho das células é medido em pixels da imagem original. Você pode escolher diferentes métodos de extração de cor das células.",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "Salvar ou continuar editando",
        steps: [
          "Escolha Baixar PNG para salvar o resultado ou Continuar editando para abri-lo no editor Xprite.",
        ],
        notes:
          "O nome do PNG ganha -fixed antes da extensão; o original não muda.",
      },
    ],
    closing:
      "A pré-visualização acompanha as configurações atuais, e você pode ajustá-las até obter o resultado desejado.",
  },
  [PublicLanguage.Spanish]: {
    title: "Corregir pixel art generado por IA",
    introduction:
      "Abre una imagen de pixel art suave o generada por IA (PNG, JPEG o WebP) y ajústala automáticamente a una cuadrícula de píxeles real. Las imágenes se procesan en tu dispositivo y el archivo original nunca se sobrescribe.",
    sections: [
      {
        id: FixAiPixelArtHelpSection.Recover,
        title: "Recuperar la cuadrícula de píxeles",
        steps: [
          "Tras abrir una imagen, la herramienta detecta y recupera automáticamente la cuadrícula de píxeles original.",
          "Si la detección automática falla, desactiva Cuadrícula automática e introduce manualmente Ancho de celda y Alto de celda.",
        ],
        notes: "El tamaño de las celdas se mide en píxeles de la imagen original. Puedes elegir diferentes métodos de extracción de color de las celdas.",
      },
      {
        id: FixAiPixelArtHelpSection.Result,
        title: "Guardar o seguir editando",
        steps: [
          "Elige Descargar PNG para guardar el resultado o Seguir editando para abrirlo en el editor Xprite.",
        ],
        notes:
          "El nombre del PNG añade -fixed antes de la extensión; el original no cambia.",
      },
    ],
    closing:
      "La vista previa se actualiza con la configuración actual y puedes ajustarla hasta obtener el resultado deseado.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
