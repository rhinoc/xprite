import { type FaqInlineContent, faqInlineText } from "../site/faq.ts";
import { localizedSiteHref, PublicLanguage } from "../site/language.ts";

/**
 * The crawlable, visually hidden copy each tool page keeps for readers without JavaScript
 * and for search engines: one introduction paragraph plus the FAQ questions and answers the
 * page shows. English is the source the tool `index.html` files carry; the localized pages
 * swap in their own copy so the FAQ text and its FAQPage schema stay in the page language.
 */
export interface ToolSeoCopy {
  readonly introduction: readonly FaqInlineContent[];
  readonly questions: readonly {
    readonly question: string;
    readonly answer: readonly FaqInlineContent[];
  }[];
}

type ToolSeoCopySet = Readonly<Partial<Record<PublicLanguage, ToolSeoCopy>>> & {
  en: ToolSeoCopy;
};

/** The copy for one tool in one language, falling back to English when untranslated. */
export function toolSeoCopy(copy: ToolSeoCopySet, language: PublicLanguage): ToolSeoCopy {
  return copy[language] ?? copy.en;
}

/** A tool's FAQ entries as the plain text the page and its FAQPage schema both use. */
export function toolFaqEntries(copy: ToolSeoCopy) {
  return copy.questions.map((item) => ({
    question: item.question,
    answer: faqInlineText(item.answer),
  }));
}

const VIEWER_SEO_COPY: ToolSeoCopySet = {
  [PublicLanguage.English]: {
    introduction: [
      "Turning a photo into pixel art? Use the free ",
      { label: "image to pixel art converter", href: "/tools/pixelate/" },
      "—no upload—then Edit more in Xprite. Need a GIF as a sprite sheet? Use the free ",
      {
        label: "GIF to sprite sheet converter",
        href: "/tools/gif-to-sprite-sheet/",
      },
      "—no upload.",
    ],
    questions: [],
  },
  [PublicLanguage.SimplifiedChinese]: {
    introduction: [
      "想把照片转成像素画？使用免费的",
      { label: "图片转像素画工具", href: "/zh-CN/tools/pixelate/" },
      "——无需上传——然后在 Xprite 中继续编辑。需要把 GIF 变成精灵表？使用免费的",
      { label: "GIF 转精灵表工具", href: "/zh-CN/tools/gif-to-sprite-sheet/" },
      "——无需上传。",
    ],
    questions: [],
  },
  [PublicLanguage.Japanese]: {
    introduction: [
      "写真をドット絵に変えたい場合は、無料の",
      { label: "画像からドット絵への変換ツール", href: "/ja/tools/pixelate/" },
      "（アップロード不要）を使い、Xprite で続けて編集できます。GIF をスプライトシートにしたい場合は、無料の",
      {
        label: "GIF からスプライトシートへの変換ツール",
        href: "/ja/tools/gif-to-sprite-sheet/",
      },
      "（アップロード不要）をご利用ください。",
    ],
    questions: [],
  },
  [PublicLanguage.Korean]: {
    introduction: [
      "사진을 픽셀 아트로 바꾸고 싶다면 무료 ",
      { label: "이미지 픽셀 아트 변환기", href: "/ko/tools/pixelate/" },
      "(업로드 불필요)로 변환한 뒤 Xprite에서 이어서 편집하세요. GIF를 스프라이트 시트로 만들고 싶다면 무료 ",
      {
        label: "GIF 스프라이트 시트 변환기",
        href: "/ko/tools/gif-to-sprite-sheet/",
      },
      "(업로드 불필요)를 이용하세요.",
    ],
    questions: [],
  },
  [PublicLanguage.Russian]: {
    introduction: [
      "Хотите превратить фото в пиксель-арт? Используйте бесплатный ",
      {
        label: "конвертер изображения в пиксель-арт",
        href: "/ru/tools/pixelate/",
      },
      " — без загрузки — и продолжите в Xprite. Нужен спрайт-лист из GIF? Используйте бесплатный ",
      {
        label: "конвертер GIF в спрайт-лист",
        href: "/ru/tools/gif-to-sprite-sheet/",
      },
      " — без загрузки.",
    ],
    questions: [],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    introduction: [
      "Quer transformar uma foto em pixel art? Use o ",
      {
        label: "conversor de imagem para pixel art",
        href: "/pt-BR/tools/pixelate/",
      },
      " gratuito — sem upload — e continue no Xprite. Precisa de um GIF como sprite sheet? Use o ",
      {
        label: "conversor de GIF para sprite sheet",
        href: "/pt-BR/tools/gif-to-sprite-sheet/",
      },
      " gratuito — sem upload.",
    ],
    questions: [],
  },
  [PublicLanguage.Spanish]: {
    introduction: [
      "¿Quieres convertir una foto en pixel art? Usa el ",
      { label: "conversor de imagen a pixel art", href: "/es/tools/pixelate/" },
      " gratis — sin subir nada — y sigue en Xprite. ¿Necesitas un GIF como hoja de sprites? Usa el ",
      {
        label: "conversor de GIF a hoja de sprites",
        href: "/es/tools/gif-to-sprite-sheet/",
      },
      " gratis — sin subir nada.",
    ],
    questions: [],
  },
};

