import { pickText, publicLanguage, PublicLanguage } from "../site/language.ts";
import { editorCaptureMedia } from "./capture-media.ts";
import { FEATURE_DETAIL_PATH, type FeatureMedia } from "./index.ts";

const ABOUT_IMAGES = "/about/images";
const ARTICLE_IMAGES = "/compare/articles/images";
const GUIDE_IMAGES = "/help/images";
const EXAMPLE_IMAGES = "/showcase/ipad/hello";
const ISLAND_PATTERN = "/tools/animal-crossing/acnh/winding-cobblestone.png";
const ISLAND_PATTERN_SOURCE =
  "https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/";

/** Each feature chooses a relevant original asset; filenames remain owned by their source scope. */
export function featureMedia(href: string, language: string): FeatureMedia | undefined {
  const selected = publicLanguage(language);
  // Chinese screenshots are the unsuffixed originals; other languages reuse the English captures.
  const chinese = selected === PublicLanguage.SimplifiedChinese;
  const suffix = chinese ? "" : "-en";
  const guideLanguage = chinese ? "zh" : "en";
  const text = (
    en: string,
    zh: string,
    ja: string,
    ko: string,
    ru: string,
    pt: string,
    es: string,
  ) => pickText(selected, en, zh, ja, ko, ru, pt, es);
  const shared = editorCaptureMedia(selected);
  const media: Record<string, FeatureMedia> = {
    [`${FEATURE_DETAIL_PATH}layers-and-colors/`]: {
      src: `${ARTICLE_IMAGES}/editor-with-aseprite${suffix}.png`,
      width: chinese ? 1180 : 1640,
      height: chinese ? 820 : 1240,
      alt: text(
        "The editor with a palette, two layers and animation frames",
        "编辑器中的调色板、两个图层和动画帧",
        "パレット、2 枚のレイヤー、アニメーションフレームが表示されたエディター",
        "팔레트, 레이어 두 개, 애니메이션 프레임이 보이는 에디터",
        "Редактор с палитрой, двумя слоями и кадрами анимации",
        "O editor com uma paleta, duas camadas e quadros de animação",
        "El editor con una paleta, dos capas y cuadros de animación",
      ),
      caption: text(
        "Palette and layer controls",
        "调色板和图层",
        "パレットとレイヤー",
        "팔레트와 레이어",
        "Палитра и слои",
        "Paleta e camadas",
        "Paleta y capas",
      ),
    },
    [`${FEATURE_DETAIL_PATH}frame-animation/`]: shared.animation,
    [`${FEATURE_DETAIL_PATH}workspace-layout/`]: shared.workspace,
    [`${FEATURE_DETAIL_PATH}aseprite-projects/`]: {
      src: `${ABOUT_IMAGES}/save-as-location${suffix}.png`,
      width: 720,
      height: 640,
      alt: text(
        "Save As with the Aseprite project format and device file location",
        "另存为窗口中的 Aseprite 工程格式与资源管理器保存位置",
        "Aseprite プロジェクト形式と端末の保存先を選んだ名前を付けて保存",
        "Aseprite 프로젝트 형식과 기기 저장 위치를 고른 다른 이름으로 저장",
        "«Сохранить как» с форматом проекта Aseprite и папкой на устройстве",
        "Salvar como com o formato de projeto do Aseprite e o local no dispositivo",
        "Guardar como con el formato de proyecto de Aseprite y la ubicación en el dispositivo",
      ),
      caption: text(
        "Save an Aseprite project",
        "保存 Aseprite 工程",
        "Aseprite プロジェクトを保存",
        "Aseprite 프로젝트 저장",
        "Сохранение проекта Aseprite",
        "Salvar um projeto do Aseprite",
        "Guardar un proyecto de Aseprite",
      ),
    },
    [`${FEATURE_DETAIL_PATH}export-images-and-animation/`]: {
      src: `${EXAMPLE_IMAGES}/hello-frame-01.png`,
      width: 128,
      height: 80,
      alt: text(
        "A PNG frame of the Hello pixel animation",
        "Hello 像素动画的一帧 PNG 图片",
        "Hello ドット絵アニメーションの PNG フレーム",
        "Hello 도트 애니메이션의 PNG 프레임",
        "Кадр PNG из пиксельной анимации Hello",
        "Um quadro PNG da animação em pixel art Hello",
        "Un cuadro PNG de la animación pixel art Hello",
      ),
      caption: text(
        "PNG frame example",
        "PNG 单帧示例",
        "PNG フレームの例",
        "PNG 프레임 예시",
        "Пример кадра PNG",
        "Exemplo de quadro PNG",
        "Ejemplo de cuadro PNG",
      ),
    },
    [`${FEATURE_DETAIL_PATH}touch-drawing/`]: {
      src: `${GUIDE_IMAGES}/${guideLanguage}/touch-settings.webp`,
      width: 698,
      height: 458,
      alt: text(
        "Touch settings in the editor preferences",
        "编辑器首选项中的触控设置",
        "エディターの環境設定にあるタッチ設定",
        "에디터 환경설정의 터치 설정",
        "Настройки сенсорного ввода в параметрах редактора",
        "Configurações de toque nas preferências do editor",
        "Ajustes táctiles en las preferencias del editor",
      ),
      caption: text(
        "Touch settings",
        "触控设置",
        "タッチ設定",
        "터치 설정",
        "Сенсорный ввод",
        "Configurações de toque",
        "Ajustes táctiles",
      ),
    },
    [`${FEATURE_DETAIL_PATH}share-artwork/`]: {
      src: `${ABOUT_IMAGES}/share-dialog${suffix}.png`,
      width: 1440,
      height: chinese ? 1360 : 1200,
      alt: text(
        "The share window with a link and choices for sharing frames and layers",
        "分享窗口中的作品链接与帧、图层选项",
        "リンクと、共有するフレームやレイヤーの選択肢がある共有ウィンドウ",
        "링크와 공유할 프레임·레이어 선택지가 있는 공유 창",
        "Окно «Поделиться» со ссылкой и выбором кадров и слоёв",
        "A janela de compartilhamento com um link e opções de quadros e camadas",
        "La ventana para compartir con un enlace y opciones de cuadros y capas",
      ),
      caption: text(
        "Share a link or QR code",
        "分享链接或二维码",
        "リンクや QR コードで共有",
        "링크나 QR 코드로 공유",
        "Поделиться ссылкой или QR-кодом",
        "Compartilhe um link ou QR code",
        "Comparte un enlace o código QR",
      ),
    },
    "/tools/viewer/": {
      src: `${ARTICLE_IMAGES}/viewer-file-menu${suffix}.png`,
      width: 840,
      height: 440,
      alt: text(
        "The viewer's File menu with GIF and PNG export commands",
        "查看器文件菜单中的 GIF 和 PNG 导出命令",
        "GIF と PNG のエクスポートコマンドがあるビューアーのファイルメニュー",
        "GIF와 PNG 내보내기 명령이 있는 뷰어의 파일 메뉴",
        "Меню «Файл» просмотрщика с командами экспорта GIF и PNG",
        "O menu Arquivo do visualizador com comandos de exportação para GIF e PNG",
        "El menú Archivo del visor con comandos para exportar GIF y PNG",
      ),
      caption: text(
        "Export from the viewer",
        "从查看器导出",
        "ビューアーからエクスポート",
        "뷰어에서 내보내기",
        "Экспорт из просмотрщика",
        "Exportar pelo visualizador",
        "Exportar desde el visor",
      ),
    },
    "/tools/gif-to-sprite-sheet/": {
      src: `${EXAMPLE_IMAGES}/hello-sheet.png`,
      width: 384,
      height: 240,
      alt: text(
        "Eight Hello animation frames arranged in a sprite sheet",
        "八帧 Hello 动画排列成的精灵表",
        "スプライトシートに並べた Hello アニメーションの 8 フレーム",
        "스프라이트 시트에 배치한 Hello 애니메이션 8프레임",
        "Восемь кадров анимации Hello на спрайт-листе",
        "Oito quadros da animação Hello organizados em uma sprite sheet",
        "Ocho cuadros de la animación Hello en una hoja de sprites",
      ),
      caption: text(
        "Sprite sheet example",
        "精灵表示例",
        "スプライトシートの例",
        "스프라이트 시트 예시",
        "Пример спрайт-листа",
        "Exemplo de sprite sheet",
        "Ejemplo de hoja de sprites",
      ),
    },
    "/tools/animal-crossing-qr/": {
      src: ISLAND_PATTERN,
      width: 96,
      height: 96,
      alt: text(
        "The cobblestone path artwork used by the converter example",
        "转换器示例使用的石板路图案",
        "変換ツールのサンプルで使われている石畳の道の作品",
        "변환기 예제에 쓰인 돌길 작품",
        "Рисунок мощёной дорожки из примера конвертера",
        "A arte do caminho de pedras usada no exemplo do conversor",
        "La ilustración del camino empedrado usada en el ejemplo del conversor",
      ),
      caption: text(
        "Design artwork example",
        "图案素材示例",
        "マイデザイン素材の例",
        "마이 디자인 소재 예시",
        "Пример рисунка для дизайна",
        "Exemplo de arte para design",
        "Ejemplo de ilustración para diseño",
      ),
      credit: { label: "Amy / A Forest Life", href: ISLAND_PATTERN_SOURCE },
    },
  };
  return media[href];
}
