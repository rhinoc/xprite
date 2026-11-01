import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum BeadsHelpSection {
  Overview = "fuse-beads-help",
  Pattern = "make-bead-pattern",
  Export = "export-bead-chart",
}

/** Pattern and export instructions for the fuse bead tool's static and interactive page. */
export const BEADS_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "拼豆图纸生成器",
    introduction:
      "把像素画或图片转成拼豆图纸。点「打开作品」，或拖入 PNG、JPEG、WebP 或 Aseprite 文件；也可以用「打开示例」试用。文件在本地处理，不超过 64 MiB，不会上传。",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "生成拼豆图案",
        steps: [
          "在「底板」组中选择「品牌」：MARD、Artkal、Perler 或 Hama。图案中的每颗豆子都换成该品牌最接近的颜色。",
          "输入底板的列数和行数（1 到 512），或从「预设」中选择 29 × 29、14 × 14 或 52 × 52。勾选「色号」会在图纸上标出每颗豆子的色号。",
          "Aseprite 工程有多帧时，在「采样方式」组中选择要使用的「帧」。",
        ],
        notes:
          "工具能识别出原有像素网格时，按网格逐格取色；否则用「采样方式」中的方法缩小图片。「用料」标签页列出每种色号需要的豆子数量。",
      },
      {
        id: BeadsHelpSection.Export,
        title: "导出图纸",
        steps: [
          "点「导出…」，选择 PNG 得到一张完整图纸，或选择 PDF 得到按底板分页的图纸和用料清单。",
          "点「继续编辑」，在 Xprite 编辑器中把图案作为新工程打开，每颗豆子对应一个像素。",
        ],
        notes: "图案很大时 PNG 可能超出尺寸上限，这时请导出 PDF。",
      },
    ],
    closing: "免费、无需账号、无需上传。原图不会被修改。",
  },
  [PublicLanguage.English]: {
    title: "Fuse bead pattern maker",
    introduction:
      "Turn pixel art or an image into a fuse bead chart. Click Open artwork or drop a PNG, JPEG, WebP or Aseprite file here; use Open example to try it first. Files up to 64 MiB are processed on your device and never uploaded.",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "Make a bead pattern",
        steps: [
          "In the Board group, choose a Brand: MARD, Artkal, Perler or Hama. Each bead in the pattern takes the brand's closest color.",
          "Enter the board columns and rows (1 to 512), or pick 29 × 29, 14 × 14 or 52 × 52 from Presets. Turn on Codes to print each bead's color code on the chart.",
          "For an Aseprite project with several frames, choose the Frame to use in the Sampling group.",
        ],
        notes:
          "When the tool finds the artwork's original pixel grid, it takes one color per grid cell; otherwise it scales the image with the method chosen under Sampling. The Materials tab lists how many beads each color code needs.",
      },
      {
        id: BeadsHelpSection.Export,
        title: "Export the chart",
        steps: [
          "Click Export… and choose PNG for one full chart, or PDF for a chart split into one page per board with a material list.",
          "Click Edit more to open the pattern in the Xprite editor as a new project, with one pixel per bead.",
        ],
        notes: "A very large pattern can exceed the PNG size limit; export a PDF instead.",
      },
    ],
    closing: "Free, no account, no upload. The original file is never changed.",
  },
  [PublicLanguage.Japanese]: {
    title: "アイロンビーズ図案メーカー",
    introduction:
      "ドット絵や画像をアイロンビーズの図案にします。「作品を開く」をクリックするか、PNG、JPEG、WebP、Aseprite ファイルをここにドロップします。「サンプルを開く」で試すこともできます。64 MiB までのファイルを端末内で処理し、アップロードはしません。",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "ビーズ図案を作る",
        steps: [
          "「ボード」グループで「ブランド」を MARD、Artkal、Perler、Hama から選びます。図案の各ビーズはそのブランドのいちばん近い色になります。",
          "ボードの列数と行数（1〜512）を入力するか、「プリセット」から 29 × 29、14 × 14、52 × 52 を選びます。「色番号」をオンにすると、図案に各ビーズの色番号が入ります。",
          "複数フレームの Aseprite プロジェクトでは、「サンプリング」グループで使う「フレーム」を選びます。",
        ],
        notes:
          "元のピクセルグリッドが見つかった場合はマスごとに色を取り、見つからない場合は「サンプリング」で選んだ方法で縮小します。「材料」タブに色番号ごとのビーズ数が表示されます。",
      },
      {
        id: BeadsHelpSection.Export,
        title: "図案をエクスポート",
        steps: [
          "「エクスポート…」をクリックし、1 枚の図案なら PNG、ボードごとのページと材料リストなら PDF を選びます。",
          "「さらに編集」をクリックすると、図案を 1 ビーズ 1 ピクセルの新しいプロジェクトとして Xprite エディターで開きます。",
        ],
        notes:
          "図案がとても大きいと PNG のサイズ上限を超えることがあります。その場合は PDF をエクスポートしてください。",
      },
    ],
    closing: "無料、アカウント不要、アップロードなし。元のファイルは変更されません。",
  },
  [PublicLanguage.Korean]: {
    title: "퓨즈 비즈 도안 메이커",
    introduction:
      "도트나 이미지를 퓨즈 비즈 도안으로 바꿉니다. 작품 열기를 클릭하거나 PNG, JPEG, WebP, Aseprite 파일을 여기에 끌어 놓으세요. 예제 열기로 먼저 사용해 볼 수도 있습니다. 64MiB까지의 파일을 기기에서 처리하며 업로드하지 않습니다.",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "비즈 도안 만들기",
        steps: [
          "보드 그룹에서 브랜드를 MARD, Artkal, Perler, Hama 중에서 고르세요. 도안의 각 비즈는 그 브랜드의 가장 가까운 색이 됩니다.",
          "보드의 열과 행(1~512)을 입력하거나 프리셋에서 29 × 29, 14 × 14, 52 × 52를 고르세요. 코드를 켜면 도안에 비즈마다 색 코드가 표시됩니다.",
          "프레임이 여러 개인 Aseprite 프로젝트는 샘플링 그룹에서 사용할 프레임을 고르세요.",
        ],
        notes:
          "원래 픽셀 격자를 찾으면 칸마다 색을 가져오고, 찾지 못하면 샘플링에서 고른 방법으로 이미지를 줄입니다. 재료 탭에 색 코드별 비즈 개수가 나옵니다.",
      },
      {
        id: BeadsHelpSection.Export,
        title: "도안 내보내기",
        steps: [
          "내보내기…를 클릭하고, 한 장짜리 도안은 PNG를, 보드별 페이지와 재료 목록은 PDF를 고르세요.",
          "더 편집을 클릭하면 도안을 비즈 하나당 픽셀 하나인 새 프로젝트로 Xprite 에디터에서 엽니다.",
        ],
        notes: "도안이 아주 크면 PNG 크기 한도를 넘을 수 있습니다. 이때는 PDF로 내보내세요.",
      },
    ],
    closing: "무료, 계정 불필요, 업로드 없음. 원본 파일은 바뀌지 않습니다.",
  },
  [PublicLanguage.Russian]: {
    title: "Генератор схем из термобусин",
    introduction:
      "Превратите пиксель-арт или изображение в схему из термобусин. Нажмите «Открыть рисунок» или перетащите сюда файл PNG, JPEG, WebP или Aseprite; чтобы сначала попробовать, нажмите «Открыть пример». Файлы до 64 МиБ обрабатываются на вашем устройстве и не загружаются.",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "Создание схемы",
        steps: [
          "В группе «Планшет» выберите «Бренд»: MARD, Artkal, Perler или Hama. Каждая бусина получает ближайший цвет этого бренда.",
          "Введите число столбцов и строк планшета (от 1 до 512) или выберите 29 × 29, 14 × 14 или 52 × 52 в «Шаблонах». Включите «Коды», чтобы на схеме был код цвета каждой бусины.",
          "Для проекта Aseprite с несколькими кадрами выберите нужный «Кадр» в группе «Выборка».",
        ],
        notes:
          "Если инструмент находит исходную пиксельную сетку, он берёт один цвет на клетку; иначе уменьшает изображение способом из «Выборки». На вкладке «Материалы» указано, сколько бусин нужно каждого цвета.",
      },
      {
        id: BeadsHelpSection.Export,
        title: "Экспорт схемы",
        steps: [
          "Нажмите «Экспорт…» и выберите PNG для одной общей схемы или PDF для схемы по страницам на каждый планшет со списком материалов.",
          "Нажмите «Доработать», чтобы открыть схему в редакторе Xprite как новый проект: одна бусина — один пиксель.",
        ],
        notes:
          "Очень большая схема может превысить предел размера PNG; в этом случае экспортируйте PDF.",
      },
    ],
    closing: "Бесплатно, без аккаунта и без загрузки. Исходный файл не изменяется.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Criador de padrões de miçangas",
    introduction:
      "Transforme pixel art ou uma imagem em um padrão de miçangas. Clique em Abrir arte ou solte aqui um arquivo PNG, JPEG, WebP ou Aseprite; use Abrir exemplo para testar antes. Arquivos de até 64 MiB são processados no seu dispositivo, sem upload.",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "Criar um padrão",
        steps: [
          "No grupo Placa, escolha uma Marca: MARD, Artkal, Perler ou Hama. Cada miçanga recebe a cor mais próxima da marca.",
          "Digite as colunas e linhas da placa (1 a 512) ou escolha 29 × 29, 14 × 14 ou 52 × 52 em Predefinições. Ative Códigos para mostrar o código de cor de cada miçanga.",
          "Em um projeto Aseprite com vários quadros, escolha o Quadro no grupo Amostragem.",
        ],
        notes:
          "Quando a ferramenta encontra a grade de pixels original, pega uma cor por célula; senão, reduz a imagem com o método escolhido em Amostragem. A aba Materiais mostra quantas miçangas cada código de cor precisa.",
      },
      {
        id: BeadsHelpSection.Export,
        title: "Exportar o padrão",
        steps: [
          "Clique em Exportar… e escolha PNG para um padrão inteiro ou PDF para uma página por placa com a lista de materiais.",
          "Clique em Editar mais para abrir o padrão no editor Xprite como um novo projeto, com um pixel por miçanga.",
        ],
        notes:
          "Um padrão muito grande pode passar do limite de tamanho do PNG; nesse caso, exporte em PDF.",
      },
    ],
    closing: "Grátis, sem conta e sem upload. O arquivo original não é alterado.",
  },
  [PublicLanguage.Spanish]: {
    title: "Creador de patrones de cuentas Hama",
    introduction:
      "Convierte pixel art o una imagen en un patrón de cuentas. Haz clic en Abrir dibujo o suelta aquí un archivo PNG, JPEG, WebP o Aseprite; usa Abrir ejemplo para probarlo primero. Los archivos de hasta 64 MiB se procesan en tu dispositivo y no se suben.",
    sections: [
      {
        id: BeadsHelpSection.Pattern,
        title: "Crear un patrón",
        steps: [
          "En el grupo Placa, elige una Marca: MARD, Artkal, Perler o Hama. Cada cuenta toma el color más parecido de esa marca.",
          "Escribe las columnas y filas de la placa (de 1 a 512) o elige 29 × 29, 14 × 14 o 52 × 52 en Predefinidos. Activa Códigos para mostrar el código de color de cada cuenta.",
          "En un proyecto de Aseprite con varios fotogramas, elige el Fotograma en el grupo Muestreo.",
        ],
        notes:
          "Si la herramienta encuentra la cuadrícula de píxeles original, toma un color por celda; si no, reduce la imagen con el método elegido en Muestreo. La pestaña Materiales indica cuántas cuentas necesita cada código de color.",
      },
      {
        id: BeadsHelpSection.Export,
        title: "Exportar el patrón",
        steps: [
          "Haz clic en Exportar… y elige PNG para un patrón completo o PDF para una página por placa con la lista de materiales.",
          "Haz clic en Editar más para abrir el patrón en el editor Xprite como un proyecto nuevo, con un píxel por cuenta.",
        ],
        notes:
          "Un patrón muy grande puede superar el límite de tamaño del PNG; en ese caso, exporta un PDF.",
      },
    ],
    closing: "Gratis, sin cuenta y sin subidas. El archivo original no cambia.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
