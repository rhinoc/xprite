import { pickText, publicLanguage, PublicLanguage } from "../site/language.ts";

const DEVICE_MEDIA_ROOT = "/showcase/devices/computer";
const WORKSPACE_MEDIA_ROOT = "/showcase/workspace-layout";

/** Editor captures shared by the feature pages; English and Chinese have their own captures. */
export function editorCaptureMedia(language: string) {
  const selected = publicLanguage(language);
  const text = (
    en: string,
    zh: string,
    ja: string,
    ko: string,
    ru: string,
    pt: string,
    es: string,
  ) => pickText(selected, en, zh, ja, ko, ru, pt, es);
  // Captures exist for English and Chinese; other languages reuse the English ones.
  const capture = selected === PublicLanguage.SimplifiedChinese ? selected : PublicLanguage.English;
  return {
    animation: {
      src: `${DEVICE_MEDIA_ROOT}/${capture}/animation.png`,
      width: 1440,
      height: 840,
      alt: text(
        "The Xprite editor with layers and an eight-frame pixel animation",
        "Xprite 编辑器中的图层与八帧像素动画",
        "レイヤーと 8 フレームのドット絵アニメーションを表示した Xprite エディター",
        "레이어와 8프레임 도트 애니메이션이 보이는 Xprite 에디터",
        "Редактор Xprite со слоями и пиксельной анимацией из восьми кадров",
        "O editor Xprite com camadas e uma animação em pixel art de oito quadros",
        "El editor Xprite con capas y una animación pixel art de ocho cuadros",
      ),
      caption: text(
        "Layers and the animation timeline",
        "图层与动画时间轴",
        "レイヤーとアニメーションのタイムライン",
        "레이어와 애니메이션 타임라인",
        "Слои и таймлайн анимации",
        "Camadas e a linha do tempo da animação",
        "Capas y la línea de tiempo de la animación",
      ),
    },
    workspace: {
      src: `${WORKSPACE_MEDIA_ROOT}/${capture}/poster.png`,
      animationSrc: `${WORKSPACE_MEDIA_ROOT}/${capture}/layout.gif`,
      width: 1080,
      height: 720,
      alt: text(
        "Moving the Xprite timeline to the right, resizing it, and docking it at the bottom",
        "将 Xprite 时间线移到右侧、调整宽度，再停靠到底部",
        "Xprite のタイムラインを右に移動し、サイズを変えて、下にドッキングする様子",
        "Xprite 타임라인을 오른쪽으로 옮기고 크기를 바꾼 뒤 아래쪽에 도킹하는 모습",
        "Таймлайн Xprite перемещают вправо, меняют его размер и закрепляют внизу",
        "Movendo a linha do tempo do Xprite para a direita, redimensionando e encaixando embaixo",
        "Se mueve la línea de tiempo de Xprite a la derecha, se cambia su tamaño y se acopla abajo",
      ),
      caption: text(
        "Move, resize and dock panels.",
        "移动、调整大小和停靠面板。",
        "パネルを移動・リサイズ・ドッキング。",
        "패널을 옮기고, 크기를 바꾸고, 도킹하세요.",
        "Перемещайте, масштабируйте и закрепляйте панели.",
        "Mova, redimensione e encaixe painéis.",
        "Mueve, cambia el tamaño y acopla paneles.",
      ),
    },
  };
}
