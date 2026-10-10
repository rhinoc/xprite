import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { PublicLanguage } from "@xprite/growth-content/language";

const CHINESE: Readonly<Record<string, string>> = {
  "(default)": "（默认）",
  Others: "其他",
  "UI Gallery": "UI 组件库",
  "Gallery menu": "组件库菜单",
  "Gallery navigation": "组件库导航",
  "UI components": "UI 组件",
  "UI atlas icons": "UI 图标图集",
  "Atlas icons": "图集图标",
  Components: "组件",
  Icons: "图标",
  Search: "搜索",
  "Find a component, prop, or icon": "查找组件、参数或图标",
  Console: "控制台",
  "Console output": "控制台输出",
  "Clear Console": "清空控制台",
  Parameters: "参数",
  "Filter parameters": "筛选参数",
  "Filter…": "筛选…",
  Reset: "重置",
  "Reset parameters": "重置参数",
  "Advanced parameters": "高级参数",
  Edit: "编辑",
  Theme: "主题",
  Preview: "预览",
  "Open preview": "打开预览",
  "Open editor": "打开编辑器",
  "Copy failed": "复制失败",
  "Tooltip help": "提示帮助",
  "Brush size": "笔刷大小",
  Animation: "动画",
  "8 frames": "8 帧",
  "Export the animation": "导出动画",
  "Sprite notes": "精灵备注",
  "Transparent background": "透明背景",
  Callbacks: "回调",
  "Host props": "宿主参数",
  Value: "值",
  Default: "默认",
  Enabled: "已启用",
  Disabled: "已禁用",
  "No matching components": "没有匹配的组件",
  "No matching icons": "没有匹配的图标",
  Controls: "控件",
  Typography: "文字",
  Containers: "容器",
  Navigation: "导航",
  Overlays: "浮层",
  Media: "媒体",
  OK: "确定",
  Cancel: "取消",
  Save: "保存",
  Open: "打开",
  Close: "关闭",
  Help: "帮助",
  Play: "播放",
  Pause: "暂停",
};

export function translateGalleryText(source: string, language: PublicLanguage): string {
  if (source === "ui.close.name")
    return language === PublicLanguage.SimplifiedChinese ? "关闭 {name}" : "Close {name}";
  if (language === PublicLanguage.English) return source;
  const text = source.trim();
  if (CHINESE[text]) return CHINESE[text];
  if (text.startsWith("Copied: ")) return text.replace(/^Copied: /, "已复制：");
  if (/^Open .+ preview$/.test(text)) return text.replace(/^Open (.+) preview$/, "打开 $1 预览");
  if (text.endsWith(" scroll"))
    return `${translateGalleryText(text.replace(/ scroll$/, ""), language)}滚动`;
  if (text.startsWith("Copy ")) return text.replace(/^Copy /, "复制 ");
  if (text.endsWith(" preview")) return text.replace(/ preview$/, " 预览");
  if (text.endsWith(" page")) return text.replace(/ page$/, " 页面");
  return source;
}

interface GalleryLanguageState {
  language: PublicLanguage;
  setLanguage(language: PublicLanguage): void;
  translate(source: string): string;
}
const GalleryLanguageContext = createContext<GalleryLanguageState>({
  language: PublicLanguage.English,
  setLanguage: () => {},
  translate: (source) => source,
});

export function GalleryLanguageProvider({
  language: initialLanguage,
  onChange,
  children,
}: {
  language: PublicLanguage;
  onChange(language: PublicLanguage): void;
  children: ReactNode;
}) {
  const [language, update] = useState(initialLanguage);
  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: PublicLanguage) => {
        update(next);
        onChange(next);
      },
      translate: (source: string) => translateGalleryText(source, language),
    }),
    [language, onChange],
  );
  return (
    <GalleryLanguageContext.Provider value={value}>{children}</GalleryLanguageContext.Provider>
  );
}
export function useGalleryLanguage() {
  return useContext(GalleryLanguageContext);
}
export function useGalleryTranslation() {
  return useGalleryLanguage().translate;
}
