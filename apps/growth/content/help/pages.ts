import { PublicLanguage } from "../site/language.ts";

/** Public guide metadata can be read without loading Markdown or image modules. */
export const GUIDE_PAGES = {
  [PublicLanguage.English]: {
    path: "/help/",
    title: "Xprite User Guide",
    description:
      "Save and recover projects, open and export files, arrange the workspace, use touch and a pen, work offline, check browser support and read common answers.",
  },
  [PublicLanguage.SimplifiedChinese]: {
    path: "/zh-CN/help/",
    title: "Xprite 使用指南",
    description:
      "Xprite 保存与恢复、打开与导出文件、工作区布局、触摸与手写笔、离线使用、浏览器兼容性和常见问题。",
  },
  [PublicLanguage.Japanese]: {
    path: "/ja/help/",
    title: "Xprite ユーザーガイド",
    description:
      "Xprite の保存と復元、ファイルを開く・エクスポート、ワークスペースの配置、タッチとペン操作、オフライン利用、対応ブラウザ、よくある質問。",
  },
  [PublicLanguage.Korean]: {
    path: "/ko/help/",
    title: "Xprite 사용 가이드",
    description:
      "Xprite 저장과 복구, 파일 열기와 내보내기, 작업 공간 배치, 터치와 펜 사용, 오프라인 사용, 브라우저 지원, 자주 묻는 질문을 안내합니다.",
  },
  [PublicLanguage.Russian]: {
    path: "/ru/help/",
    title: "Руководство пользователя Xprite",
    description:
      "Сохранение и восстановление проектов, открытие и экспорт файлов, рабочая область, сенсорный ввод и перо, работа офлайн, поддержка браузеров и ответы на вопросы.",
  },
  [PublicLanguage.BrazilianPortuguese]: {
    path: "/pt-BR/help/",
    title: "Guia do usuário do Xprite",
    description:
      "Salve e recupere projetos, abra e exporte arquivos, organize o espaço de trabalho, use toque e caneta, trabalhe offline e veja navegadores e dúvidas frequentes.",
  },
  [PublicLanguage.Spanish]: {
    path: "/es/help/",
    title: "Guía de usuario de Xprite",
    description:
      "Guarda y recupera proyectos, abre y exporta archivos, organiza el espacio de trabajo, usa el tacto y el lápiz, trabaja sin conexión y resuelve dudas frecuentes.",
  },
} as const;
