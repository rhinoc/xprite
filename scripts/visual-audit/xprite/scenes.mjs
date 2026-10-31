export const layouts = [
  { mode: "wide", width: 1440, height: 900 },
  { mode: "compact", width: 390, height: 844 },
];

export const scenes = [
  "home",
  "recovery",
  "editor",
  "preferences",
  "edit-menu",
  "new-sprite",
  "save-as",
  "export-file",
  "gif-options",
  "color-picker",
  "tooltip",
  "layer-properties",
];

export const sceneIds = layouts.flatMap(({ mode }) => scenes.map((view) => `${view}-${mode}`));

export function selectSceneIds(selection) {
  if (selection === undefined) return sceneIds;
  const selected = selection.split(",");
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((view) => !scenes.includes(view))
  )
    throw Error(`--scenes must list unique scene names from: ${scenes.join(", ")}`);
  return sceneIds.filter((id) =>
    selected.some((view) => layouts.some(({ mode }) => id === `${view}-${mode}`)),
  );
}

export const languages = ["zh-CN", "en", "ja", "ko", "ru", "pt-BR", "es"];
const LANGUAGE_DIRECTORIES = {
  "zh-CN": "zh",
  en: "en",
  ja: "ja",
  ko: "ko",
  ru: "ru",
  "pt-BR": "pt-BR",
  es: "es",
};
/** Other locales cover dense controls and long menu labels; zh-CN and English cover every view. */
const REDUCED_LANGUAGES = new Set(["ja", "ko", "ru", "pt-BR", "es"]);
const REDUCED_SCENE_IDS = ["preferences-wide", "edit-menu-compact"];

/** The canonical scene ids a language captures, in canonical order. */
export function languageSceneIds(language, ids = sceneIds) {
  return REDUCED_LANGUAGES.has(language) ? ids.filter((id) => REDUCED_SCENE_IDS.includes(id)) : ids;
}

export function selectLanguages(selection) {
  if (selection === undefined) return languages;
  const selected = selection.split(",");
  if (
    new Set(selected).size !== selected.length ||
    selected.some((language) => !languages.includes(language))
  )
    throw Error(`--languages must list unique language codes from: ${languages.join(", ")}`);
  return selected;
}

export function languageDirectory(root, language) {
  return `${root}/${LANGUAGE_DIRECTORIES[language]}`;
}
