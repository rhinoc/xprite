import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

export enum NormalMapHelpSection {
  Overview = "normal-map-help",
  Options = "normal-map-options",
  Export = "export-normal-map",
}

/** Normal map generation instructions for the tool's static and interactive page. */
export const NORMAL_MAP_HELP = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "法线贴图生成器",
    introduction:
      "免费法线贴图生成器，无需上传。点「文件」→「打开图片…」，或拖入 PNG、JPEG、WebP 图片，把画面转成切线空间法线贴图。也可以用「打开示例」试用。文件在本地处理，图片不超过 64 MiB、1600 万像素。生成器与编辑器中的「生成法线贴图」使用同一套算法和参数。",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "调整生成参数",
        steps: [
          "在「法线贴图」组里选择预设：建筑、角色、物件或地形，每个预设有配套的参数组合。",
          "用「形状强度」控制轮廓起伏的幅度，用「法线强度」控制细节斜率，用「平滑」和「切面」调整表面的柔和程度。",
          "需要手绘光照时调大「绘制光照」并设置「光照角度」；勾选「合并轮廓」保留描边形状；勾选「反转 Y」可输出 DirectX 风格的绿色通道。",
        ],
        notes:
          "参数修改后预览会立即重新生成。预设只重设强度类参数，不影响「反转 Y」和绘制光照设置。",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "导出法线贴图",
        steps: [
          "点「导出…」，选择「导出法线贴图（.png）」下载结果。",
          "点「继续编辑」可在 Xprite 编辑器中把法线贴图作为新工程打开，与原图分图层组合或继续重绘。",
        ],
        notes:
          "导出的 PNG 与源图同尺寸，文件名在原文件名后加 -normal。常规 OpenGL 风格使用默认输出；需要 DirectX 风格时先勾选「反转 Y」再导出。",
      },
    ],
    closing:
      "免费、无需账号、无需上传。如果源图是照片或插画，先用「图片转像素画」工具转成像素画再生成法线，效果更接近手绘打光图。",
  },
  [PublicLanguage.English]: {
    title: "Normal map generator",
    introduction:
      "Free normal map generator—no upload. Choose File → Open image… or drop a PNG, JPEG or WebP image to turn it into a tangent-space normal map. Use Open example to try it first. Files are processed on your device; an image can be up to 64 MiB and 16 million pixels. The generator shares the same algorithm and parameters as the editor's Generate Normal Map.",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "Adjust generation settings",
        steps: [
          "Under Normal map, pick a preset: Architecture, Character, Object or Terrain. Each preset ships a tuned parameter set.",
          "Use Shape strength for silhouette depth, Normal strength for surface slope detail, and Smoothing and Facets for how soft the surface reads.",
          "Raise Painted light and set Light angle to fold hand-painted shading into the map; enable Merge outlines to keep inked outlines as shapes; enable Invert Y for DirectX-style green output.",
        ],
        notes:
          "The preview regenerates as soon as a parameter changes. Picking a preset resets only the strength-type sliders; it keeps Invert Y and the painted light settings.",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "Export the normal map",
        steps: [
          "Click Export… and choose Export normal map (.png) to download the result.",
          "Click Edit more to open the normal map in the Xprite editor as a new project, where you can layer it with the original artwork or repaint regions.",
        ],
        notes:
          "The exported PNG keeps the source dimensions and uses the source file name with a -normal suffix. The default output is OpenGL-style; enable Invert Y before exporting for DirectX-style maps.",
      },
    ],
    closing:
      "Free, no account, no upload. If the source is a photo or illustration, convert it with the Image to Pixel Art tool first—the generated map then follows hand-placed shading instead of photographic gradients.",
  },
  [PublicLanguage.Japanese]: {
    title: "ノーマルマップジェネレーター",
    introduction:
      "無料のノーマルマップジェネレーター——アップロード不要。「ファイル」→「画像を開く…」を選ぶか、PNG・JPEG・WebP 画像をドラッグして、接線空間ノーマルマップに変換します。「例を開く」で先に試せます。ファイルは端末上で処理され、画像は 64 MiB・1,600 万ピクセルまでです。エディターの「ノーマルマップ生成」と同じアルゴリズムとパラメーターを使用します。",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "生成設定の調整",
        steps: [
          "「ノーマルマップ」グループでプリセットを選びます：建築、キャラクター、オブジェクト、地形。プリセットごとに調整済みのパラメーターがあります。",
          "「形状の強さ」でシルエットの起伏、「法線の強さ」で表面の細かな斜面、「スムージング」と「ファセット」で表面の柔らかさを調整します。",
          "手描きの陰影を反映するには「描画ライト」を上げて「光の角度」を設定します。「輪郭を統合」で輪郭線を形状として保持し、「Y を反転」で DirectX 形式の緑チャンネルを出力します。",
        ],
        notes:
          "パラメーターを変更するとプレビューはすぐに再生成されます。プリセットを選ぶと強度系の値だけがリセットされ、「Y を反転」と描画ライト設定は保持されます。",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "ノーマルマップの書き出し",
        steps: [
          "「書き出し…」→「ノーマルマップを書き出す (.png)」を選んで結果をダウンロードします。",
          "「さらに編集」を押すと、ノーマルマップを Xprite エディターの新規プロジェクトとして開き、元画像とレイヤーで組み合わせたり再描画したりできます。",
        ],
        notes:
          "書き出す PNG は元画像と同じサイズで、ファイル名は元の名前に -normal を付けたものになります。既定は OpenGL 形式です。DirectX 形式が必要な場合は「Y を反転」を有効にしてから書き出してください。",
      },
    ],
    closing:
      "無料・アカウント不要・アップロード不要。元画像が写真やイラストの場合は、先に「画像からドット絵へ」ツールでドット絵化してから生成すると、手描きの陰影に沿ったマップになります。",
  },
  [PublicLanguage.Korean]: {
    title: "노멀 맵 생성기",
    introduction:
      "무료 노멀 맵 생성기 — 업로드 불필요. 파일 → 이미지 열기…를 선택하거나 PNG, JPEG, WebP 이미지를 끌어 놓으면 접선 공간 노멀 맵으로 변환합니다. 예제 열기로 먼저 체험할 수 있습니다. 파일은 기기에서 처리되며 이미지는 64 MiB, 1,600만 픽셀까지 지원합니다. 에디터의 '노멀 맵 생성'과 같은 알고리즘과 매개변수를 사용합니다.",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "생성 설정 조정",
        steps: [
          "'노멀 맵' 그룹에서 프리셋을 선택하세요: 건축, 캐릭터, 오브젝트, 지형. 각 프리셋에는 조정된 매개변수 세트가 있습니다.",
          "'형태 강도'로 실루엣 굴곡을, '노멀 강도'로 표면 경사 디테일을, '스무딩'과 '패싯'으로 표면의 부드러움을 조정합니다.",
          "손으로 그린 명암을 반영하려면 '페인티드 라이트'를 올리고 '광원 각도'를 설정하세요. '외곽선 병합'은 윤곽선을 형태로 유지하고, 'Y 반전'은 DirectX 스타일의 녹색 채널을 출력합니다.",
        ],
        notes:
          "매개변수를 바꾸면 미리보기가 바로 다시 생성됩니다. 프리셋을 선택하면 강도 계열 슬라이더만 초기화되고 'Y 반전'과 페인티드 라이트 설정은 유지됩니다.",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "노멀 맵 내보내기",
        steps: [
          "'내보내기…'에서 '노멀 맵 내보내기 (.png)'를 선택해 결과를 다운로드합니다.",
          "'더 편집하기'를 누르면 노멀 맵이 Xprite 에디터에서 새 프로젝트로 열리며, 원본 이미지와 레이어로 합치거나 다시 칠할 수 있습니다.",
        ],
        notes:
          "내보내는 PNG는 원본과 같은 크기이며 파일 이름은 원본 이름 뒤에 -normal이 붙습니다. 기본 출력은 OpenGL 스타일이며, DirectX 스타일이 필요하면 'Y 반전'을 켠 뒤 내보내세요.",
      },
    ],
    closing:
      "무료, 계정 불필요, 업로드 불필요. 원본이 사진이나 일러스트라면 먼저 '이미지 픽셀 아트 변환기'로 픽셀 아트로 만든 뒤 생성하면 손으로 그린 명암을 따르는 맵이 됩니다.",
  },
  [PublicLanguage.Russian]: {
    title: "Генератор карт нормалей",
    introduction:
      "Бесплатный генератор карт нормалей — без загрузки. Выберите «Файл» → «Открыть изображение…» или перетащите PNG, JPEG или WebP, чтобы превратить его в карту нормалей в касательном пространстве. «Открыть пример» позволяет сначала попробовать инструмент. Файлы обрабатываются на устройстве: изображение до 64 МиБ и 16 млн пикселей. Используется тот же алгоритм и параметры, что в редакторе «Создать карту нормалей».",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "Настройка генерации",
        steps: [
          "В группе «Карта нормалей» выберите пресет: архитектура, персонаж, объект или ландшафт — у каждого свой набор параметров.",
          "«Сила формы» задаёт глубину силуэта, «Сила нормалей» — детализацию наклонов поверхности, «Сглаживание» и «Грани» — мягкость поверхности.",
          "Увеличьте «Рисованный свет» и задайте «Угол света», чтобы учесть ручную штриховку; «Объединить контуры» сохраняет обводку как форму; «Инвертировать Y» выводит зелёный канал в стиле DirectX.",
        ],
        notes:
          "Предпросмотр пересчитывается сразу после изменения параметра. Выбор пресета сбрасывает только ползунки силы; «Инвертировать Y» и настройки рисованного света сохраняются.",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "Экспорт карты нормалей",
        steps: [
          "Нажмите «Экспорт…» и выберите «Экспорт карты нормалей (.png)», чтобы скачать результат.",
          "«Редактировать дальше» открывает карту нормалей в редакторе Xprite как новый проект — её можно совместить с исходным изображением слоями или перерисовать.",
        ],
        notes:
          "Экспортируемый PNG сохраняет размеры исходника, имя файла дополняется суффиксом -normal. По умолчанию вывод в стиле OpenGL; для стиля DirectX включите «Инвертировать Y» перед экспортом.",
      },
    ],
    closing:
      "Бесплатно, без аккаунта и загрузки. Если исходник — фото или иллюстрация, сначала преобразуйте его инструментом «Изображение в пиксель-арт»: карта будет следовать ручной штриховке, а не фотографическим градиентам.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Gerador de normal map",
    introduction:
      "Gerador de normal map gratuito — sem upload. Escolha Arquivo → Abrir imagem… ou arraste uma imagem PNG, JPEG ou WebP para transformá-la em um normal map em espaço tangente. Use Abrir exemplo para experimentar. Os arquivos são processados no dispositivo; imagens de até 64 MiB e 16 milhões de pixels. O gerador usa o mesmo algoritmo e parâmetros do Gerar Normal Map do editor.",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "Ajustar a geração",
        steps: [
          "No grupo Normal map, escolha um preset: arquitetura, personagem, objeto ou terreno — cada um com um conjunto ajustado de parâmetros.",
          "Use Força da forma para a profundidade da silhueta, Força da normal para o detalhe de inclinação da superfície, e Suavização e Facetas para a leitura de suavidade da superfície.",
          "Aumente Luz pintada e defina Ângulo da luz para incorporar o sombreamento pintado à mão; Mesclar contornos mantém as linhas de contorno como formas; Inverter Y gera o canal verde no estilo DirectX.",
        ],
        notes:
          "A prévia é regenerada assim que um parâmetro muda. Escolher um preset redefine apenas os controles de força; Inverter Y e as configurações de luz pintada são mantidos.",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "Exportar o normal map",
        steps: [
          "Clique em Exportar… e escolha Exportar normal map (.png) para baixar o resultado.",
          "Clique em Editar mais para abrir o normal map no editor Xprite como um novo projeto, combinável com a arte original em camadas ou pronto para repintura.",
        ],
        notes:
          "O PNG exportado mantém as dimensões da origem e usa o nome do arquivo com o sufixo -normal. A saída padrão é estilo OpenGL; ative Inverter Y antes de exportar para o estilo DirectX.",
      },
    ],
    closing:
      "Gratuito, sem conta e sem upload. Se a origem é uma foto ou ilustração, converta antes com a ferramenta Imagem para Pixel Art — o mapa gerado segue o sombreamento feito à mão em vez de gradientes fotográficos.",
  },
  [PublicLanguage.Spanish]: {
    title: "Generador de mapas normales",
    introduction:
      "Generador de mapas normales gratuito — sin subir archivos. Elige Archivo → Abrir imagen… o suelta una imagen PNG, JPEG o WebP para convertirla en un mapa normal en espacio tangente. Usa Abrir ejemplo para probarlo. Los archivos se procesan en tu dispositivo; hasta 64 MiB y 16 millones de píxeles. El generador comparte el mismo algoritmo y parámetros que Generar mapa normal del editor.",
    sections: [
      {
        id: NormalMapHelpSection.Options,
        title: "Ajustar la generación",
        steps: [
          "En el grupo Mapa normal, elige un preset: arquitectura, personaje, objeto o terreno — cada uno con su conjunto de parámetros.",
          "Usa Fuerza de forma para la profundidad de la silueta, Fuerza de normal para el detalle de pendientes, y Suavizado y Facetas para la suavidad de la superficie.",
          "Sube Luz pintada y define Ángulo de luz para incorporar el sombreado pintado a mano; Combinar contornos mantiene las líneas como formas; Invertir Y genera el canal verde al estilo DirectX.",
        ],
        notes:
          "La vista previa se regenera en cuanto cambia un parámetro. Elegir un preset solo restablece los controles de fuerza; Invertir Y y la luz pintada se conservan.",
      },
      {
        id: NormalMapHelpSection.Export,
        title: "Exportar el mapa normal",
        steps: [
          "Haz clic en Exportar… y elige Exportar mapa normal (.png) para descargar el resultado.",
          "Editar más abre el mapa normal en el editor Xprite como un proyecto nuevo, donde puedes combinarlo con la ilustración original en capas o repintarlo.",
        ],
        notes:
          "El PNG exportado conserva las dimensiones de la fuente y usa el nombre del archivo con el sufijo -normal. La salida predeterminada es estilo OpenGL; activa Invertir Y antes de exportar para el estilo DirectX.",
      },
    ],
    closing:
      "Gratis, sin cuenta y sin subir archivos. Si la fuente es una foto o ilustración, conviértela primero con la herramienta Imagen a pixel art: el mapa seguirá el sombreado colocado a mano en lugar de degradados fotográficos.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
