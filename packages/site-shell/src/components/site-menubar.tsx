import { useSyncExternalStore, useState, type ReactNode, type MouseEventHandler } from "react";

import {
  Menubar,
  MenubarLayout,
  MenuCheckType,
  PATTERNS,
  Pattern,
  PatternGroup,
  PatternKind,
  type PatternDefinition,
  type MenubarMenu,
  type MenuItem,
} from "@xprite/ui";

import { DesktopAppearance, DEFAULT_DESKTOP_PREFERENCES } from "../managers/desktop";
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

const noSubscribe = () => () => {};
const defaultSnapshot = () => DEFAULT_DESKTOP_PREFERENCES;

/** Desktop settings and application commands on the left; all site navigation on the right. */
export function SiteMenubar({
  applicationName,
  applications,
  menus = [],
  leadingContent,
  language = "en",
  languages,
  systemItems = [],
  brandImage = "/menu-icon.svg",
  label = "Website menu",
}: {
  applicationName: string;
  applications: readonly MenuItem[];
  menus?: readonly MenubarMenu[];
  leadingContent?: ReactNode;
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
  const chinese = language.startsWith("zh");
  const text = (english: string, zh: string) => (chinese ? zh : english);
  const appearanceItems = [
    [DesktopAppearance.Light, text("Light", "浅色")],
    [DesktopAppearance.Dark, text("Dark", "深色")],
    [DesktopAppearance.System, text("System", "跟随系统")],
  ] as const;
  const selectedPattern = PATTERNS.find((pattern) => pattern.id === preferences.pattern);
  const patternItem = (pattern: PatternDefinition): MenuItem => ({
    label: chinese ? pattern.labelZh : pattern.label,
    icon: (
      <Pattern
        preview
        variant={pattern.id}
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
  const languageItems: readonly SiteLanguage[] = languages ?? [
    { value: "en", label: "English", disabled: language !== "en" },
    { value: "zh-CN", label: "简体中文", disabled: language !== "zh-CN" },
  ];
  return (
    <>
      <Menubar
        layout={MenubarLayout.Flow}
        label={label}
        leadingMenus={[
          {
            label: text("Desktop settings", "桌面设置"),
            content: <img src={brandImage} width={16} height={16} alt="" />,
            items: [
              {
                label: text("Appearance", "外观"),
                disabled: !manager,
                children: appearanceItems.map(([appearance, label]) => ({
                  label,
                  checked: preferences.appearance === appearance,
                  checkType: MenuCheckType.Radio,
                  onSelect: () => manager?.setAppearance(appearance),
                })),
              },
              {
                label: text("Language", "语言"),
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
                label: text("Desktop pattern", "桌面背景"),
                disabled: !manager,
                children: [
                  {
                    label: text("Automatic", "自动"),
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
                    label: text("Pattern colors...", "图案配色..."),
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
        leadingContent={leadingContent}
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
