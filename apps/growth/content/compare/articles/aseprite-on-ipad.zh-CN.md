---
published: 2026-10-10
updated: 2026-10-10
---

# iPad 上的 Aseprite：免费接着画，或买 App

iPad 上的 Aseprite 没有官方版本。如果你要免费打开工程，再把改动存回去，就用 Xprite。如果你要笔身双击、挤压，或者把工程放进 iCloud，再去看 iPad 上的 App。

Aseprite 的[购买说明](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite)列出的安装包是 Windows、macOS 和 Ubuntu。官方没有提供 iPad 安装包。

|  | Xprite | Pixquare | Resprite | Pixaki Pro |
| --- | --- | --- | --- | --- |
| 费用 | 免费，没有内购 | 免费下载，一次买断。全设备 $24.99，仅 iPhone $7.99 | 可以订阅，也可以一次买断。试用每天的导出次数有限 | 免费 Intro 限制图层、帧和尺寸。Pro 需要另外购买 |
| 平台 | 浏览器，包括 iPad 上的 Safari | iPhone、iPad 和 Mac，没有 Android | iPhone、iPad、Android、Windows，以及 Apple 芯片的 Mac | 只有 iPad |
| 动画 | 图层、帧、标签、洋葱皮（Onion Skin），还有可编辑的瓦片地图（Tilemap） | 有洋葱皮。瓦片地图图层可以做动画 | 图层、帧、剪辑和洋葱皮。iOS R59 起有瓦片地图 | 时间轴可以拖着预览。用保持帧调时长，也有洋葱皮 |
| 导出 | .aseprite、PNG、GIF、动态 PNG（APNG）、精灵表（Sprite Sheet）。JPEG 和 WebP 要看浏览器支不支持 | PNG、BMP、JPEG、GIF、MOV、动态 PNG、精灵表、ASEPRITE、PSD、延时录像 | .resprite、.aseprite、GIF、动态 PNG、PNG 精灵表、PSD、视频 | Pro 可以导出 Aseprite，并保留图层和单元格。另有 PNG、GIF、动态 PNG、精灵表、视频和 PSD |
| 离线 | 先联网打开一次，之后可以离线画 | 装在设备上。工程可以放在本机或 iCloud | 工程在本机的「文件」App 里 | 工程可以放在本机或 iCloud |
| 多人一起改 | 不能同时编辑。分享出去的是一份副本 | 工程可以放进 iCloud，并在设备间同步 | 换设备时要自己导出工程 | 工程可以放进 iCloud，在多台设备上使用。发给别人时用 .pixaki 文件 |

## Pixquare、Resprite 和 Pixaki 做得更好的地方

Pixquare 可以设成只有笔能在画布上画。你设好以后，一根手指可以平移，也可以滑动来换帧、换图层，不过这两件事不能同时开。

Apple Pencil Pro 在画布上挤压时，Pixquare 会打开工具菜单或调色板。笔身双击则跟着系统里的铅笔设置走。

你可以把 Pixquare 的工程放在本机，也可以放进 iCloud，这样几台设备会同步同一份文件。Pixquare 按次买断。你第一次下载之后的 3 天里，全设备价格是 $19.99。

Resprite 让你自己决定笔身双击做什么。你可以把这次双击换成橡皮或取色，也可以换成上一个工具、油漆桶、铅笔，或者直接撤销。在支持的机型上，你也可以把挤压设成相近的动作。压力到了你设的阈值以后，Resprite 会再触发一个动作，笔刷大小也会跟着压力变。

Resprite 还可以装在 iPhone、Android、Windows 和 Mac 上。iPhone 需要 iOS 16，iPad 需要 iPadOS 16。Android 从 7.0 起可以安装，Windows 需要 64 位的 Windows 10 或更新版本，Mac 则要 macOS 12 或更新版本，并且是 Apple 芯片。

App Store、Google Play 和 Steam 上的购买不能通用。iPhone 和 iPad 共用你在同一个 Apple 账号里买的那一份。

