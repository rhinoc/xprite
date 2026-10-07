import { ARTICLES } from "../articles/index.ts";
import { TOOLS, TOOLS_HOME } from "../tools/index.ts";

/** Page discovery data only; the independent apps supply their own commands and settings. */
export function siteApplications(
  currentPath: string,
  language = "en",
  includeGallery = false,
  guideHref?: string,
) {
  const chinese = language.startsWith("zh");
  const helpHref =
    guideHref ?? TOOLS.find((tool) => tool.path === currentPath)?.guidePath ?? `/help/${language}/`;
  const application = (label: string, href: string, separator = false) => ({
    label,
    href,
    checked: currentPath === href,
    current: currentPath === href,
    separator,
  });
  return [
    application(chinese ? "像素编辑器" : "Xprite Editor", "/editor"),
    application(chinese ? "设备演示" : "Device demos", `/showcase/${language}/`),
    {
      label: chinese ? "工具" : "Tools",
      children: [
        application(chinese ? "工具总站" : "All tools", TOOLS_HOME.path),
        ...TOOLS.map((tool) => application(tool.label, tool.path)),
      ],
    },
    {
      label: chinese ? "指南" : "Guides",
      children: [
        application(chinese ? "使用指南" : "User guide", helpHref),
        application(chinese ? "文件导出指南" : "All file guides", "/learn/", true),
        ...ARTICLES.filter((article) => article.collection === "learn").map((article) =>
          application(article.title, article.path),
        ),
      ],
    },
    {
      label: chinese ? "比较" : "Compare",
      children: [
        application(chinese ? "全部工具比较" : "All comparisons", "/compare/"),
        ...ARTICLES.filter((article) => article.collection === "compare").map((article) =>
          application(article.title, article.path),
        ),
      ],
    },
    ...(includeGallery ? [application("UI Gallery", "/gallery/")] : []),
  ];
}
