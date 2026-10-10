---
published: 2026-10-10
updated: 2026-10-10
---

# 在线编辑 Aseprite：4 个浏览器工具对比

Aseprite 只有桌面版，[官方](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite)提供 Windows、macOS 和 Ubuntu 三种平台的安装包。所以要在浏览器里打开 `.aseprite` 工程，就得换一个能读这种文件的工具。Xprite、Novaboard、Manabit 和 Pixelorama 都能导入 `.aseprite`，差别在于导入后保留多少内容、能不能存回 `.aseprite`，以及要不要登录：

- 只想看看文件，或者导出一张 PNG、一段 GIF：用 [Xprite 查看器](/tools/viewer/?lang=zh-CN&utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)。
- 改完还要交回给用 Aseprite 的人：用 Xprite 或 Pixelorama，这两个都能存回 `.aseprite`。
- 主要在浏览器里画新动画，输出 GIF、视频或游戏素材：Novaboard 和 Manabit 也值得看看。

|  | Xprite | Novaboard | Manabit | Pixelorama |
| --- | --- | --- | --- | --- |
| 价格 | 🆓 免费 | 🆓 免费 | 🆓 免费版有额度 | 🆓 免费 |
| 账号 | ✅ 不需要 | ✅ 不需要 | ⚠️ 保存要登录 | — |
| 导入 `.aseprite` | ✅ 按原格式打开 | ✅ 支持 | ⚠️ 转成图层动画 | ⚠️ 不含切片、蒙版 |
| 存回 `.aseprite` | ✅ 支持 | — | — | ✅ v1.2.2 起支持 |
| 其他导出 | ✅ PNG、GIF、APNG、精灵表 | ✅ GIF、MP4、精灵表 | ✅ PNG、JPG、GIF、动画条 | ✅ PNG、GIF、APNG、精灵表 |
| 动画 | ✅ 帧、标签、洋葱皮 | ✅ 帧、标签、洋葱皮 | ✅ 图层动画、同步播放 | ✅ 帧、标签、音频图层 |
| 瓦片地图（Tilemap） | ✅ 可编辑 | ⚠️ 无缝平铺模式 | ✅ 地图编辑器 | ✅ 瓦片地图图层 |
| 离线与桌面版 | ⚠️ 先联网打开一次 | ✅ 可以离线用 | 💰 Windows 版需买断 | ✅ 免费桌面版 |

## 先用查看器看文件

收到别人发来的 `.aseprite`，往往只需要确认内容，或者截一帧发出去。这时用 Xprite 查看器就够了：

1. 打开[查看器](/tools/viewer/?lang=zh-CN)，点「文件」→「打开文件…」，或者直接拖入 `.ase`、`.aseprite`。
2. 播放动画，在「动画范围」里选一个标签，或者选「所有帧」。
3. 点「文件」→「导出动画（.gif）」导出 GIF，或者点「导出当前帧（.png）」导出单帧 PNG。

![查看器的「文件」菜单，包含「在 Xprite 中编辑」「导出动画（.gif）」和「导出当前帧（.png）」](images/viewer-file-menu.png)

在查看器里隐藏图层只影响预览和导出，不会改动原文件。需要修改时，点「在 Xprite 中编辑」，编辑器打开的是原始文件。

## 在浏览器里改完再存回 `.aseprite`

Xprite 编辑器按原格式读入 `.ase` 和 `.aseprite`，图层、图层组、瓦片地图、标签和以毫秒计的帧时长都会保留。改完以后，用「文件」→「另存为」→「资源管理器」把 `.aseprite` 存到设备上，再用 Aseprite 打开就能接着改。

![打开 example.aseprite 后的 Xprite，左侧是图层，下方是帧，画布上开着洋葱皮](images/editor-with-aseprite.png)

下面几种文件 Xprite 打不开，当前打开的工程也不会受影响：

- 颜色深度不是 8、16 或 32 位
- 画布单边超过 32,768 像素
- 超过 4,096 帧或 256 个图层

「另存为」里的另一个位置是「浏览器」。存在这里的工程只能在同一台设备的同一个浏览器里打开，清除网站数据时也会一起删掉。要交给别人的文件，存到「资源管理器」更稳妥。

![另存为对话框，保存位置并排着浏览器和资源管理器](images/save-as-browser-or-files.png)

Pixelorama 从 [v1.2.2](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2)（2026 年 9 月 9 日）起也能导出 `.aseprite`。不过它的[导入](https://pixelorama.org/user_manual/Import)不包括切片、单元格附加数据、颜色配置、外部文件和蒙版，灰度工程还会转成 RGBA。导入时没读进来的内容，导出时也不会恢复。

## Novaboard、Manabit 和 Pixelorama 做得更好的地方

这三个工具更偏向在浏览器里从头画，各有 Xprite 没有的功能：

- [Novaboard](https://marcel0ll.itch.io/novaboard)：不用安装也不用注册。除了 `.aseprite`，还能打开 PSD、ORA、GAL、PIXIL 和动态 GIF；导出 MP4 和 JSON 图集，图层支持色相、曲线、对比度等非破坏性调整。
- [Manabit](https://manabit.app/docs/features/import-export/)：同一个工程里可以放角色、瓦片集、地图和界面，地图编辑器（Map Builder）直接用瓦片集铺关卡。导出时可以把动画存成每行一个动画的 PNG 动画条，缩放倍数 1× 到 8×。免费版登录后有 1 个本地工程，以及 1 个云端工程和 25 MB 云存储；买断 License 后本地工程不限数量，并且可以用 Windows 桌面版。
- [Pixelorama](https://pixelorama.org/user_manual/installation)：开源免费，有 Windows、macOS、Linux 桌面版和网页版，Android 版还在实验阶段。时间轴支持音频图层，瓦片地图有矩形、等距和六边形三种。

## 什么时候还需要桌面版 Aseprite

如果工作流程依赖 Aseprite 的[扩展、脚本或命令行导出](https://www.aseprite.org/docs/)，还是继续用桌面版。浏览器工具更适合查看文件、临时修改和交付成品。

## 常见问题

### Aseprite 有网页版吗？

官方没有。Aseprite 只提供 Windows、macOS 和 Ubuntu 版。

### `.ase` 和 `.aseprite` 有区别吗？

没有区别，两者是同一种格式。Xprite 两种扩展名都能打开。

### 在浏览器里打开的文件会上传吗？

Xprite 查看器在本地处理文件，不上传云端。编辑器存到「浏览器」的工程也只留在当前设备。

---

想直接动手，可以[在查看器中打开文件](/tools/viewer/?lang=zh-CN&utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)，或者[用 Xprite 编辑](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online)。只需要导出动图的话，可以看 [Aseprite 转 GIF](/zh-CN/learn/aseprite-to-gif/)；在 iPad 上编辑的方案见 [iPad 上的 Aseprite](/zh-CN/compare/aseprite-on-ipad/)。