试用的时候，Resprite 能导出全部格式，而且没有水印，不过每天有次数限制。Premium 去掉这个限制，并加上调色、高级描边、对称和自定义字体。Resprite 的工程放在「文件」里的 Resprite 文件夹。你换设备时要导出 `.resprite`。你如果只传一张 PNG，图层就带不过去。

Pixaki 适合你盯着时间轴改动画。你左右拖时间轴，画面会跟着走。你把某一帧调成 2 倍时长，时间轴上会多出保持帧。工程是 10 fps 时，1 倍时长是 0.1 秒，3 倍是 0.3 秒。

Pixaki 支持 Apple Pencil 2 的笔身双击。Pixaki 的单指可以设成当前工具、橡皮、平移，或者什么都不做。Pixaki 的图层分成动画层、静态层和参考层。

免费的 Intro 有 3 个图层加 1 个参考层、8 帧，画布最大 160 × 160。导入和导出 Aseprite 需要 Pro，系统需要 iPadOS 13 或更新的版本。Pro 的画布单边最长 8192 px，总像素不能超过 2 MP。

## 什么时候用 Xprite

你在电脑和 iPad 上来回改同一份 `.aseprite`，又不想再买一个编辑器，可以用 Xprite。Xprite 在浏览器里运行，免费，也没有内购。Xprite 会让 8 位索引色和 16 位灰度留在原来的颜色模式里，你可以接着画。

![打开 example.aseprite 后的 Xprite，左侧是图层，下方是帧，画布上开着洋葱皮](images/editor-with-aseprite.png)

你可以用 Apple Pencil 在 Xprite 里画。Xprite 检测到笔以后，手指就改为平移，笔负责落笔。你重新打开页面之后，要再用一次笔，手指才会改回平移。

你想把这个行为固定下来，就打开「编辑」→「首选项」→「触摸」，看「单指操作」。自动这一项的名称是「自动：使用笔前允许手指绘制」。

![首选项里的触摸页，单指操作停在自动：使用笔前允许手指绘制](images/touch-settings.png)