const PIXELATE_SEO_COPY: ToolSeoCopySet = {
  [PublicLanguage.English]: {
    introduction: [
      "Free image to pixel art converter—photo or drawing to pixel art, no upload, then Edit more in Xprite. Already have soft or off-grid AI pixel art? ",
      { label: "Fix off-grid AI pixel art", href: "/tools/fix-ai-pixel-art/" },
      " with Recover Grid. Have an animated GIF? Use the free ",
      {
        label: "GIF to sprite sheet converter",
        href: "/tools/gif-to-sprite-sheet/",
      },
      "—no upload—for a PNG sheet and JSON frame data. Need Wplace map colors for an overlay? See the ",
      {
        label: "Wplace map palette / converter",
        href: "/compare/wplace-palette/",
      },
      " guide.",
    ],
    questions: [
      {
        question: "Is the image to pixel art converter free?",
        answer: [
          "Yes. Free, no account, and no watermark. Open the tool and convert in your browser.",
        ],
      },
      {
        question: "Do I need to upload my photo?",
        answer: [
          "No. Processing stays on your device. Drop or open a PNG, JPEG, or WebP—the file is never uploaded to a server.",
        ],
      },
      {
        question: "Can I turn a photo into pixel art?",
        answer: [
          "Yes. That is Convert image: pick size, method, colors, and palette, then preview before you export.",
        ],
      },
      {
        question: "What does Edit more do?",
        answer: [
          "Edit more opens the converted result in the Xprite editor as a new project so you can keep drawing, adjust the palette, or save .aseprite.",
        ],
      },
      {
        question: "How is this different from Fix AI Pixel Art?",
        answer: [
          "Use this converter for a normal photo or drawing you want turned into pixel art. Use ",
          { label: "Fix AI Pixel Art", href: "/tools/fix-ai-pixel-art/" },
          " (Recover Grid) when the input already looks like soft or off-grid AI “pixel art” and needs a real pixel lattice.",
        ],
      },
    ],
  },
  [PublicLanguage.SimplifiedChinese]: {
    introduction: [
      "免费图片转像素画工具——把照片或插画转成像素画，无需上传，然后在 Xprite 中继续编辑。已经有模糊或偏离网格的 AI 像素画？用「还原网格」",
      {
        label: "修复偏离网格的 AI 像素画",
        href: "/zh-CN/tools/fix-ai-pixel-art/",
      },
      "。有 GIF 动图？使用免费的",
      { label: "GIF 转精灵表工具", href: "/zh-CN/tools/gif-to-sprite-sheet/" },
      "——无需上传——生成 PNG 精灵表和 JSON 帧数据。需要 Wplace 地图配色做叠加？查看",
      {
        label: "Wplace 地图调色板 / 转换器",
        href: "/zh-CN/compare/wplace-palette/",
      },
      "指南。",
    ],
    questions: [
      {
        question: "图片转像素画工具免费吗？",
        answer: ["免费，无需账号，也没有水印。打开工具即可在浏览器中转换。"],
      },
      {
        question: "需要上传照片吗？",
        answer: [
          "不需要。处理只在你的设备上进行。拖入或打开 PNG、JPEG 或 WebP，文件不会上传到服务器。",
        ],
      },
      {
        question: "能把照片变成像素画吗？",
        answer: ["可以。这就是「转换图片」：选择尺寸、方法、颜色和调色板，预览满意后再导出。"],
      },
      {
        question: "「继续编辑」是做什么的？",
        answer: [
          "「继续编辑」会把转换结果作为新工程在 Xprite 编辑器中打开，方便继续绘制、调整调色板或另存为 .aseprite。",
        ],
      },
      {
        question: "和「修复 AI 像素画」有什么区别？",
        answer: [
          "想把普通照片或插画转成像素画时用本工具。当图片本身已经是模糊或偏离网格的 AI「像素画」、需要还原真实像素网格时，请使用",
          { label: "修复 AI 像素画", href: "/zh-CN/tools/fix-ai-pixel-art/" },
          "（还原网格）。",
        ],
      },
    ],
  },
  [PublicLanguage.Japanese]: {
    introduction: [
      "無料の画像からドット絵への変換ツール——写真やイラストをドット絵に変え、アップロード不要で、Xprite で続けて編集できます。すでにソフトまたはグリッドのずれた AI ドット絵がある場合は、「グリッドを復元」で",
      {
        label: "グリッドのずれた AI ドット絵を修正",
        href: "/ja/tools/fix-ai-pixel-art/",
      },
      "。GIF アニメがある場合は、無料の",
      {
        label: "GIF からスプライトシートへの変換ツール",
        href: "/ja/tools/gif-to-sprite-sheet/",
      },
      "（アップロード不要）で PNG シートと JSON フレームデータを取得できます。オーバーレイ用に Wplace マップの色が必要な場合は、",
      {
        label: "Wplace マップパレット / 変換ツール",
        href: "/ja/compare/wplace-palette/",
      },
      "ガイドをご覧ください。",
    ],
    questions: [
      {
        question: "画像からドット絵への変換ツールは無料ですか？",
        answer: [
          "はい。無料で、アカウントも透かしもありません。ツールを開いてブラウザで変換できます。",
        ],
      },
      {
        question: "写真をアップロードする必要がありますか？",
        answer: [
          "いいえ。処理はすべてお使いのデバイスで行われます。PNG、JPEG、WebP をドロップまたは開くだけで、ファイルがサーバーにアップロードされることはありません。",
        ],
      },
      {
        question: "写真をドット絵に変えられますか？",
        answer: [
          "はい。それが「画像を変換」です。サイズ、方法、色数、パレットを選び、書き出す前にプレビューで確認できます。",
        ],
      },
      {
        question: "「続けて編集」は何をしますか？",
        answer: [
          "「続けて編集」は変換結果を新しいプロジェクトとして Xprite エディターで開き、そのまま描き続けたりパレットを調整したり .aseprite で保存したりできます。",
        ],
      },
      {
        question: "「AI ドット絵を修正」との違いは何ですか？",
        answer: [
          "普通の写真やイラストをドット絵にしたい場合はこの変換ツールを使います。入力がすでにソフトまたはグリッドのずれた AI「ドット絵」で、実際のピクセルグリッドが必要な場合は",
          { label: "AI ドット絵を修正", href: "/ja/tools/fix-ai-pixel-art/" },
          "（グリッドを復元）をご利用ください。",
        ],
      },
    ],
  },
  [PublicLanguage.Korean]: {
    introduction: [
      "무료 이미지 픽셀 아트 변환기—사진이나 그림을 픽셀 아트로 변환하고 업로드 없이 Xprite에서 이어서 편집하세요. 이미 부드럽거나 그리드가 어긋난 AI 픽셀 아트가 있나요? 그리드 복원으로 ",
      {
        label: "그리드 어긋난 AI 픽셀 아트 수정",
        href: "/ko/tools/fix-ai-pixel-art/",
      },
      "하세요. 애니메이션 GIF가 있나요? 무료 ",
      {
        label: "GIF 스프라이트 시트 변환기",
        href: "/ko/tools/gif-to-sprite-sheet/",
      },
      "(업로드 불필요)로 PNG 시트와 JSON 프레임 데이터를 얻으세요. 오버레이용 Wplace 맵 색상이 필요하다면 ",
      {
        label: "Wplace 맵 팔레트 / 변환기",
        href: "/ko/compare/wplace-palette/",
      },
      " 가이드를 보세요.",
    ],
    questions: [
      {
        question: "이미지 픽셀 아트 변환기는 무료인가요?",
        answer: [
          "네. 무료이며 계정도 워터마크도 없습니다. 도구를 열어 브라우저에서 바로 변환하세요.",
        ],
      },
      {
        question: "사진을 업로드해야 하나요?",
        answer: [
          "아니요. 처리는 모두 기기에서 이루어집니다. PNG, JPEG, WebP를 드롭하거나 열기만 하면 되며 파일은 서버에 업로드되지 않습니다.",
        ],
      },
      {
        question: "사진을 픽셀 아트로 바꿀 수 있나요?",
        answer: [
          "네. 그것이 「이미지 변환」입니다. 크기, 방식, 색상, 팔레트를 고른 뒤 내보내기 전에 미리 보기로 확인하세요.",
        ],
      },
      {
        question: "「계속 편집」은 무엇을 하나요?",
        answer: [
          "「계속 편집」은 변환 결과를 새 프로젝트로 Xprite 에디터에서 열어 계속 그리거나 팔레트를 조정하거나 .aseprite로 저장할 수 있게 합니다.",
        ],
      },
      {
        question: "「AI 픽셀 아트 수정」과 어떻게 다른가요?",
        answer: [
          "일반 사진이나 그림을 픽셀 아트로 만들고 싶을 때 이 변환기를 사용합니다. 입력이 이미 부드럽거나 그리드가 어긋난 AI 「픽셀 아트」여서 실제 픽셀 격자가 필요하다면 ",
          { label: "AI 픽셀 아트 수정", href: "/ko/tools/fix-ai-pixel-art/" },
          "(그리드 복원)을 이용하세요.",
        ],
      },
    ],
  },
  [PublicLanguage.Russian]: {
    introduction: [
      "Бесплатный конвертер изображения в пиксель-арт — превратите фото или рисунок в пиксель-арт без загрузки и продолжите в Xprite. Уже есть мягкий или не по сетке AI-пиксель-арт? ",
      {
        label: "Исправьте AI-пиксель-арт не по сетке",
        href: "/ru/tools/fix-ai-pixel-art/",
      },
      " с помощью Recover Grid. Есть анимированный GIF? Используйте бесплатный ",
      {
        label: "конвертер GIF в спрайт-лист",
        href: "/ru/tools/gif-to-sprite-sheet/",
      },
      " — без загрузки — и получите PNG-лист и JSON-данные кадров. Нужны цвета карты Wplace для оверлея? Смотрите ",
      {
        label: "палитру / конвертер карты Wplace",
        href: "/ru/compare/wplace-palette/",
      },
      ".",
    ],
    questions: [
      {
        question: "Конвертер изображения в пиксель-арт бесплатный?",
        answer: [
          "Да. Бесплатно, без аккаунта и без водяных знаков. Откройте инструмент и конвертируйте в браузере.",
        ],
      },
      {
        question: "Нужно ли загружать фото?",
        answer: [
          "Нет. Обработка происходит на вашем устройстве. Перетащите или откройте PNG, JPEG или WebP — файл никогда не загружается на сервер.",
        ],
      },
      {
        question: "Можно ли превратить фото в пиксель-арт?",
        answer: [
          "Да. Это «Конвертировать изображение»: выберите размер, метод, цвета и палитру, затем посмотрите предпросмотр перед экспортом.",
        ],
      },
      {
        question: "Что делает «Редактировать дальше»?",
        answer: [
          "«Редактировать дальше» открывает результат конвертации в редакторе Xprite как новый проект, чтобы можно было продолжить рисовать, настроить палитру или сохранить .aseprite.",
        ],
      },
      {
        question: "Чем это отличается от «Исправить AI пиксель-арт»?",
        answer: [
          "Используйте этот конвертер для обычного фото или рисунка, который хотите превратить в пиксель-арт. Используйте ",
          {
            label: "Исправить AI пиксель-арт",
            href: "/ru/tools/fix-ai-pixel-art/",
          },
          " (Recover Grid), когда исходник уже выглядит как мягкий или не по сетке AI «пиксель-арт» и ему нужна настоящая пиксельная решётка.",
        ],
      },
    ],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    introduction: [
      "Conversor gratuito de imagem para pixel art — transforme foto ou desenho em pixel art sem upload e continue no Xprite. Já tem pixel art de IA suave ou fora da grade? ",
      {
        label: "Corrija pixel art de IA fora da grade",
        href: "/pt-BR/tools/fix-ai-pixel-art/",
      },
      " com Recover Grid. Tem um GIF animado? Use o ",
      {
        label: "conversor de GIF para sprite sheet",
        href: "/pt-BR/tools/gif-to-sprite-sheet/",
      },
      " gratuito — sem upload — e obtenha uma folha PNG e dados de quadros em JSON. Precisa das cores do mapa Wplace para uma sobreposição? Veja o guia da ",
      {
        label: "paleta / conversor do mapa Wplace",
        href: "/pt-BR/compare/wplace-palette/",
      },
      ".",
    ],
    questions: [
      {
        question: "O conversor de imagem para pixel art é grátis?",
        answer: [
          "Sim. Grátis, sem conta e sem marca d'água. Abra a ferramenta e converta no navegador.",
        ],
      },
      {
        question: "Preciso enviar minha foto?",
        answer: [
          "Não. O processamento fica no seu dispositivo. Arraste ou abra um PNG, JPEG ou WebP — o arquivo nunca é enviado a um servidor.",
        ],
      },
      {
        question: "Posso transformar uma foto em pixel art?",
        answer: [
          "Sim. É a opção Converter imagem: escolha tamanho, método, cores e paleta, depois confira a prévia antes de exportar.",
        ],
      },
      {
        question: "O que o Editar mais faz?",
        answer: [
          "Editar mais abre o resultado convertido no editor Xprite como um novo projeto, para continuar desenhando, ajustar a paleta ou salvar .aseprite.",
        ],
      },
      {
        question: "Qual a diferença para o Corrigir Pixel Art de IA?",
        answer: [
          "Use este conversor para uma foto ou desenho normal que você quer virar pixel art. Use o ",
          {
            label: "Corrigir Pixel Art de IA",
            href: "/pt-BR/tools/fix-ai-pixel-art/",
          },
          " (Recover Grid) quando a entrada já parece pixel art de IA suave ou fora da grade e precisa de uma grade de pixels real.",
        ],
      },
    ],
  },
  [PublicLanguage.Spanish]: {
    introduction: [
      "Conversor gratuito de imagen a pixel art: convierte una foto o un dibujo en pixel art sin subir nada y sigue en Xprite. ¿Ya tienes pixel art de IA suave o fuera de la cuadrícula? ",
      {
        label: "Corrige el pixel art de IA fuera de cuadrícula",
        href: "/es/tools/fix-ai-pixel-art/",
      },
      " con Recover Grid. ¿Tienes un GIF animado? Usa el ",
      {
        label: "conversor de GIF a hoja de sprites",
        href: "/es/tools/gif-to-sprite-sheet/",
      },
      " gratis — sin subir nada — para obtener una hoja PNG y datos de cuadros en JSON. ¿Necesitas los colores del mapa de Wplace para una superposición? Consulta la guía de la ",
      {
        label: "paleta / conversor del mapa de Wplace",
        href: "/es/compare/wplace-palette/",
      },
      ".",
    ],
    questions: [
      {
        question: "¿El conversor de imagen a pixel art es gratis?",
        answer: [
          "Sí. Gratis, sin cuenta y sin marca de agua. Abre la herramienta y convierte en tu navegador.",
        ],
      },
      {
        question: "¿Tengo que subir mi foto?",
        answer: [
          "No. El procesamiento ocurre en tu dispositivo. Arrastra o abre un PNG, JPEG o WebP: el archivo nunca se sube a un servidor.",
        ],
      },
      {
        question: "¿Puedo convertir una foto en pixel art?",
        answer: [
          "Sí. Eso es Convertir imagen: elige tamaño, método, colores y paleta, y previsualiza antes de exportar.",
        ],
      },
      {
        question: "¿Qué hace Editar más?",
        answer: [
          "Editar más abre el resultado convertido en el editor Xprite como un proyecto nuevo, para seguir dibujando, ajustar la paleta o guardar .aseprite.",
        ],
      },
      {
        question: "¿En qué se diferencia de Corregir Pixel Art de IA?",
        answer: [
          "Usa este conversor para una foto o un dibujo normal que quieras convertir en pixel art. Usa ",
          {
            label: "Corregir Pixel Art de IA",
            href: "/es/tools/fix-ai-pixel-art/",
          },
          " (Recover Grid) cuando la entrada ya parece pixel art de IA suave o fuera de la cuadrícula y necesita una cuadrícula de píxeles real.",
        ],
      },
    ],
  },
};

