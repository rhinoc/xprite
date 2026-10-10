# 在线编辑 Aseprite

要在浏览器中继续编辑 `.aseprite` 工程，应选择能打开其图层和动画、完成所需修改，并保存后续所需格式的工具。

Aseprite 官方下载提供 Windows、macOS 和 Linux 桌面应用。下面的浏览器工具是独立产品，各有不同的导入和导出支持。选定工具后，检查工程的图层、标签和时长。[Aseprite 常见问题](https://www.aseprite.org/faq/)

## 查看 Aseprite 文件

可以先用[Xprite Aseprite 查看器](/tools/viewer/?lang=zh-CN&utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)检查文件。它打开本地 `.ase`、`.aseprite` 文件，预览帧和动画标签，并导出 PNG 单帧或 GIF 动画。**在 Xprite 中编辑**按钮会把原始文件交给编辑器，不会带入仅用于预览的图层可见性变化。[Xprite 使用指南](/help/zh-CN/)

收到他人发来的工程后，这适合用于先检查内容。如果只需要消息中的图片或动画预览，查看器可能已能完成任务；需要绘画或修改文档时，再打开编辑器。

分享完成的作品可用 PNG 或 GIF，继续编辑则保留工程文件。如果协作者使用 Aseprite，请确认工具能保存 Aseprite 文档，并检查结果是否保留了所需图层和动画。

| 工具 | 浏览器使用方式 | 已有 Aseprite 文件 | 使用前需要检查 |
| --- | --- | --- | --- |
| Xprite | 浏览器编辑器和独立查看器 | 打开 `.ase`、`.aseprite`；编辑器可保存 Aseprite 文件 | 检查导入工程；不支持的功能和浏览器资源限制可能阻止打开 |
| Novaboard | 免费浏览器编辑器 | 开发者说明支持 `.ase`、`.aseprite` 导入 | 文档列出的输出包括 GIF、MP4、精灵表和图集；保存 Aseprite 格式需单独确认 |
| Manabit | 浏览器编辑器；付费许可也包含 Windows | 文档介绍了图层、帧和标签到其图层动画的转换 | 保存需登录；文档中的输出包括图片、GIF 和动画条带 |
| Pixelorama | 提供免费 Web 版和桌面应用 | 文档说明支持 Aseprite 导入，v1.2.2 增加了导出 | 检查导入限制和输出结果；`.pxo` 仍是其自己的工程格式 |
| Aseprite | 官方桌面应用 | 原生格式和工作流程 | 需要安装桌面应用 |

各工具的导入导出选项见：[Xprite 使用指南](/help/zh-CN/)、[Novaboard 开发者页面](https://marcel0ll.itch.io/novaboard)、[Manabit 导入与导出](https://manabit.app/docs/features/import-export/)、[Pixelorama 导入](https://pixelorama.org/user_manual/Import)、[Pixelorama v1.2.2](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2)。

## 浏览器编辑器

**需要查看 Aseprite 文件，或在浏览器中修改并保存 Aseprite 副本时，可以尝试 Xprite。**查看器的编辑按钮会打开原始文件。通过**文件 → 另存为 → 资源管理器**保存独立结果，再在后续使用该文件的应用中重新打开，检查图层、标签和时长。[Xprite 使用指南](/help/zh-CN/)

**需要免费的浏览器动画工作区，以及图片或游戏资源输出时，可以考虑 Novaboard。**开发者列出的功能包括时间轴标签、洋葱皮、索引色和非破坏性图层效果。处理已有工程时，先检查导入结构和保存选项，再承诺向别人交付 `.aseprite` 文件。[Novaboard 开发者页面](https://marcel0ll.itch.io/novaboard)

**精灵和地图需要放在同一工程中时，可以考虑 Manabit。**它把 Aseprite 内容映射到自己的动画系统，已有标签含义重要时，应检查转换结果。免费版文档列出一个本地工程、一个云端工程和 25 MB 存储空间；保存需要账号，部分浏览器功能可能需要许可。[Manabit 免费功能](https://manabit.app/docs/features/available-for-free/)、[浏览器文档](https://manabit.app/docs/basics/browser/)

**需要免费的 Aseprite 导入和导出工具时，可以考虑 Pixelorama。**v1.2.2 于 2026 年 9 月 9 日增加 Aseprite 导出；本文查看的官方浏览器应用显示版本为 v1.2.3。导入清单包含瓦片地图图层和链接单元格，但不包含切片、颜色配置、外部文件、蒙版和单元格附加数据，灰度会转换为 RGBA。导出功能无法恢复导入时遗漏的信息，应先检查有代表性的文件。[v1.2.2 发布说明](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2)、[导入清单](https://pixelorama.org/user_manual/Import)、[官方浏览器版](https://orama-interactive.itch.io/pixelorama)

## 依赖桌面 Aseprite 的流程

如果工作依赖特定 Aseprite 扩展、脚本、命令行导出或准确的原生文档行为，在用工程副本验证替代工具前，请保留 Aseprite 流程。脚本、扩展和瓦片地图的操作见 [Aseprite 文档](https://www.aseprite.org/docs/)。

在浏览器中编辑时，保留原始文件，检查导入后的图层和时长，并保存独立结果。根据下一步选择输出：继续创作用可编辑工程，游戏流程用精灵表，查看用 PNG 或 GIF。

[在查看器中打开文件](/tools/viewer/?lang=zh-CN&utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)，或[开始使用 Xprite 编辑](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)。

## 资料来源

产品信息依据官方文档和开发者页面，于 **2026 年 10 月 4 日**核对。设备性能和文件往返兼容性尚未实测。

- [Aseprite 常见问题与桌面下载](https://www.aseprite.org/faq/)
- [Aseprite 文档](https://www.aseprite.org/docs/)
- [Xprite 使用指南](/help/zh-CN/)
- [Novaboard 开发者页面](https://marcel0ll.itch.io/novaboard)
- [Manabit 导入与导出](https://manabit.app/docs/features/import-export/)
- [Manabit 免费功能](https://manabit.app/docs/features/available-for-free/)
- [Manabit 浏览器文档](https://manabit.app/docs/basics/browser/)
- [Pixelorama 安装](https://pixelorama.org/user_manual/installation)
- [Pixelorama 导入](https://pixelorama.org/user_manual/Import)
- [Pixelorama 保存与导出](https://pixelorama.org/user_manual/save_and_export)
- [Pixelorama v1.2.2：Aseprite 导出](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2)
- [Pixelorama 官方浏览器版](https://orama-interactive.itch.io/pixelorama)
