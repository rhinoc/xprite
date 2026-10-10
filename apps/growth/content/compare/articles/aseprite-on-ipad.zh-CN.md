# 2026年最适合在 iPad 上使用的像素化编辑工具

在 iPad 上画像素画或做精灵动画，可以用 [Pixquare](https://www.pixquare.art/)、[Resprite](https://resprite.fengeon.com/)和[Pixaki Pro](https://pixaki.com/)这些原生应用。它们支持 Apple Pencil，也能读写 Aseprite 文件，适合从电脑带一个工程过来接着画。

除了 iPad 应用，你也可以用网页版的像素编辑器。[Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-on-ipad)就是一个免费的选择：在 Safari 里打开就能绘画、做动画和编辑 Tilemap，已有的 Aseprite 工程也可以直接导入。

网页版也能像 App 一样打开。支持 PWA 的产品可以加入主屏幕，以后点图标进入独立窗口，没有浏览器地址栏，打开方式和原生应用很接近。

其他支持 PWA 的网页产品也有这种能力。Xprite 还支持[离线编辑](/help/zh-CN/#添加到桌面与离线使用)，先联网打开一次编辑器，之后没有网络也能接着画。

```article-diagram
{
  "kind": "map",
  "label": "iPad 上的两类像素编辑器",
  "root": "iPad\n像素画与动画",
  "branches": [
    {
      "label": "网页应用",
      "featured": true,
      "items": [
        {
          "label": "Xprite",
          "detail": "免费 · 可离线使用",
          "href": "/editor?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-on-ipad"
        }
      ]
    },
    {
      "label": "iPad 应用",
      "items": [
        {
          "label": "Pixquare",
          "href": "https://www.pixquare.art/"
        },
        {
          "label": "Resprite",
          "href": "https://resprite.fengeon.com/"
        },
        {
          "label": "Pixaki Pro",
          "href": "https://pixaki.com/"
        }
      ]
    }
  ]
}
```

## 四款工具的区别

✅ 支持　⚠️ 有限制　❌ 不支持

| 功能 | Xprite | Pixquare | Resprite | Pixaki Pro |
| --- | :---: | :---: | :---: | :---: |
| 完整功能免费 | ✅ | ❌ | ❌ | ❌ |
| 付费方式 | 免费 | 一次性解锁 | 订阅或买断 | 付费 Pro |
| 浏览器直接编辑 | ✅ | ❌ | ❌ | ❌ |
| 跨设备保存 | 导出文件 | [iCloud](https://docs.pixquare.art/gallery/storage-location) | [导出文件](https://resprite.fengeon.com/docs/files/export) | [iCloud](https://pixaki.com/user-guide/gallery/) |
| 编辑时的工程格式 | Aseprite | `.px` 或 Aseprite | `.resprite` | Pixaki 工程 |
| 手写笔绘画 | ✅ | ✅ | ✅ | ✅ |
| 手势快捷操作 | ⚠️ 触控 | ✅ 触控＋笔身 | ✅ 触控＋笔身 | ✅ 触控＋笔身 |
| 图层和动画 | ✅ | ✅ | ✅ | ✅ |
| 洋葱皮 | ✅ | ✅ | ✅ | ✅ |
| Tilemap 编辑 | ✅ | ✅ | ✅ | ❌ |
| Aseprite 读写 | ✅ | ✅ | ⚠️ 试用导出限次 | ✅ |

四款都能画精灵、做动画。区别主要在费用、使用方式、笔身手势，以及已有工程在转换时会发生什么变化。

## 按用途选择编辑器

### 免费绘画、离线使用和 Aseprite 工程：Xprite

想免费开始画，或者需要在电脑和 iPad 之间来回编辑 Aseprite 工程，可以选 Xprite。图层、帧、动画标签、洋葱皮和 Tilemap 都能用，Aseprite 导入导出也免费。

在 iPad 上用 Apple Pencil 绘画时，手指默认移动画面。[双指轻点撤销、三指轻点重做](/help/zh-CN/#手指与笔)都能用，按住还可以连续撤销或重做。没有键盘时，[快捷操作栏](/help/zh-CN/#快捷操作栏)可以移动选区、约束比例、从中心绘制或拖动复制。笔身双击和挤压手势则是下面几款原生应用值得比较的地方。

把电脑上的 `.aseprite` 工程带过来，Xprite 会保留图层、动画标签和原有帧时长。索引色工程可以按原颜色模式继续编辑，瓦片地图和瓦片集也保持可编辑。改完再保存成 Aseprite 文件，就能带回电脑接着修改。

如果准备经常在 iPad 上使用，用 Safari 打开 Xprite，选择[**共享 → 添加到主屏幕**](/help/zh-CN/#添加到桌面与离线使用)。编辑完通过[**文件 → 另存为 → 资源管理器**](/help/zh-CN/#保存与恢复)保存独立文件；不支持保存对话框的浏览器会直接下载。浏览器中的副本只留在当前浏览器，换设备或清除网站数据前，先另存文件。

### Pencil Pro 工具菜单、调色板和瓦片动画：Pixquare

习惯用 Pencil Pro 挤压调出工具或选色，可以看看 Pixquare。它的[挤压手势](https://docs.pixquare.art/interface-and-gestures/gestures-and-quick-actions)可以打开工具菜单或调色板，笔身双击跟随系统设置；绘画时也能设置成[笔负责绘画、手指负责移动画面](https://docs.pixquare.art/settings/drawing)。

Pixquare 支持[瓦片地图和瓦片集](https://docs.pixquare.art/misc/tilemap-tileset-system)，瓦片地图图层可以做动画。工程可以放在 iCloud，完成后能[导出 ASEPRITE 或合成图片](https://docs.pixquare.art/pixquare-file/exporting)。

它[免费下载，一次性付费解锁](https://www.pixquare.art/faqs)。导入 Aseprite 文件时，可以转成 `.px` 格式，也可以[保留原格式](https://docs.pixquare.art/pixquare-file/create-import)，但后者会禁用自动保存、自动备份和延时录像。主要需要免费编辑和 Aseprite 文件往返的话，Xprite 可以直接打开、编辑并保存工程。

### 自定义 Apple Pencil 笔身动作：Resprite

想把笔身双击设成撤销，或者改成自己常用的工具，可以选 Resprite。它支持[自定义双击和挤压动作](https://resprite.fengeon.com/docs/drawing/gesture)，动画可以在[图层与帧时间轴](https://resprite.fengeon.com/docs/animation/timeline)中编辑，也能用手指手势切换帧。

Resprite 支持[瓦片地图编辑](https://resprite.fengeon.com/docs/drawing/tilemaps-and-tilesets)。它[可订阅或买断](https://resprite.fengeon.com/)，试用版[每天的导出次数有限](https://resprite.fengeon.com/faq/purchase/premium-unlocks)，工程可以通过 AirDrop、云盘或文件 App 传出。

如果要继续编辑已有 Aseprite 工程，需要留意[转换限制](https://resprite.fengeon.com/docs/files/aseprite)。导入后转成 `.resprite`，帧时长按 100 毫秒为单位截断，重叠标签会变化，索引色像素会转成普通颜色像素。Aseprite 瓦片地图图层不能导入为可编辑地图；导回时，Resprite 自己的瓦片地图会变成普通像素，实时图层样式会被跳过。

这会影响需要保持动画节奏或继续编辑地图的工程。Xprite 按原帧时长保存，并保留可编辑的瓦片地图图层和瓦片集，更适合这种 Aseprite 文件往返。

### 图层动画和保持帧：Pixaki Pro

主要做精灵和图层动画，喜欢拖动时间轴预览、让某一帧多停留一会儿，可以看看 Pixaki Pro。它的[动画工具](https://pixaki.com/user-guide/animation/)支持这些操作，也支持 Apple Pencil 2 笔身双击和[单指操作设置](https://pixaki.com/user-guide/settings/)。工程可以放在 iCloud。

Pixaki 分[免费 Intro 和付费 Pro](https://pixaki.com/)，Aseprite 导入导出需要 Pro。导入和导出时会[保留图层和单元格](https://pixaki.com/user-guide/export/)，动画按工程帧率和保持帧来组织。带入已有工程时，先看看播放时长是否一致；用到标签、切片或索引色时，也用副本检查保存结果。

Pixaki [不支持 Tilemap 图层编辑](https://pixaki.com/user-guide/layers/)。需要瓦片地图，或者希望免费使用图层、动画和 Aseprite 读写功能，可以选 Xprite。

## 常见问题

### Xprite 支持 iPad 吗？

**支持。**在 iPad 上用 Safari 打开就能使用，也支持 Apple Pencil 绘画。加入主屏幕后，可以从图标直接打开。

### Aseprite 有官方 iPad 版本吗？

**没有。**[Aseprite 官方版](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite)提供 Windows、macOS 和 Linux 桌面应用。要在 iPad 上继续编辑它的工程，可以用 Xprite，或其他支持 Aseprite 文件的 iPad 编辑器。

### 必须有 Aseprite 文件才能用 Xprite 吗？

**不需要。**可以直接新建画布，开始绘画或制作动画。已有 Aseprite 文件时，再导入继续编辑。

### Xprite 支持离线使用吗？

**支持。**离线使用前，先联网打开一次编辑器。之后可以离线绘画和保存；要把作品带到其他设备，另存为独立工程文件。

### 双指撤销和 Apple Pencil 双击是同一种手势吗？

**不是。**双指撤销是用两根手指轻点画布；笔身双击是轻点支持该操作的 Apple Pencil 笔身。Xprite 支持触控撤销重做，Pixquare、Resprite 和 Pixaki 还支持相应型号的笔身快捷操作。

## 选好后，先试画一个小工程

打开选好的编辑器，新建画布，或导入现有工程的副本。画一像素宽的轮廓，移动一下选区，再切换帧、撤销、保存并重新打开。常用操作是否顺手、文件能否继续编辑，走完这一遍就能看出来。

```article-diagram
{
  "kind": "flow",
  "label": "试画、保存和重新打开",
  "steps": [
    {
      "label": "打开编辑器",
      "detail": "网页或 iPad App"
    },
    {
      "label": "准备画布",
      "detail": "新建画布\n或导入工程副本"
    },
    {
      "label": "试画和修改",
      "detail": "画轮廓、移选区\n切换帧、撤销"
    },
    {
      "label": "保存和导出",
      "detail": "保存可编辑工程\n导出预览图或动画"
    },
    {
      "label": "重新打开",
      "detail": "检查图层和时长\n颜色与瓦片地图"
    }
  ]
}
```

重新打开后，检查图层、帧时长、颜色和用到的瓦片地图，再决定是否迁移常用作品。原文件继续留好。PNG、GIF 和精灵表适合分享画好的内容，后面还要修改图层的话，另外保存可编辑工程。

想先免费试一下，可以[打开 Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-on-ipad)，从一个小画布开始。