const FIX_AI_SEO_COPY: ToolSeoCopySet = {
  [PublicLanguage.English]: {
    introduction: [
      "Soft or off-grid AI pixel art is not on a true grid—Recover Grid snaps it to real pixels, no upload. For a photo or drawing, use ",
      { label: "Image to pixel art", href: "/tools/pixelate/" },
      ".",
    ],
    questions: [],
  },
  [PublicLanguage.SimplifiedChinese]: {
    introduction: [
      "模糊或偏离网格的 AI 像素画并不在真实网格上——「还原网格」会把它对齐到真实像素，无需上传。要处理照片或插画，请使用",
      { label: "图片转像素画", href: "/zh-CN/tools/pixelate/" },
      "。",
    ],
    questions: [],
  },
  [PublicLanguage.Japanese]: {
    introduction: [
      "ソフトまたはグリッドのずれた AI ドット絵は本当のグリッドに乗っていません。「グリッドを復元」はアップロード不要で実際のピクセルに合わせます。写真やイラストには",
      { label: "画像からドット絵へ", href: "/ja/tools/pixelate/" },
      "をご利用ください。",
    ],
    questions: [],
  },
  [PublicLanguage.Korean]: {
    introduction: [
      "부드럽거나 그리드가 어긋난 AI 픽셀 아트는 실제 격자에 있지 않습니다. 그리드 복원은 업로드 없이 실제 픽셀에 맞춰 줍니다. 사진이나 그림에는 ",
      { label: "이미지 픽셀 아트", href: "/ko/tools/pixelate/" },
      "를 사용하세요.",
    ],
    questions: [],
  },
  [PublicLanguage.Russian]: {
    introduction: [
      "Мягкий или не по сетке AI пиксель-арт не стоит на настоящей сетке — Recover Grid выравнивает его по реальным пикселям без загрузки. Для фото или рисунка используйте ",
      { label: "Изображение в пиксель-арт", href: "/ru/tools/pixelate/" },
      ".",
    ],
    questions: [],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    introduction: [
      "Pixel art de IA suave ou fora da grade não está numa grade real — o Recover Grid ajusta aos pixels reais sem upload. Para uma foto ou desenho, use ",
      { label: "Imagem para pixel art", href: "/pt-BR/tools/pixelate/" },
      ".",
    ],
    questions: [],
  },
  [PublicLanguage.Spanish]: {
    introduction: [
      "El pixel art de IA suave o fuera de la cuadrícula no está en una cuadrícula real: Recover Grid lo ajusta a píxeles reales sin subir nada. Para una foto o un dibujo, usa ",
      { label: "Imagen a pixel art", href: "/es/tools/pixelate/" },
      ".",
    ],
    questions: [],
  },
};

