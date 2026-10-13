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
  [PublicLanguage.Japanese]: {
    title: "画像をドット絵化・グリッドを復元",
    introduction:
      "PNG、JPEG、WebP 画像を開くか、「サンプルを開く」でツールを試せます。画像は端末内で処理され、元のファイルが上書きされることはありません。",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "画像をドット絵に変換",
        steps: [
          "「操作」で「画像を変換」を選びます。サイズのプリセットを選ぶか、「幅」と「高さ」を入力します。",
          "「方式」を選び、プレビューを元の画像と見比べます。必要に応じて色数を制限したり、パレットを選んだりします。",
        ],
        notes:
          "「縦横比を固定」は元の比率を保ちます。「元のサイズを保持」はドット絵化した結果を元の画像サイズに拡大し直します。",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "拡大されたピクセルグリッドを復元",
        steps: [
          "「操作」で「ピクセルグリッドを復元」を選び、「自動グリッド」をオンのままにすると検出されたグリッドが使われます。",
          "信頼できるグリッドが検出されない場合は、「自動グリッド」をオフにして「マスの幅」と「マスの高さ」を入力します。",
        ],
        notes: "マスのサイズは元の画像のピクセル単位で指定します。",
      },
      {
        id: PixelateHelpSection.Result,
        title: "保存または編集を続ける",
        steps: [
          "「PNG をダウンロード」で結果を保存するか、「編集を続ける」で Xprite エディターで開きます。",
        ],
        notes:
          "PNG のファイル名は拡張子の前に -pixelated または -restored が付き、元のファイルは変更されません。",
      },
    ],
    closing: "プレビューは現在の設定で更新され、それぞれの結果を元の画像と見比べられます。",
  },
  [PublicLanguage.Korean]: {
    title: "이미지 픽셀화와 격자 복원",
    introduction:
      "PNG, JPEG, WebP 이미지를 열거나 예제 열기로 도구를 사용해 보세요. 이미지는 기기에서 처리되며 원본 파일을 덮어쓰지 않습니다.",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "이미지를 픽셀 아트로 변환",
        steps: [
          "작업에서 이미지 변환을 선택하세요. 크기 프리셋을 고르거나 너비와 높이를 입력하세요.",
          "방식을 고르고 미리 보기를 원본과 비교하세요. 필요하면 색 수를 제한하거나 팔레트를 선택하세요.",
        ],
        notes:
          "비율 고정은 원본 비율을 유지합니다. 원본 크기 유지는 픽셀화한 결과를 원본 이미지 크기로 다시 늘립니다.",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "확대된 픽셀 격자 복원",
        steps: [
          "작업에서 픽셀 격자 복원을 선택하고 자동 격자를 켜 두면 감지된 격자를 사용합니다.",
          "믿을 만한 격자가 감지되지 않으면 자동 격자를 끄고 칸 너비와 칸 높이를 입력하세요.",
        ],
        notes: "칸 크기는 원본 이미지의 픽셀 단위입니다.",
      },
      {
        id: PixelateHelpSection.Result,
        title: "저장하거나 계속 편집하기",
        steps: ["PNG 다운로드로 결과를 저장하거나, 계속 편집으로 Xprite 에디터에서 여세요."],
        notes:
          "PNG 파일 이름에는 확장자 앞에 -pixelated 또는 -restored가 붙으며 원본은 바뀌지 않습니다.",
      },
    ],
    closing: "미리 보기는 현재 설정에 맞춰 업데이트되며, 각 결과를 원본과 비교할 수 있습니다.",
  },
  [PublicLanguage.Russian]: {
    title: "Пикселизация изображения или восстановление сетки",
    introduction:
      "Откройте изображение PNG, JPEG или WebP либо нажмите «Открыть пример», чтобы попробовать. Изображения обрабатываются на вашем устройстве, исходный файл никогда не перезаписывается.",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "Превращение картинки в пиксель-арт",
        steps: [
          "В разделе «Действие» выберите «Преобразовать изображение». Выберите готовый размер или введите ширину и высоту.",
          "Выберите метод и сравните предпросмотр с оригиналом. При необходимости ограничьте цвета или выберите палитру.",
        ],
        notes:
          "«Сохранять пропорции» сохраняет соотношение сторон источника. «Сохранять исходный размер» масштабирует пиксельный результат обратно до размера исходного изображения.",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "Восстановление увеличенной пиксельной сетки",
        steps: [
          "В разделе «Действие» выберите «Восстановить пиксельную сетку» и оставьте автоопределение сетки включённым, чтобы использовать найденную сетку.",
          "Если надёжная сетка не найдена, отключите автоопределение и введите ширину и высоту ячейки.",
        ],
        notes: "Размер ячеек измеряется в пикселях исходного изображения.",
      },
      {
        id: PixelateHelpSection.Result,
        title: "Сохранение или дальнейшая правка",
        steps: [
          "Нажмите «Скачать PNG», чтобы сохранить результат, или «Продолжить редактирование», чтобы открыть его в редакторе Xprite.",
        ],
        notes:
          "К имени PNG перед расширением добавляется -pixelated или -restored; оригинал не меняется.",
      },
    ],
    closing:
      "Предпросмотр обновляется по текущим настройкам, и каждый результат можно сравнить с оригиналом.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Pixelizar uma imagem ou recuperar sua grade",
    introduction:
      "Abra uma imagem PNG, JPEG ou WebP, ou use Abrir exemplo para testar a ferramenta. As imagens são processadas no seu dispositivo, e o arquivo original nunca é sobrescrito.",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "Converter uma imagem em pixel art",
        steps: [
          "Em Ação, escolha Converter imagem. Escolha um tamanho predefinido ou informe Largura e Altura.",
          "Escolha um Método e compare a pré-visualização com o original. Limite as cores ou selecione uma paleta se precisar.",
        ],
        notes:
          "Travar proporção mantém as proporções da origem. Manter dimensões originais amplia o resultado pixelizado de volta ao tamanho da imagem de origem.",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "Recuperar uma grade de pixels ampliada",
        steps: [
          "Em Ação, escolha Recuperar grade de pixels e deixe Grade automática ativada para usar a grade detectada.",
          "Se nenhuma grade confiável for detectada, desative Grade automática e informe Largura da célula e Altura da célula.",
        ],
        notes: "O tamanho das células é medido em pixels da imagem original.",
      },
      {
        id: PixelateHelpSection.Result,
        title: "Salvar ou continuar editando",
        steps: [
          "Escolha Baixar PNG para salvar o resultado ou Continuar editando para abri-lo no editor Xprite.",
        ],
        notes:
          "O nome do PNG ganha -pixelated ou -restored antes da extensão; o original não muda.",
      },
    ],
    closing:
      "A pré-visualização acompanha as configurações atuais, e você pode comparar cada resultado com o original.",
  },
  [PublicLanguage.Spanish]: {
    title: "Pixelar una imagen o recuperar su cuadrícula",
    introduction:
      "Abre una imagen PNG, JPEG o WebP, o usa Abrir ejemplo para probar la herramienta. Las imágenes se procesan en tu dispositivo y el archivo original nunca se sobrescribe.",
    sections: [
      {
        id: PixelateHelpSection.Convert,
        title: "Convertir una imagen en pixel art",
        steps: [
          "En Acción, elige Convertir imagen. Escoge un tamaño predefinido o escribe Ancho y Alto.",
          "Elige un Método y compara la vista previa con el original. Limita los colores o selecciona una paleta si hace falta.",
        ],
        notes:
          "Bloquear relación de aspecto mantiene las proporciones de origen. Mantener dimensiones originales escala el resultado pixelado de vuelta al tamaño de la imagen original.",
      },
      {
        id: PixelateHelpSection.Recover,
        title: "Recuperar una cuadrícula de píxeles ampliada",
        steps: [
          "En Acción, elige Recuperar cuadrícula de píxeles y deja activada Cuadrícula automática para usar la cuadrícula detectada.",
          "Si no se detecta una cuadrícula fiable, desactiva Cuadrícula automática y escribe Ancho de celda y Alto de celda.",
        ],
        notes: "El tamaño de las celdas se mide en píxeles de la imagen original.",
      },
      {
        id: PixelateHelpSection.Result,
        title: "Guardar o seguir editando",
        steps: [
          "Elige Descargar PNG para guardar el resultado o Seguir editando para abrirlo en el editor Xprite.",
        ],
        notes:
          "El nombre del PNG añade -pixelated o -restored antes de la extensión; el original no cambia.",
      },
    ],
    closing:
      "La vista previa se actualiza con la configuración actual y puedes comparar cada resultado con el original.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
