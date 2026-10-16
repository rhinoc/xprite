import { PublicLanguage } from "../site/language.ts";
import type { ToolHelpContent } from "./help.ts";

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
          "点「导出…」，选择「导出当前帧（.png）」。",
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
          "点「导出…」，选择「导出动画（.gif）」。只有一帧的工程请导出 PNG。",
        ],
        notes:
          "GIF 按原画布尺寸导出，沿用标签的播放方向和重复次数。所有帧共用最多 256 色，半透明像素会变成不透明；帧时长以 10 毫秒为单位，不足的部分舍去，例如 25 毫秒变为 20 毫秒。动画过大时，选择更短的标签导出。",
      },
    ],
    closing:
      "PNG 和 GIF 不保留工程的图层与标签。需要修改或放大作品时，点「继续编辑」，编辑器会把原始工程作为新项目打开。",
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
          "Click Export… and choose Export current frame (.png).",
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
          "Click Export… and choose Export animation (.gif). For a single-frame project, export PNG instead.",
        ],
        notes:
          "The GIF uses the original canvas size and follows the tag’s direction and repeat count. Frames share up to 256 colors; semi-transparent pixels become opaque. Frame durations use 10 ms steps, dropping the remainder: 25 ms becomes 20 ms. If an animation is too large, export a shorter tag.",
      },
    ],
    closing:
      "PNG and GIF do not keep project layers or tags. To edit or resize your work, click Edit more to open the original project in the editor as a new project.",
  },
  [PublicLanguage.Japanese]: {
    title: "PNG と GIF をエクスポート",
    introduction:
      "「ファイル」→「ファイルを開く…」を選ぶか、.ase・.aseprite プロジェクトをここにドロップします。「サンプルを開く」で試すこともできます。ファイルは端末内で処理されます。レイヤーの表示・非表示はプレビューとエクスポートにだけ反映され、元のファイルは変更されません。",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "PNG をエクスポート",
        steps: [
          "タイムラインのフレームをクリックするか、左右の矢印キーで目的のフレームを選びます。",
          "レイヤー横の目のアイコンをクリックすると、そのレイヤーを非表示にできます。不透明な背景レイヤーを非表示にすると、背景を透明にしてエクスポートできます。",
          "「エクスポート…」をクリックし、「現在のフレームをエクスポート（.png）」を選びます。",
        ],
        notes:
          "PNG は現在のフレームの表示中レイヤーを結合したもので、半透明のピクセルを保持し、元のキャンバスサイズで出力されます。ファイル名は「プロジェクト名-frame-番号.png」で、フレーム番号は 1 から始まります。",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "GIF をエクスポート",
        steps: [
          "タイムラインのタグをクリックするか、「アニメーションの範囲」でタグを選びます。アニメーション全体は「すべてのフレーム」を選びます。タグのないプロジェクトはすべてのフレームをエクスポートします。",
          "レイヤー横の目のアイコンをクリックすると、そのレイヤーをエクスポートから外せます。",
          "「エクスポート…」をクリックし、「アニメーションをエクスポート（.gif）」を選びます。1 フレームだけのプロジェクトは PNG でエクスポートしてください。",
        ],
        notes:
          "GIF は元のキャンバスサイズで出力され、タグの再生方向と繰り返し回数に従います。全フレームで最大 256 色を共有し、半透明のピクセルは不透明になります。フレームの表示時間は 10 ミリ秒単位で、端数は切り捨てられます（25 ミリ秒は 20 ミリ秒）。アニメーションが大きすぎる場合は、短いタグを選んでエクスポートしてください。",
      },
    ],
    closing:
      "PNG と GIF にはプロジェクトのレイヤーやタグは残りません。作品を修正したり拡大したりするには、「さらに編集」をクリックすると、エディターで元のプロジェクトが開きます。",
  },
  [PublicLanguage.Korean]: {
    title: "PNG와 GIF 내보내기",
    introduction:
      "파일 → 파일 열기…를 선택하거나 .ase·.aseprite 프로젝트를 여기에 끌어 놓으세요. 예제 열기로 먼저 사용해 볼 수도 있습니다. 파일은 기기에서 처리됩니다. 레이어 표시 여부는 미리 보기와 내보내기에만 적용되며 원본 파일은 바뀌지 않습니다.",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "PNG 내보내기",
        steps: [
          "타임라인에서 프레임을 클릭하거나 왼쪽·오른쪽 방향키로 원하는 프레임을 고르세요.",
          "레이어 옆의 눈 아이콘을 클릭하면 레이어를 숨길 수 있습니다. 불투명한 배경 레이어를 숨기면 투명 배경으로 내보낼 수 있습니다.",
          "파일 → 현재 프레임 내보내기(.png)를 선택하세요.",
        ],
        notes:
          "PNG에는 현재 프레임의 보이는 레이어가 합쳐져 들어가며, 반투명 픽셀이 유지되고 원본 캔버스 크기로 저장됩니다. 파일 이름은 프로젝트-frame-번호.png이고 프레임 번호는 1부터 시작합니다.",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "GIF 내보내기",
        steps: [
          "타임라인의 태그를 클릭하거나 애니메이션 범위에서 태그를 고르세요. 애니메이션 전체를 내보내려면 모든 프레임을 선택합니다. 태그가 없는 프로젝트는 모든 프레임을 내보냅니다.",
          "레이어 옆의 눈 아이콘을 클릭하면 해당 레이어를 내보내기에서 뺄 수 있습니다.",
          "파일 → 애니메이션 내보내기(.gif)를 선택하세요. 프레임이 하나뿐인 프로젝트는 PNG로 내보내세요.",
        ],
        notes:
          "GIF는 원본 캔버스 크기로 저장되며 태그의 재생 방향과 반복 횟수를 따릅니다. 모든 프레임이 최대 256색을 공유하고, 반투명 픽셀은 불투명해집니다. 프레임 지속 시간은 10ms 단위이며 나머지는 버립니다. 예를 들어 25ms는 20ms가 됩니다. 애니메이션이 너무 크면 더 짧은 태그를 내보내세요.",
      },
    ],
    closing:
      "PNG와 GIF에는 프로젝트의 레이어와 태그가 남지 않습니다. 작품을 고치거나 크기를 바꾸려면 파일 → Xprite에서 편집을 선택해 에디터에서 원본 프로젝트를 여세요.",
  },
  [PublicLanguage.Russian]: {
    title: "Экспорт PNG и GIF",
    introduction:
      "Выберите «Файл» → «Открыть файл…» или перетащите сюда проект .ase или .aseprite. Чтобы сначала попробовать, нажмите «Открыть пример». Файлы обрабатываются на вашем устройстве. Видимость слоёв влияет только на предпросмотр и экспорт; исходный файл не меняется.",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "Экспорт PNG",
        steps: [
          "Щёлкните кадр на таймлайне или выберите его стрелками влево и вправо.",
          "Щёлкните значок глаза рядом со слоем, чтобы скрыть его. Скройте непрозрачный фоновый слой, чтобы экспортировать с прозрачным фоном.",
          "Выберите «Файл» → «Экспорт текущего кадра (.png)».",
        ],
        notes:
          "PNG объединяет видимые слои текущего кадра, сохраняет полупрозрачные пиксели и исходный размер холста. Файлы называются проект-frame-N.png, нумерация кадров начинается с 1.",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "Экспорт GIF",
        steps: [
          "Щёлкните метку на таймлайне или выберите её в «Диапазоне анимации». Для всей анимации выберите «Все кадры». Проекты без меток экспортируют все кадры.",
          "Щёлкните значок глаза рядом со слоем, чтобы исключить его из экспорта.",
          "Выберите «Файл» → «Экспорт анимации (.gif)». Проект из одного кадра экспортируйте в PNG.",
        ],
        notes:
          "GIF сохраняет исходный размер холста, направление и число повторов метки. Все кадры делят до 256 цветов; полупрозрачные пиксели становятся непрозрачными. Длительность кадров округляется вниз до 10 мс: 25 мс станут 20 мс. Если анимация слишком большая, экспортируйте более короткую метку.",
      },
    ],
    closing:
      "PNG и GIF не сохраняют слои и метки проекта. Чтобы отредактировать работу или изменить её размер, выберите «Файл» → «Редактировать в Xprite» — исходный проект откроется в редакторе.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Exportar PNG e GIF",
    introduction:
      "Escolha Arquivo → Abrir arquivo… ou solte aqui um projeto .ase ou .aseprite. Use Abrir exemplo para testar antes. Os arquivos são processados no seu dispositivo. A visibilidade das camadas afeta só a pré-visualização e a exportação; o arquivo original não muda.",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "Exportar PNG",
        steps: [
          "Clique em um quadro na linha do tempo ou use as setas para a esquerda e para a direita para selecioná-lo.",
          "Clique no olho ao lado de uma camada para ocultá-la. Oculte uma camada de fundo opaca para exportar com fundo transparente.",
          "Escolha Arquivo → Exportar quadro atual (.png).",
        ],
        notes:
          "O PNG mescla as camadas visíveis do quadro atual, mantém os pixels semitransparentes e usa o tamanho original da tela. Os arquivos se chamam projeto-frame-N.png, com a numeração começando em 1.",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "Exportar GIF",
        steps: [
          "Clique em uma tag da linha do tempo ou escolha uma em Intervalo da animação. Escolha Todos os quadros para a animação inteira. Projetos sem tags exportam todos os quadros.",
          "Clique no olho ao lado de uma camada para tirá-la da exportação.",
          "Escolha Arquivo → Exportar animação (.gif). Em projetos de um só quadro, exporte PNG.",
        ],
        notes:
          "O GIF usa o tamanho original da tela e segue a direção e o número de repetições da tag. Os quadros compartilham até 256 cores; pixels semitransparentes ficam opacos. As durações usam passos de 10 ms, descartando o resto: 25 ms viram 20 ms. Se a animação for grande demais, exporte uma tag mais curta.",
      },
    ],
    closing:
      "PNG e GIF não guardam as camadas nem as tags do projeto. Para editar ou redimensionar seu trabalho, escolha Arquivo → Editar no Xprite e abra o projeto original no editor.",
  },
  [PublicLanguage.Spanish]: {
    title: "Exportar PNG y GIF",
    introduction:
      "Elige Archivo → Abrir archivo… o suelta aquí un proyecto .ase o .aseprite. Usa Abrir ejemplo para probarlo primero. Los archivos se procesan en tu dispositivo. La visibilidad de las capas solo afecta a la vista previa y la exportación; tu archivo original no cambia.",
    sections: [
      {
        id: ViewerHelpSection.Png,
        title: "Exportar PNG",
        steps: [
          "Haz clic en un cuadro de la línea de tiempo o selecciónalo con las flechas izquierda y derecha.",
          "Haz clic en el ojo junto a una capa para ocultarla. Oculta una capa de fondo opaca para exportar con fondo transparente.",
          "Elige Archivo → Exportar cuadro actual (.png).",
        ],
        notes:
          "El PNG combina las capas visibles del cuadro actual, conserva los píxeles semitransparentes y usa el tamaño original del lienzo. Los archivos se llaman proyecto-frame-N.png, con la numeración desde 1.",
      },
      {
        id: ViewerHelpSection.Gif,
        title: "Exportar GIF",
        steps: [
          "Haz clic en una etiqueta de la línea de tiempo o elige una en Rango de animación. Elige Todos los cuadros para la animación completa. Los proyectos sin etiquetas exportan todos los cuadros.",
          "Haz clic en el ojo junto a una capa para excluirla de la exportación.",
          "Elige Archivo → Exportar animación (.gif). Si el proyecto tiene un solo cuadro, exporta PNG.",
        ],
        notes:
          "El GIF usa el tamaño original del lienzo y respeta la dirección y las repeticiones de la etiqueta. Los cuadros comparten hasta 256 colores; los píxeles semitransparentes se vuelven opacos. Las duraciones usan pasos de 10 ms y se descarta el resto: 25 ms pasan a 20 ms. Si la animación es demasiado grande, exporta una etiqueta más corta.",
      },
    ],
    closing:
      "PNG y GIF no conservan las capas ni las etiquetas del proyecto. Para editar o cambiar el tamaño de tu trabajo, elige Archivo → Editar en Xprite y se abrirá el proyecto original en el editor.",
  },
} as const satisfies Record<PublicLanguage, ToolHelpContent>;