const GIF_SHEET_SEO_COPY: ToolSeoCopySet = {
  [PublicLanguage.English]: {
    introduction: [
      "Free GIF to sprite sheet converter—GIF to PNG sheet with layout and JSON frame data, no upload, then Edit more in Xprite. Need a still image as pixel art? Use the free ",
      { label: "image to pixel art converter", href: "/tools/pixelate/" },
      "—no upload—then Edit more in Xprite.",
    ],
    questions: [
      {
        question: "Is the GIF to sprite sheet converter free?",
        answer: [
          "Yes. Free, no account, and no watermark. Open the tool and convert in your browser.",
        ],
      },
      {
        question: "Do I need to upload my GIF?",
        answer: [
          "No. Processing stays on your device. Drop or open a GIF—the file is never uploaded to a server.",
        ],
      },
      {
        question: "Can I turn a GIF into a sprite sheet?",
        answer: [
          "Yes. Open or drop a GIF, set the sheet layout and spacing, then export a PNG sprite sheet.",
        ],
      },
      {
        question: "Does it export JSON frame data?",
        answer: [
          "Yes. Export JSON with each frame’s coordinates and duration for game engines, plus a PNG sheet with the same layout.",
        ],
      },
      {
        question: "GIF to sprite sheet vs sprite sheet in the editor?",
        answer: [
          "This tool is a quick GIF→sheet converter. For trim empty space or merge duplicate frames, open the GIF in the Xprite editor and choose Sprite Sheet in Export (Trim Sprite / Merge Duplicates).",
        ],
      },
    ],
  },
  [PublicLanguage.SimplifiedChinese]: {
    introduction: [
      "免费 GIF 转精灵表工具——把 GIF 转成带布局和 JSON 帧数据的 PNG 精灵表，无需上传，然后在 Xprite 中继续编辑。需要把静态图片转成像素画？使用免费的",
      { label: "图片转像素画工具", href: "/zh-CN/tools/pixelate/" },
      "——无需上传——然后在 Xprite 中继续编辑。",
    ],
    questions: [
      {
        question: "GIF 转精灵表工具免费吗？",
        answer: ["免费，无需账号，也没有水印。打开工具即可在浏览器中转换。"],
      },
      {
        question: "需要上传 GIF 吗？",
        answer: ["不需要。处理只在你的设备上进行。拖入或打开一个 GIF，文件不会上传到服务器。"],
      },
      {
        question: "能把 GIF 变成精灵表吗？",
        answer: ["可以。打开或拖入一个 GIF，设置精灵表布局和间距，然后导出 PNG 精灵表。"],
      },
      {
        question: "能导出 JSON 帧数据吗？",
        answer: [
          "可以。导出的 JSON 包含每一帧的坐标和时长供游戏引擎使用，外加相同布局的 PNG 精灵表。",
        ],
      },
      {
        question: "GIF 转精灵表工具和编辑器里的精灵表有什么区别？",
        answer: [
          "本工具是快速的 GIF→精灵表转换器。要裁掉空白或合并重复帧，请在 Xprite 编辑器中打开 GIF，并在导出中选择精灵表（Trim Sprite / Merge Duplicates）。",
        ],
      },
    ],
  },
  [PublicLanguage.Japanese]: {
    introduction: [
      "無料の GIF からスプライトシートへの変換ツール——GIF をレイアウトと JSON フレームデータ付きの PNG シートに変え、アップロード不要で Xprite で続けて編集できます。静止画をドット絵にしたい場合は、無料の",
      { label: "画像からドット絵への変換ツール", href: "/ja/tools/pixelate/" },
      "（アップロード不要）を使い、Xprite で続けて編集してください。",
    ],
    questions: [
      {
        question: "GIF からスプライトシートへの変換ツールは無料ですか？",
        answer: [
          "はい。無料で、アカウントも透かしもありません。ツールを開いてブラウザで変換できます。",
        ],
      },
      {
        question: "GIF をアップロードする必要がありますか？",
        answer: [
          "いいえ。処理はすべてお使いのデバイスで行われます。GIF をドロップまたは開くだけで、ファイルがサーバーにアップロードされることはありません。",
        ],
      },
      {
        question: "GIF をスプライトシートに変えられますか？",
        answer: [
          "はい。GIF を開くかドロップし、シートのレイアウトと間隔を設定して、PNG スプライトシートを書き出せます。",
        ],
      },
      {
        question: "JSON フレームデータを書き出せますか？",
        answer: [
          "はい。各フレームの座標と長さを含む JSON をゲームエンジン向けに書き出せ、同じレイアウトの PNG シートも付きます。",
        ],
      },
      {
        question: "GIF→シート変換ツールとエディターのスプライトシートの違いは？",
        answer: [
          "このツールは手軽な GIF→シート変換ツールです。空白を切り詰めたり重複フレームをまとめたりするには、Xprite エディターで GIF を開き、書き出しで「スプライトシート」（Trim Sprite / Merge Duplicates）を選んでください。",
        ],
      },
    ],
  },
  [PublicLanguage.Korean]: {
    introduction: [
      "무료 GIF 스프라이트 시트 변환기—GIF를 레이아웃과 JSON 프레임 데이터가 있는 PNG 시트로 변환하고 업로드 없이 Xprite에서 이어서 편집하세요. 정지 이미지를 픽셀 아트로 만들고 싶다면 무료 ",
      { label: "이미지 픽셀 아트 변환기", href: "/ko/tools/pixelate/" },
      "(업로드 불필요)를 사용한 뒤 Xprite에서 이어서 편집하세요.",
    ],
    questions: [
      {
        question: "GIF 스프라이트 시트 변환기는 무료인가요?",
        answer: [
          "네. 무료이며 계정도 워터마크도 없습니다. 도구를 열어 브라우저에서 바로 변환하세요.",
        ],
      },
      {
        question: "GIF를 업로드해야 하나요?",
        answer: [
          "아니요. 처리는 모두 기기에서 이루어집니다. GIF를 드롭하거나 열기만 하면 되며 파일은 서버에 업로드되지 않습니다.",
        ],
      },
      {
        question: "GIF를 스프라이트 시트로 바꿀 수 있나요?",
        answer: [
          "네. GIF를 열거나 드롭하고 시트 레이아웃과 간격을 설정한 뒤 PNG 스프라이트 시트를 내보내세요.",
        ],
      },
      {
        question: "JSON 프레임 데이터를 내보낼 수 있나요?",
        answer: [
          "네. 각 프레임의 좌표와 길이가 담긴 JSON을 게임 엔진용으로 내보낼 수 있고, 같은 레이아웃의 PNG 시트도 함께 제공됩니다.",
        ],
      },
      {
        question: "GIF→시트 변환기와 에디터의 스프라이트 시트의 차이는?",
        answer: [
          "이 도구는 빠른 GIF→시트 변환기입니다. 빈 공간을 자르거나 중복 프레임을 합치려면 Xprite 에디터에서 GIF를 열고 내보내기에서 스프라이트 시트(Trim Sprite / Merge Duplicates)를 선택하세요.",
        ],
      },
    ],
  },
  [PublicLanguage.Russian]: {
    introduction: [
      "Бесплатный конвертер GIF в спрайт-лист — GIF в PNG-лист с разметкой и JSON-данными кадров без загрузки, затем продолжите в Xprite. Нужен статичный рисунок как пиксель-арт? Используйте бесплатный ",
      {
        label: "конвертер изображения в пиксель-арт",
        href: "/ru/tools/pixelate/",
      },
      " — без загрузки — и продолжите в Xprite.",
    ],
    questions: [
      {
        question: "Конвертер GIF в спрайт-лист бесплатный?",
        answer: [
          "Да. Бесплатно, без аккаунта и без водяных знаков. Откройте инструмент и конвертируйте в браузере.",
        ],
      },
      {
        question: "Нужно ли загружать GIF?",
        answer: [
          "Нет. Обработка происходит на вашем устройстве. Перетащите или откройте GIF — файл никогда не загружается на сервер.",
        ],
      },
      {
        question: "Можно ли превратить GIF в спрайт-лист?",
        answer: [
          "Да. Откройте или перетащите GIF, задайте разметку и интервалы листа, затем экспортируйте PNG спрайт-лист.",
        ],
      },
      {
        question: "Экспортируются ли JSON-данные кадров?",
        answer: [
          "Да. Экспортируйте JSON с координатами и длительностью каждого кадра для игровых движков, а также PNG-лист с той же разметкой.",
        ],
      },
      {
        question: "Чем GIF→лист отличается от спрайт-листа в редакторе?",
        answer: [
          "Этот инструмент — быстрый конвертер GIF→лист. Чтобы обрезать пустое место или объединить повторяющиеся кадры, откройте GIF в редакторе Xprite и выберите «Спрайт-лист» в Экспорте (Trim Sprite / Merge Duplicates).",
        ],
      },
    ],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    introduction: [
      "Conversor gratuito de GIF para sprite sheet — GIF para folha PNG com layout e dados de quadros em JSON, sem upload, e continue no Xprite. Precisa de uma imagem parada como pixel art? Use o ",
      {
        label: "conversor de imagem para pixel art",
        href: "/pt-BR/tools/pixelate/",
      },
      " gratuito — sem upload — e continue no Xprite.",
    ],
    questions: [
      {
        question: "O conversor de GIF para sprite sheet é grátis?",
        answer: [
          "Sim. Grátis, sem conta e sem marca d'água. Abra a ferramenta e converta no navegador.",
        ],
      },
      {
        question: "Preciso enviar meu GIF?",
        answer: [
          "Não. O processamento fica no seu dispositivo. Arraste ou abra um GIF — o arquivo nunca é enviado a um servidor.",
        ],
      },
      {
        question: "Posso transformar um GIF em sprite sheet?",
        answer: [
          "Sim. Abra ou arraste um GIF, defina o layout e o espaçamento da folha e exporte uma sprite sheet PNG.",
        ],
      },
      {
        question: "Ele exporta dados de quadros em JSON?",
        answer: [
          "Sim. Exporte um JSON com as coordenadas e a duração de cada quadro para engines de jogos, além de uma folha PNG com o mesmo layout.",
        ],
      },
      {
        question: "GIF→folha vs sprite sheet no editor?",
        answer: [
          "Esta ferramenta é um conversor rápido de GIF→folha. Para cortar espaço vazio ou mesclar quadros duplicados, abra o GIF no editor Xprite e escolha Sprite Sheet em Exportar (Trim Sprite / Merge Duplicates).",
        ],
      },
    ],
  },
  [PublicLanguage.Spanish]: {
    introduction: [
      "Conversor gratuito de GIF a hoja de sprites: GIF a hoja PNG con diseño y datos de cuadros en JSON, sin subir nada, y sigue en Xprite. ¿Necesitas una imagen fija como pixel art? Usa el ",
      { label: "conversor de imagen a pixel art", href: "/es/tools/pixelate/" },
      " gratis — sin subir nada — y sigue en Xprite.",
    ],
    questions: [
      {
        question: "¿El conversor de GIF a hoja de sprites es gratis?",
        answer: [
          "Sí. Gratis, sin cuenta y sin marca de agua. Abre la herramienta y convierte en tu navegador.",
        ],
      },
      {
        question: "¿Tengo que subir mi GIF?",
        answer: [
          "No. El procesamiento ocurre en tu dispositivo. Arrastra o abre un GIF: el archivo nunca se sube a un servidor.",
        ],
      },
      {
        question: "¿Puedo convertir un GIF en una hoja de sprites?",
        answer: [
          "Sí. Abre o arrastra un GIF, define el diseño y el espaciado de la hoja y exporta una hoja de sprites PNG.",
        ],
      },
      {
        question: "¿Exporta datos de cuadros en JSON?",
        answer: [
          "Sí. Exporta un JSON con las coordenadas y la duración de cada cuadro para motores de juegos, además de una hoja PNG con el mismo diseño.",
        ],
      },
      {
        question: "¿GIF→hoja vs hoja de sprites en el editor?",
        answer: [
          "Esta herramienta es un conversor rápido de GIF→hoja. Para recortar espacio vacío o fusionar cuadros duplicados, abre el GIF en el editor Xprite y elige Hoja de sprites en Exportar (Trim Sprite / Merge Duplicates).",
        ],
      },
    ],
  },
};

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => HTML_ENTITIES[character]);

