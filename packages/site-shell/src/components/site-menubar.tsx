import { useSyncExternalStore, useState, type MouseEventHandler } from "react";

import {
  Button,
  ButtonAppearance,
  Icon,
  IconKind,
  IconSize,
  Menubar,
  MenubarLayout,
  MenuCheckType,
  PATTERNS,
  Pattern,
  PatternGroup,
  PatternKind,
  Tooltip,
  TooltipPlacement,
  type PatternDefinition,
  type MenubarMenu,
  type MenuItem,
} from "@xprite/ui";

import { DesktopAppearance, DEFAULT_DESKTOP_PREFERENCES } from "../managers/desktop";
import { SITE_LANGUAGE_LABELS, SITE_LANGUAGES, sitePatternLabel, siteText } from "../site-language";
import { useDesktop } from "./desktop-provider";
import { PatternColors } from "./pattern-colors";

export interface SiteLanguage {
  label: string;
  value: string;
  href?: string;
  onSelect?: () => void;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  disabled?: boolean;
}

export interface SiteMenubarHelp {
  label: string;
  href: string;
  tooltip?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

const noSubscribe = () => () => {};
const defaultSnapshot = () => DEFAULT_DESKTOP_PREFERENCES;

/** Brand and application menus on the left; site navigation and help on the right. */
export function SiteMenubar({
  applicationName,
  applications,
  menus = [],
  help,
  language = "en",
  languages,
  systemItems = [],
  brandImage = "/menu-icon.svg",
  label = "Website menu",
}: {
  applicationName: string;
  applications: readonly MenuItem[];
  menus?: readonly MenubarMenu[];
  help?: SiteMenubarHelp;
  language?: string;
  languages?: readonly SiteLanguage[];
  systemItems?: readonly MenuItem[];
  brandImage?: string;
  label?: string;
}) {
  const manager = useDesktop();
  const [editingColors, setEditingColors] = useState<PatternDefinition>();
  const preferences = useSyncExternalStore(
    manager?.subscribe ?? noSubscribe,
    manager?.getSnapshot ?? defaultSnapshot,
    manager?.getServerSnapshot ?? defaultSnapshot,
  );
  const text = (
    english: string,
    zh: string,
    ja: string,
    ko: string,
    ru: string,
    pt: string,
    es: string,
  ) => siteText(language, english, zh, ja, ko, ru, pt, es);
  const appearanceItems = [
    [
      DesktopAppearance.Light,
      text("Light", "浅色", "ライト", "라이트", "Светлая", "Claro", "Claro"),
    ],
    [DesktopAppearance.Dark, text("Dark", "深色", "ダーク", "다크", "Тёмная", "Escuro", "Oscuro")],
    [
      DesktopAppearance.System,
      text(
        "System",
        "跟随系统",
        "システムに合わせる",
        "시스템 설정",
        "Как в системе",
        "Sistema",
        "Sistema",
      ),
    ],
  ] as const;
  const selectedPattern = PATTERNS.find((pattern) => pattern.id === preferences.pattern);
  const patternItem = (pattern: PatternDefinition): MenuItem => ({
    label: sitePatternLabel(pattern, language),
    icon: (
      <Pattern
        preview
        pattern={pattern.id}
        scale={16 / Math.max(pattern.width, pattern.height)}
        foreground={preferences.patternForeground}
        background={preferences.patternBackground}
        style={{ width: 16, height: 16 }}
      />
    ),
    checked: preferences.pattern === pattern.id,
    checkType: MenuCheckType.Radio,
    onSelect: () => manager?.setPattern(pattern.id),
  });
  const languageItems: readonly SiteLanguage[] =
    languages ??
    SITE_LANGUAGES.map((value) => ({
      value,
      label: SITE_LANGUAGE_LABELS[value],
      disabled: language !== value,
    }));
  return (
    <>
      <Menubar
        layout={MenubarLayout.Flow}
        expandOnHover
        label={label}
        leadingMenus={[
          {
            label: text(
              "Desktop settings",
              "桌面设置",
              "デスクトップ設定",
              "데스크톱 설정",
              "Настройки рабочего стола",
              "Configurações da área de trabalho",
              "Ajustes del escritorio",
            ),
            content: <img src={brandImage} width={16} height={16} alt="" />,
            items: [
              {
                label: text(
                  "Appearance",
                  "外观",
                  "外観",
                  "모양",
                  "Оформление",
                  "Aparência",
                  "Apariencia",
                ),
                disabled: !manager,
                children: appearanceItems.map(([appearance, label]) => ({
                  label,
                  checked: preferences.appearance === appearance,
                  checkType: MenuCheckType.Radio,
                  onSelect: () => manager?.setAppearance(appearance),
                })),
              },
              {
                label: text("Language", "语言", "言語", "언어", "Язык", "Idioma", "Idioma"),
                disabled: !languages,
                children: languageItems.map((option) => ({
                  label: option.label,
                  href: option.href,
                  onSelect: option.onSelect,
                  onClick: option.onClick,
                  disabled: option.disabled,
                  checked: option.value === language,
                  checkType: MenuCheckType.Radio,
                })),
              },
              {
                label: text(
                  "Desktop pattern",
                  "桌面背景",
                  "デスクトップパターン",
                  "데스크톱 패턴",
                  "Узор рабочего стола",
                  "Padrão da área de trabalho",
                  "Patrón del escritorio",
                ),
                disabled: !manager,
                children: [
                  {
                    label: text(
                      "Automatic",
                      "自动",
                      "自動",
                      "자동",
                      "Автоматически",
                      "Automático",
                      "Automático",
                    ),
                    checked: !preferences.pattern,
                    checkType: MenuCheckType.Radio,
                    onSelect: () => manager?.setPattern(),
                  },
                  ...[
                    { group: PatternGroup.System7, label: "System 7" },
                    { group: PatternGroup.System75, label: "System 7.5" },
                    { group: PatternGroup.MacOS8, label: "Mac OS 8" },
                  ].map(({ group, label }) => ({
                    label,
                    children: PATTERNS.filter((pattern) => pattern.group === group).map(
                      patternItem,
                    ),
                  })),
                  {
                    label: text(
                      "Pattern colors...",
                      "图案配色...",
                      "パターンの配色...",
                      "패턴 색상...",
                      "Цвета узора...",
                      "Cores do padrão...",
                      "Colores del patrón...",
                    ),
                    separator: true,
                    disabled: selectedPattern?.kind !== PatternKind.TwoColor,
                    onSelect: () => {
                      if (selectedPattern) setEditingColors(selectedPattern);
                    },
                  },
                ],
              },
              ...systemItems,
            ],
          },
        ]}
        trailingContent={
          help && (
            <Tooltip text={help.tooltip ?? help.label} placement={TooltipPlacement.TopRight}>
              <Button
                href={help.href}
                onClick={help.onClick}
                appearance={ButtonAppearance.Quiet}
                slots={{ leading: <Icon kind={IconKind.Help} size={IconSize.Small} /> }}
                aria-label={help.label}
                role="menuitem"
              />
            </Tooltip>
          )
        }
        menus={menus}
        trailingMenus={[
          {
            label: applicationName,
            mnemonicIndex: -1,
            items: applications,
          },
        ]}
      />
      {editingColors && manager && (
        <PatternColors
          manager={manager}
          pattern={editingColors}
          language={language}
          onClose={() => setEditingColors(undefined)}
        />
      )}
    </>
  );
}