你用两根手指轻点画布可以撤销，三根手指轻点可以重做。你按住的话，撤销和重做会连着重复。你也可以平移、缩放，以及长按取色。这些开关怎么改，写在[手指与笔](/help/zh-CN/#手指与笔)。

没有键盘的时候，你打开「视图」→「显示」→「快捷工具栏」。你选中一块区域以后，四个方向按钮一次移动 1 像素。「约束比例」「从中心绘制」和「拖动复制」用来代替修饰键。每个按钮做什么，写在[快捷操作栏](/help/zh-CN/#快捷操作栏)。

![快捷工具栏贴在窗口左侧，里面有方向按钮，底部还可以展开更多图标](images/shortcut-toolbar.png)

Xprite 的触摸设置里没有笔身双击，也没有挤压。你要这两项，就到 Pixquare、Resprite 或 Pixaki 里设置。

你经常打开的话，可以用 Safari 的「共享 → 添加到主屏幕」。离线之前，你要先联网打开一次。以后打不开时，你再联网打开一次。步骤写在[添加到桌面与离线使用](/help/zh-CN/#添加到桌面与离线使用)。

你从「文件」里选「分享…」，可以发出链接或二维码。对方打开的是一份副本，你们不是在同一块画布上一起改。工程太大、链接放不下时，你就改为导出文件。

## iPad 上的 Aseprite 文件怎么导入

你先复制一份工程，不要拿唯一的原文件去试。

```article-diagram
{
  "kind": "flow",
  "label": "同一份 .aseprite 在电脑和 iPad 之间",
  "steps": [
    {
      "label": "你先复制一份工程",
      "detail": "原文件留在电脑上，拿到 iPad 上的是副本。"
    },
    {
      "label": "你用 Safari 打开 Xprite",
      "detail": "导入这份 .aseprite 以后，Xprite 会读进图层和帧。"
    },
    {
      "label": "你在 iPad 上接着改",
      "detail": "画完以后，你用「另存为」把文件存回这台设备。"
    },
    {
      "label": "你再把文件拷回电脑",
      "detail": "你用原来的编辑器打开，就可以继续改。"
    }
  ]
}
```

Xprite 能打开 `.ase` 和 `.aseprite`。打开以后，Xprite 会读进图像图层、图层组和瓦片地图图层，瓦片集也会留下来。Xprite 按文件里的毫秒数读写帧时长。播放方向可以是正向、反向、乒乓或反向乒乓，重复次数也会留下来。Xprite 还会把切片写回文件。

Xprite 打不开参考图层、不支持的混合模式，以及放在外部文件里的瓦片集。这种文件不会替换你已经打开的工程。颜色深度不是 8 位、16 位或 32 位时，Xprite 也打不开。

保存的时候，你打开「文件」→「另存为」。你选「资源管理器」以后，文件会落到这台设备上。浏览器没有保存窗口时，Xprite 会直接下载。

你选「浏览器」的话，只能在这台设备的这个浏览器里再打开。你清除网站数据时，恢复备份也会一起删掉。保存和恢复的步骤写在[保存与恢复](/help/zh-CN/#保存与恢复)。

![另存为对话框，保存位置并排着浏览器和资源管理器](images/save-as-browser-or-files.png)

你用 [Pixquare](https://docs.pixquare.art/pixquare-file/create-import) 导入 `.ase` 或 `.aseprite` 时，可以转成 `.px`，也可以保留原来的格式。你如果保留原格式，Pixquare 会关掉自动保存、自动备份和延时录像。Pixquare 的[导出列表](https://docs.pixquare.art/pixquare-file/exporting)里有 ASEPRITE。

你用 [Resprite](https://resprite.fengeon.com/docs/files/aseprite) 导入以后，工程会变成 `.resprite`。Resprite 会把帧时长按 100 ms 一档截断，更短的也会变成 100 ms。重叠的标签留不下来，反向乒乓会变成普通乒乓，标签的重复次数也不保留。索引色像素会变成普通颜色，调色板里的颜色名字也会丢掉。Aseprite 的瓦片地图则不会变成可编辑地图。

你从 Resprite 再导出 `.aseprite` 时，Resprite 自己的瓦片地图会变成普通像素。描边和阴影这类实时样式不会画进图里。组的不透明度和混合模式也不会留在组上。

Pixaki 要 Pro 才能导入和导出 Aseprite。Pixaki [导出](https://pixaki.com/user-guide/export/)时会保留图层和单元格。Pixaki 的时长等于工程帧率乘上保持帧。你带回电脑以后，先播放一遍，看停顿还在不在。

PNG、GIF 和精灵表适合把画好的内容交出去。你还要改图层的话，就另外留一份可编辑工程。如果你只要导出 GIF，就看 [Aseprite 转 GIF](/learn/aseprite-to-gif/)。如果你只想在浏览器里打开工程，就看 [在线编辑 Aseprite](/compare/aseprite-online/)。

你想先看手感，就用 Safari 打开 [Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-on-ipad)。你先导入一份副本，然后试一下撤销、换帧和保存。

## 常见问题

### Aseprite 有 iPad 版吗？

Aseprite 没有 iPad 版。购买说明里列出的是 Windows 安装包、macOS 应用和 Ubuntu 的 deb 包。

### 没有 Aseprite 文件也能用 Xprite 吗？

Xprite 不要求你先有 Aseprite 文件。你可以新建画布，直接画，也可以做动画。你已经有 `.ase` 或 `.aseprite` 时，再打开就行。

### Xprite 断网还能在 iPad 上画吗？

Xprite 断网以后还能画，不过你要先联网打开过一次。离线打不开时，你再联网打开一次。换设备之前，你用「另存为」里的「资源管理器」存一份文件。

### 双指撤销和笔身双击是一回事吗？

这两件事不是一回事。双指撤销是两根手指轻点画布，Xprite 默认可以这样撤销。笔身双击是点 Apple Pencil 的笔杆，Xprite 的触摸设置里没有这项。Pixquare、Resprite 和 Pixaki 可以设置笔身操作。