function inlineHtml(content: readonly FaqInlineContent[], language: PublicLanguage): string {
  return content
    .map((part) => {
      if (typeof part === "string") return escapeHtml(part);
      if ("code" in part) return `<code>${escapeHtml(part.code)}</code>`;
      return `<a href="${escapeHtml(localizedSiteHref(part.href, language))}">${escapeHtml(part.label)}</a>`;
    })
    .join("");
}

/**
 * The hidden `#tool-seo-copy` block for one tool in one language: its introduction paragraph
 * plus each FAQ question and answer. Matches the hand-authored English blocks the tool
 * `index.html` files carry, so the localized page reads the same to a crawler.
 */
export function toolSeoCopyHtml(copy: ToolSeoCopy, language: PublicLanguage): string {
  const introduction = `<p>${inlineHtml(copy.introduction, language)}</p>`;
  const questions = copy.questions
    .map(
      (item) => `<h2>${escapeHtml(item.question)}</h2><p>${inlineHtml(item.answer, language)}</p>`,
    )
    .join("");
  return `${introduction}${questions}`;
}

const NORMAL_MAP_SEO_COPY: ToolSeoCopySet = {
  [PublicLanguage.English]: {
    introduction: [
      "Free normal map generator—turn a sprite or texture into a tangent-space normal map, no upload, then Edit more in Xprite. Starting from a photo or drawing? First make pixel art with the free ",
      { label: "image to pixel art converter", href: "/tools/pixelate/" },
      ", then generate its normal map here. Need animation frames as one image? Use the free ",
      {
        label: "GIF to sprite sheet converter",
        href: "/tools/gif-to-sprite-sheet/",
      },
      "—no upload—for a PNG sheet and JSON frame data.",
    ],
    questions: [
      {
        question: "Is the normal map generator free?",
        answer: [
          "Yes. Free, no account, and no watermark. Open the tool and generate in your browser.",
        ],
      },
      {
        question: "Do I need to upload my image?",
        answer: [
          "No. Processing stays on your device. Drop or open a PNG, JPEG, or WebP—the file is never uploaded to a server.",
        ],
      },
      {
        question: "What kind of normal map does it make?",
        answer: [
          "A tangent-space normal map in the common purple encoding: X to red, Y to green, Z to blue. Enable Invert Y for DirectX-style output; leave it off for OpenGL-style output.",
        ],
      },
      {
        question: "What does Edit more do?",
        answer: [
          "Edit more opens the generated normal map in the Xprite editor as a new project so you can repaint regions, combine it with the original artwork, or save .aseprite.",
        ],
      },
    ],
  },
  [PublicLanguage.SimplifiedChinese]: {
    introduction: [
      "免费法线贴图生成器——把精灵图或纹理转成切线空间法线贴图，无需上传，然后在 Xprite 中继续编辑。源图是照片或插画？先用免费的",
      { label: "图片转像素画工具", href: "/zh-CN/tools/pixelate/" },
      "转成像素画，再在这里生成法线。需要把动画帧合成一张图？使用免费的",
      { label: "GIF 转精灵表工具", href: "/zh-CN/tools/gif-to-sprite-sheet/" },
      "——无需上传——得到 PNG 精灵表和 JSON 帧数据。",
    ],
    questions: [
      {
        question: "法线贴图生成器是免费的吗？",
        answer: ["是的。免费、无需账号、无水印。打开工具即可在浏览器中生成。"],
      },
      {
        question: "需要上传图片吗？",
        answer: [
          "不需要。处理全程在设备本地进行。拖入或打开 PNG、JPEG 或 WebP 即可，文件不会上传到服务器。",
        ],
      },
      {
        question: "生成的是哪种法线贴图？",
        answer: [
          "切线空间法线贴图，使用常见的紫色编码：X 存入红色通道、Y 存入绿色通道、Z 存入蓝色通道。勾选「反转 Y」输出 DirectX 风格，取消勾选则为 OpenGL 风格。",
        ],
      },
      {
        question: "「继续编辑」是什么？",
        answer: [
          "「继续编辑」会把生成的法线贴图作为新工程在 Xprite 编辑器中打开，方便重绘局部、与原图分图层组合或保存为 .aseprite。",
        ],
      },
    ],
  },
  [PublicLanguage.Japanese]: {
    introduction: [
      "無料のノーマルマップジェネレーター——スプライトやテクスチャを接線空間ノーマルマップに変換、アップロード不要、Xprite で続けて編集できます。元画像が写真やイラストの場合は、まず無料の",
      { label: "画像からドット絵への変換ツール", href: "/ja/tools/pixelate/" },
      "でドット絵にしてから、ここでノーマルマップを生成してください。アニメーションフレームを1枚にまとめたい場合は、無料の",
      {
        label: "GIF からスプライトシートへの変換ツール",
        href: "/ja/tools/gif-to-sprite-sheet/",
      },
      "（アップロード不要）をご利用ください。",
    ],
    questions: [
      {
        question: "ノーマルマップジェネレーターは無料ですか？",
        answer: [
          "はい。無料で、アカウントも透かしもありません。ツールを開いてブラウザで生成できます。",
        ],
      },
      {
        question: "画像をアップロードする必要がありますか？",
        answer: [
          "いいえ。処理はすべてお使いのデバイスで行われます。PNG、JPEG、WebP をドロップまたは開くだけで、ファイルがサーバーにアップロードされることはありません。",
        ],
      },
      {
        question: "どんなノーマルマップが生成されますか？",
        answer: [
          "一般的な紫色エンコードの接線空間ノーマルマップです：X は赤、Y は緑、Z は青に保存されます。「Y を反転」を有効にすると DirectX 形式、無効のままだと OpenGL 形式の出力になります。",
        ],
      },
      {
        question: "「さらに編集」とは何ですか？",
        answer: [
          "「さらに編集」は生成したノーマルマップを Xprite エディターの新規プロジェクトとして開き、部分修正や元画像とのレイヤー合成、.aseprite 保存ができます。",
        ],
      },
    ],
  },
  [PublicLanguage.Korean]: {
    introduction: [
      "무료 노멀 맵 생성기 — 스프라이트나 텍스처를 접선 공간 노멀 맵으로 변환하고 업로드 없이 Xprite에서 이어서 편집하세요. 원본이 사진이나 일러스트라면 먼저 무료 ",
      { label: "이미지 픽셀 아트 변환기", href: "/ko/tools/pixelate/" },
      "로 픽셀 아트를 만든 뒤 여기에서 노멀 맵을 생성하세요. 애니메이션 프레임을 한 장으로 묶고 싶다면 무료 ",
      {
        label: "GIF 스프라이트 시트 변환기",
        href: "/ko/tools/gif-to-sprite-sheet/",
      },
      "(업로드 불필요)를 이용하세요.",
    ],
    questions: [
      {
        question: "노멀 맵 생성기는 무료인가요?",
        answer: [
          "네. 무료이며 계정도 워터마크도 없습니다. 도구를 열어 브라우저에서 바로 생성하세요.",
        ],
      },
      {
        question: "이미지를 업로드해야 하나요?",
        answer: [
          "아니요. 처리는 모두 기기에서 이루어집니다. PNG, JPEG, WebP를 드롭하거나 열기만 하면 되며 파일은 서버에 업로드되지 않습니다.",
        ],
      },
      {
        question: "어떤 노멀 맵이 만들어지나요?",
        answer: [
          "일반적인 보라색 인코딩의 접선 공간 노멀 맵입니다. X는 빨강, Y는 초록, Z는 파랑에 저장됩니다. 'Y 반전'을 켜면 DirectX 스타일, 끄면 OpenGL 스타일로 출력됩니다.",
        ],
      },
      {
        question: "'더 편집하기'는 무엇인가요?",
        answer: [
          "'더 편집하기'는 생성된 노멀 맵을 Xprite 에디터의 새 프로젝트로 열어 부분을 다시 칠하거나 원본 이미지와 레이어로 합치거나 .aseprite로 저장할 수 있게 합니다.",
        ],
      },
    ],
  },
  [PublicLanguage.Russian]: {
    introduction: [
      "Бесплатный генератор карт нормалей — превратите спрайт или текстуру в карту нормалей в касательном пространстве без загрузки, затем продолжите в Xprite. Исходник — фото или иллюстрация? Сначала сделайте пиксель-арт бесплатным ",
      {
        label: "конвертером изображения в пиксель-арт",
        href: "/ru/tools/pixelate/",
      },
      ", затем сгенерируйте здесь карту нормалей. Нужны кадры анимации одним изображением? Используйте бесплатный ",
      {
        label: "конвертер GIF в спрайт-лист",
        href: "/ru/tools/gif-to-sprite-sheet/",
      },
      " — без загрузки.",
    ],
    questions: [
      {
        question: "Генератор карт нормалей бесплатный?",
        answer: [
          "Да. Бесплатно, без аккаунта и без водяных знаков. Откройте инструмент и сгенерируйте в браузере.",
        ],
      },
      {
        question: "Нужно ли загружать изображение?",
        answer: [
          "Нет. Обработка происходит на вашем устройстве. Перетащите или откройте PNG, JPEG или WebP — файл никогда не загружается на сервер.",
        ],
      },
      {
        question: "Какую карту нормалей создаёт инструмент?",
        answer: [
          "Карту нормалей в касательном пространстве в привычной фиолетовой кодировке: X в красном канале, Y в зелёном, Z в синем. Включите «Инвертировать Y» для вывода в стиле DirectX; без неё — стиль OpenGL.",
        ],
      },
      {
        question: "Что делает «Редактировать дальше»?",
        answer: [
          "Открывает сгенерированную карту нормалей в редакторе Xprite как новый проект: можно перерисовать участки, совместить с исходной иллюстрацией или сохранить .aseprite.",
        ],
      },
    ],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    introduction: [
      "Gerador de normal map gratuito — transforme um sprite ou textura em um normal map em espaço tangente sem upload e continue no Xprite. A origem é uma foto ou ilustração? Primeiro faça pixel art com o ",
      {
        label: "conversor de imagem para pixel art",
        href: "/pt-BR/tools/pixelate/",
      },
      " gratuito, depois gere o normal map aqui. Precisa dos quadros de uma animação em uma imagem? Use o ",
      {
        label: "conversor de GIF para sprite sheet",
        href: "/pt-BR/tools/gif-to-sprite-sheet/",
      },
      " gratuito — sem upload.",
    ],
    questions: [
      {
        question: "O gerador de normal map é gratuito?",
        answer: [
          "Sim. Gratuito, sem conta e sem marca d'água. Abra a ferramenta e gere no navegador.",
        ],
      },
      {
        question: "Preciso enviar minha imagem?",
        answer: [
          "Não. O processamento fica no seu dispositivo. Arraste ou abra um PNG, JPEG ou WebP — o arquivo nunca é enviado a um servidor.",
        ],
      },
      {
        question: "Que tipo de normal map ele cria?",
        answer: [
          "Um normal map em espaço tangente na codificação roxa usual: X no vermelho, Y no verde, Z no azul. Ative Inverter Y para saída estilo DirectX; deixe desativado para estilo OpenGL.",
        ],
      },
      {
        question: "O que o Editar mais faz?",
        answer: [
          "Abre o normal map gerado no editor Xprite como um novo projeto, para repintar regiões, combinar com a arte original ou salvar .aseprite.",
        ],
      },
    ],
  },
  [PublicLanguage.Spanish]: {
    introduction: [
      "Generador de mapas normales gratuito — convierte un sprite o textura en un mapa normal en espacio tangente sin subir nada y sigue en Xprite. ¿La fuente es una foto o ilustración? Primero haz pixel art con el ",
      { label: "conversor de imagen a pixel art", href: "/es/tools/pixelate/" },
      " gratuito y luego genera aquí su mapa normal. ¿Necesitas los fotogramas de una animación en una imagen? Usa el ",
      {
        label: "conversor de GIF a hoja de sprites",
        href: "/es/tools/gif-to-sprite-sheet/",
      },
      " gratuito — sin subir nada.",
    ],
    questions: [
      {
        question: "¿El generador de mapas normales es gratuito?",
        answer: [
          "Sí. Gratuito, sin cuenta y sin marca de agua. Abre la herramienta y genera en tu navegador.",
        ],
      },
      {
        question: "¿Tengo que subir mi imagen?",
        answer: [
          "No. El procesamiento ocurre en tu dispositivo. Suelta o abre un PNG, JPEG o WebP: el archivo nunca se sube a un servidor.",
        ],
      },
      {
        question: "¿Qué tipo de mapa normal genera?",
        answer: [
          "Un mapa normal en espacio tangente con la codificación púrpura habitual: X en rojo, Y en verde, Z en azul. Activa Invertir Y para salida estilo DirectX; déjalo desactivado para estilo OpenGL.",
        ],
      },
      {
        question: "¿Qué hace Editar más?",
        answer: [
          "Abre el mapa normal generado en el editor Xprite como un proyecto nuevo para repintar zonas, combinarlo con la ilustración original o guardar .aseprite.",
        ],
      },
    ],
  },
};

/** The SEO copy each tool page carries, keyed by its public path. */
export const TOOL_SEO_COPY: Readonly<Record<string, ToolSeoCopySet>> = {
  "/tools/viewer/": VIEWER_SEO_COPY,
  "/tools/pixelate/": PIXELATE_SEO_COPY,
  "/tools/fix-ai-pixel-art/": FIX_AI_SEO_COPY,
  "/tools/gif-to-sprite-sheet/": GIF_SHEET_SEO_COPY,
  "/tools/normal-map/": NORMAL_MAP_SEO_COPY,
};
