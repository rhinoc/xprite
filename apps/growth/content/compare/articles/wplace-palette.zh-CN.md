---
published: 2026-10-29
updated: 2026-10-29
---

# Wplace 调色板转换：图片 → 地图颜色

搜索 **Wplace palette converter**、**Wplace colors** 或 **image to Wplace colors** 的人，通常只想做一件事：把图片匹配到 **Wplace map** 绘制颜色，导出 PNG，作为参考叠加层上传，再在 [wplace.live](https://wplace.live/) 上手动绘制。

Xprite 用浏览器里的 [图片转像素画](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) 工具和内置 **Wplace map** 调色板完成这件事。文件留在本机——不上传。Xprite **与 Wplace / wplace.live 无关联、未获其背书、亦非合作伙伴**。本页为非官方指南。

- 用深链转换：[Pixelate 中的 Wplace map 调色板](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette)（已预选调色板）。
- 叠加层上传步骤：wplace.live 官方 [Overlays 指南](https://wplace.live/guides/overlays)。
- 导出后：在地图上**手动**绘制。Xprite 不会自动绘制，也不导出 `.wplace`。

## 这里的「Wplace 调色板转换」指什么

指：在 Xprite Pixelate 中打开图片，在本机把像素对齐到 **Wplace map** 颜色集，并下载可用作**参考叠加层**的 PNG。

**不**包括：

- 替你绘制地图的机器人或 userscript
- 自动绘制，或任何「Studio / alliance」流程
- 官方 Wplace 产品、合作工具，或 `.wplace` 文件导出
- 保证 wplace.live 上的颜色永不变化

该 PNG 是供你定位并手动绘制的参考图，不是官方模板流水线。

## 把图片转成 Wplace map 颜色

1. 打开[已带 Wplace map 调色板的图片转像素画](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette)。无需安装；支持 PNG、JPEG 或 WebP。
2. 选择**转换图片**，拖入或打开文件。处理在本机完成。
3. 确认调色板为 **Wplace map**（深链会预选）。可按需调整尺寸等转换设置。
4. 预览结果，然后**导出** PNG。
5. 在 wplace.live 上按官方 [Overlays 指南](https://wplace.live/guides/overlays) 上传该 PNG 作为叠加层，摆好位置，并**手动**绘制地图。

可选：用**继续编辑**在 [Xprite 编辑器](/?utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette)里清理后再导出。

## 颜色与十六进制（打开预设）

**Wplace map** 预设包含 **63 种绘制颜色**（省略了线上选择器中的 Transparent）。出处写在仓库：`LICENSES/wplace-map-palette.txt`、`ATTRIBUTION.md`，以及 `packages/palette-assets/wplace/wplace-map.gpl`（非官方采集，日期 2026-10-25；来源 URL 与方法见上述文件）。

当 wplace.live 更新客户端时，颜色**可能漂移**。请优先打开工具查看当前预设，而不是在此页重刊完整十六进制表。这不是官方调色板转储。

## 诚实边界

- 非官方、无关联：Xprite 未获 Wplace / wplace.live 背书，亦非其合作伙伴。本页不使用 Wplace 标识或「官方 / powered by」表述。
- 导出的是供你自行上传的 **PNG 参考叠加层**——不保证匹配每一块地砖，也不保证颜色列表永久不变。
- 无自动绘制、无 `.wplace` 导出，Xprite 也不附带用于绘制地图的 userscript。
- 叠加层上传与手动绘制规则由 wplace.live 定义；请遵循其 [Overlays 指南](https://wplace.live/guides/overlays)。

## 常见问题

### 什么是 Wplace 调色板转换器？

把图片匹配到 **Wplace map** 绘制颜色并导出 PNG，用作参考叠加层。在 Xprite 里就是带 **Wplace map** 预设的 Pixelate——本机转换，不是地图机器人。

### 这是官方的吗？与 wplace.live 有关联吗？

没有。Xprite 与 Wplace / wplace.live 无关联、未获背书、亦非合作伙伴。本指南与调色板预设均为非官方。

### 我需要把图片上传到 Xprite 吗？

不需要。Pixelate 在浏览器本地处理文件，不会上传到 Xprite 服务器。

### 如何把图片转成 Wplace map 颜色？

打开[带 `?palette=wplace` 的 Pixelate](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette)，转换图片，确认 **Wplace map**，预览并导出 PNG。再按官方 [Overlays](https://wplace.live/guides/overlays) 流程上传，并手动绘制。

### PNG 在 wplace.live 上用在哪里？

作为**参考叠加层**上传、定位，然后手动绘制。见 [wplace.live/guides/overlays](https://wplace.live/guides/overlays)。

### Xprite 能自动绘制地图或导出 `.wplace` 吗？

不能。Xprite 只导出 PNG 参考图。不会自动绘制地图，也不导出 `.wplace` 文件。

---

[打开 Wplace map 调色板转换](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) · [Overlays 指南（wplace.live）](https://wplace.live/guides/overlays) · [图片转像素画](/tools/pixelate/?utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) · [Xprite 是什么](/about/)
