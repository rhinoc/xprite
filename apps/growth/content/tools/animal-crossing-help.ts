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
          "在「转换结果」中检查颜色，再点「导出…」，选择「二维码（.png）」保存当前设计的二维码 PNG。",
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
          "点「导出…」，选择「二维码（.png）」保存二维码 PNG。",
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
          "Check the colors in Converted, then click Export… and choose QR code (.png) to save the current design’s QR PNG.",
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
          "Click Export… and choose QR code (.png) to save the QR PNG.",
        ],
        notes:
          "An existing design is exported from its original data, so its title, creator, palette and pixels stay unchanged, and conversion settings are unavailable. Only normal 32 × 32 designs are supported.",
      },
    ],
    closing:
      "To import a design into Animal Crossing: New Horizons, open NookLink → Designs in the Nintendo Switch App and scan the QR code. A Nintendo Switch Online membership is required. Scan split designs one at a time, downloading each in the game before scanning the next.",
  },
  [PublicLanguage.Japanese]: {
    title: "島のマイデザインを作って読み込む",
    introduction:
      "「ファイル」→「ファイルを開く…」を選ぶか、PNG、JPEG、.ase、.aseprite、.acnl ファイルをここにドロップします。「サンプルを開く」で試すこともできます。ファイルは端末内で処理され、最大 64 MiB まで扱えます。PNG と JPEG は最大 16,777,216 ピクセル（4096 × 4096 と同じ）までです。",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "マイデザインの QR コードを作成",
        steps: [
          "「マイデザインの情報」で「タイトル」「作者」「島・村」を入力します。複数フレームの Aseprite プロジェクトでは、変換する「フレーム」を選びます。結合されるのは表示中のレイヤーだけです。",
          "「変換方法」で「マイデザイン 1 枚」か「タイルに分割」を選びます。タイルの場合は「マスの幅」と「マスの高さ」を設定し、必要に応じて「オフセットと間隔」を開きます。表示中のタイルマップレイヤーは、初期設定でそのタイルサイズで分割されます。",
          "「変換後」で色を確認してから「エクスポート…」をクリックし、「QRコード（.png）」を選ぶと、現在のマイデザインの QR PNG を保存できます。",
        ],
        notes:
          "各マイデザインは 32 × 32 ピクセルで、最大 15 色と透明を使えます。マスはニアレストネイバー法で拡大縮小されます。不透明度が半分未満のピクセルは透明に、それ以外は不透明になります。すべてのタイルは『とびだせ どうぶつの森』のパレットから選ばれた 1 組の色を共有します。1 回の変換で最大 256 枚のマイデザインを作成でき、「マイデザイン N 枚をすべてダウンロード」で ZIP にまとめて保存できます。",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "既存のマイデザインをエクスポート",
        steps: [
          "通常のマイデザインの QR コードを写した PNG・JPEG 画像か、.acnl ファイルを開きます。",
          "「マイデザインの情報」でタイトル、作者、島の名前を確認します。",
          "「エクスポート…」をクリックし、「QRコード（.png）」を選んで QR PNG を保存します。",
        ],
        notes:
          "既存のマイデザインは元のデータからエクスポートされるため、タイトル、作者、パレット、ピクセルは変わらず、変換の設定は使えません。対応しているのは 32 × 32 の通常のマイデザインだけです。",
      },
    ],
    closing:
      "『あつまれ どうぶつの森』にマイデザインを読み込むには、Nintendo Switch Online アプリで「たぬきポータル」→「マイデザイン」を開き、QR コードを読み取ります。Nintendo Switch Online への加入が必要です。分割したマイデザインは 1 枚ずつ読み取り、次を読み取る前にゲーム内でダウンロードしてください。",
  },
  [PublicLanguage.Korean]: {
    title: "섬 마이 디자인 만들고 가져오기",
    introduction:
      "파일 → 파일 열기…를 선택하거나 PNG, JPEG, .ase, .aseprite, .acnl 파일을 여기에 끌어 놓으세요. 예제 열기로 먼저 사용해 볼 수도 있습니다. 파일은 기기에서 처리되며 최대 64MiB까지 지원합니다. PNG와 JPEG 이미지는 최대 16,777,216픽셀(4096 × 4096과 같음)까지입니다.",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "마이 디자인 QR 코드 만들기",
        steps: [
          "마이 디자인 정보에 제목, 제작자, 섬 / 마을을 입력하세요. 프레임이 여러 개인 Aseprite 프로젝트는 변환할 프레임을 고르세요. 보이는 레이어만 합쳐집니다.",
          "변환 방식에서 마이 디자인 한 장 또는 타일로 나누기를 고르세요. 타일로 나눌 때는 칸 너비와 칸 높이를 정하고, 필요하면 오프셋과 간격을 여세요. 보이는 타일맵 레이어는 기본적으로 해당 타일 크기로 나뉩니다.",
          "QR 코드 생성을 클릭하고 변환됨에서 색을 확인한 뒤 다운로드를 클릭해 현재 마이 디자인의 QR PNG를 저장하세요.",
        ],
        notes:
          "마이 디자인 한 장은 32 × 32픽셀이며 최대 15색과 투명을 쓸 수 있습니다. 칸은 최근접 픽셀 방식으로 크기가 조정됩니다. 불투명도가 절반 미만인 픽셀은 투명해지고 나머지는 불투명해집니다. 모든 타일은 『튀어나와요 동물의 숲』 팔레트에서 고른 한 세트의 색을 공유합니다. 한 번에 최대 256장의 마이 디자인을 만들 수 있으며, 마이 디자인 N개 모두 다운로드로 ZIP 파일에 담아 저장할 수 있습니다.",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "기존 마이 디자인 내보내기",
        steps: [
          "일반 마이 디자인 QR 코드가 담긴 PNG·JPEG 이미지나 .acnl 파일을 여세요.",
          "마이 디자인 정보에서 제목, 제작자, 섬 이름을 확인하세요.",
          "다운로드를 클릭해 QR PNG를 저장하세요.",
        ],
        notes:
          "기존 마이 디자인은 원본 데이터에서 내보내므로 제목, 제작자, 팔레트, 픽셀이 그대로 유지되며 변환 설정은 사용할 수 없습니다. 32 × 32 일반 마이 디자인만 지원합니다.",
      },
    ],
    closing:
      "『모여봐요 동물의 숲』에 마이 디자인을 가져오려면 Nintendo Switch Online 앱에서 너굴 포털 → 마이 디자인을 열고 QR 코드를 스캔하세요. Nintendo Switch Online 가입이 필요합니다. 나눈 마이 디자인은 한 장씩 스캔하고, 다음 장을 스캔하기 전에 게임에서 내려받으세요.",
  },
  [PublicLanguage.Russian]: {
    title: "Создание и импорт дизайнов для острова",
    introduction:
      "Выберите «Файл» → «Открыть файл…» или перетащите сюда файл PNG, JPEG, .ase, .aseprite или .acnl. Чтобы сначала попробовать, нажмите «Открыть пример». Файлы обрабатываются на вашем устройстве и могут весить до 64 МиБ; изображения PNG и JPEG — до 16 777 216 пикселей, то есть 4096 × 4096.",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "Создание QR-кодов дизайнов",
        steps: [
          "В разделе «Сведения о дизайне» введите название, автора и остров / город. Для многокадрового проекта Aseprite выберите кадр для преобразования; объединяются только видимые слои.",
          "В «Преобразовать как» выберите «Один дизайн» или «Разбить на тайлы». Для тайлов задайте ширину и высоту ячейки и при необходимости откройте «Смещения и интервалы». Видимый слой тайлмапа по умолчанию делится по размеру своих тайлов.",
          "Нажмите «Создать QR-коды», проверьте цвета на вкладке «Результат», затем нажмите «Скачать», чтобы сохранить QR текущего дизайна в PNG.",
        ],
        notes:
          "Каждый дизайн — 32 × 32 пикселя, до 15 цветов плюс прозрачность. Ячейки масштабируются по ближайшему пикселю. Пиксели с непрозрачностью меньше половины становятся прозрачными, остальные — непрозрачными. Все тайлы используют один набор цветов из палитры Animal Crossing: New Leaf. За одно преобразование создаётся до 256 дизайнов, а «Скачать все дизайны» сохраняет их в ZIP.",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "Экспорт готового дизайна",
        steps: [
          "Откройте изображение PNG или JPEG с QR-кодом обычного дизайна или файл .acnl.",
          "Проверьте название, автора и остров в разделе «Сведения о дизайне».",
          "Нажмите «Скачать», чтобы сохранить QR в PNG.",
        ],
        notes:
          "Готовый дизайн экспортируется из исходных данных, поэтому название, автор, палитра и пиксели не меняются, а настройки преобразования недоступны. Поддерживаются только обычные дизайны 32 × 32.",
      },
    ],
    closing:
      "Чтобы импортировать дизайн в Animal Crossing: New Horizons, откройте NookLink → Designs в Nintendo Switch App и отсканируйте QR-код. Нужна подписка Nintendo Switch Online. Разделённые дизайны сканируйте по одному и скачивайте каждый в игре перед сканированием следующего.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Criar e importar designs para a ilha",
    introduction:
      "Escolha Arquivo → Abrir arquivo… ou solte aqui um arquivo PNG, JPEG, .ase, .aseprite ou .acnl. Use Abrir exemplo para testar antes. Os arquivos são processados no seu dispositivo e podem ter até 64 MiB; imagens PNG e JPEG podem ter até 16.777.216 pixels, o mesmo que 4096 × 4096.",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "Criar QR codes de designs",
        steps: [
          "Em Informações do design, preencha Título, Criador e Ilha / cidade. Em um projeto do Aseprite com vários quadros, escolha o Quadro a converter; só as camadas visíveis são mescladas.",
          "Em Converter como, escolha Um design ou Dividir em tiles. Para tiles, defina Largura da célula e Altura da célula e abra Deslocamentos e espaçamento se precisar. Uma camada de tilemap visível é dividida pelo tamanho dos tiles por padrão.",
          "Clique em Gerar QR codes, confira as cores em Convertido e clique em Baixar para salvar o QR PNG do design atual.",
        ],
        notes:
          "Cada design tem 32 × 32 pixels, com até 15 cores mais transparência. As células são redimensionadas pelo pixel mais próximo. Pixels com menos da metade de opacidade ficam transparentes, e o resto fica opaco. Todos os tiles compartilham um conjunto de cores da paleta do Animal Crossing: New Leaf. Uma conversão gera até 256 designs, e Baixar todos os N designs salva tudo em um ZIP.",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "Exportar um design existente",
        steps: [
          "Abra uma imagem PNG ou JPEG de um QR code de design normal ou um arquivo .acnl.",
          "Confira o título, o criador e o nome da ilha em Informações do design.",
          "Clique em Baixar para salvar o QR PNG.",
        ],
        notes:
          "Um design existente é exportado a partir dos dados originais, então título, criador, paleta e pixels não mudam, e as configurações de conversão ficam indisponíveis. Só designs normais de 32 × 32 são compatíveis.",
      },
    ],
    closing:
      "Para importar um design no Animal Crossing: New Horizons, abra NookLink → Designs no Nintendo Switch App e escaneie o QR code. É preciso ter assinatura do Nintendo Switch Online. Escaneie designs divididos um por vez, baixando cada um no jogo antes de escanear o próximo.",
  },
  [PublicLanguage.Spanish]: {
    title: "Crear e importar diseños para tu isla",
    introduction:
      "Elige Archivo → Abrir archivo… o suelta aquí un archivo PNG, JPEG, .ase, .aseprite o .acnl. Usa Abrir ejemplo para probarlo primero. Los archivos se procesan en tu dispositivo y pueden pesar hasta 64 MiB; las imágenes PNG y JPEG pueden tener hasta 16 777 216 píxeles, lo mismo que 4096 × 4096.",
    sections: [
      {
        id: AnimalCrossingHelpSection.Convert,
        title: "Crear códigos QR de diseños",
        steps: [
          "En Información del diseño, escribe el Título, el Creador y la Isla / pueblo. En un proyecto de Aseprite con varios cuadros, elige el Cuadro que quieres convertir; solo se combinan las capas visibles.",
          "En Convertir como, elige Un diseño o Dividir en tiles. Para tiles, define Ancho de celda y Alto de celda, y abre Desplazamientos y espaciado si hace falta. Una capa de tilemap visible se divide por su tamaño de tile de forma predeterminada.",
          "Haz clic en Generar códigos QR, revisa los colores en Convertido y haz clic en Descargar para guardar el QR PNG del diseño actual.",
        ],
        notes:
          "Cada diseño mide 32 × 32 píxeles, con hasta 15 colores más transparencia. Las celdas se escalan con el píxel más cercano. Los píxeles con menos de la mitad de opacidad se vuelven transparentes y el resto, opacos. Todos los tiles comparten un conjunto de colores de la paleta de Animal Crossing: New Leaf. Una conversión crea hasta 256 diseños, y Descargar los N diseños los guarda en un ZIP.",
      },
      {
        id: AnimalCrossingHelpSection.Existing,
        title: "Exportar un diseño existente",
        steps: [
          "Abre una imagen PNG o JPEG del código QR de un diseño normal, o un archivo .acnl.",
          "Revisa el título, el creador y el nombre de la isla en Información del diseño.",
          "Haz clic en Descargar para guardar el QR PNG.",
        ],
        notes:
          "Un diseño existente se exporta desde sus datos originales, así que el título, el creador, la paleta y los píxeles no cambian, y los ajustes de conversión no están disponibles. Solo se admiten diseños normales de 32 × 32.",
      },
    ],
    closing:
      "Para importar un diseño en Animal Crossing: New Horizons, abre NookLink → Designs en Nintendo Switch App y escanea el código QR. Se necesita una suscripción a Nintendo Switch Online. Escanea los diseños divididos de uno en uno y descarga cada uno en el juego antes de escanear el siguiente.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
