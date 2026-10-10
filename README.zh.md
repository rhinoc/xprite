<div align="center">
  <img src="./apps/editor/assets/public/icon-192.png" alt="Xprite 图标" width="96" />
  <h1>Xprite</h1>
  <p>在网页上，也能画像素画、做动画。</p>
  <p>免费、开源，无需注册账号。</p>
  <p>
    <a href="https://xprite.cc"><strong>在线体验</strong></a> ·
    <a href="./README.md">English</a> ·
    <a href="https://xprite.cc/help/zh-CN/">使用指南</a> ·
    <a href="./PRIVACY.zh.md">隐私说明</a> ·
    <a href="./CONTRIBUTING.md">参与开发</a> ·
    <a href="https://github.com/rhinoc/xprite/issues">问题反馈</a>
  </p>
  <p>
    <a href="https://alternativeto.net/software/xprite/about/?utm_source=badge&utm_medium=referral">
      <img src="https://alternativeto.net/static/badges/badge-compact-color.svg" alt="AlternativeTo 上的 Xprite" width="171" height="55" />
    </a>
  </p>
</div>

![在电脑和手机浏览器中使用 Xprite 精灵编辑器](./scripts/marketing-cover/output/xprite-readme-cover.png)

## 特点

- 👾 **与 Aseprite 近乎一致的交互体验**：熟悉的界面、工具布局和操作方式，支持打开和保存 `.ase` / `.aseprite` 文件，延续已有的编辑习惯。
- 📱 **多平台**：电脑、平板、手机都能使用；可自定义工作区与面板布局，支持鼠标、触控板、触屏和 Apple Pencil 等手写笔输入。
- 🗃️ **纯本地编辑，可离线使用**：文件处理和作品存储在本地完成，无需上传作品，没有云同步。支持安装为 PWA，首次联网加载并缓存应用资源后可离线使用。
- 🔤 **中英双语与中文输入**：界面根据浏览器语言自动切换，也可以手动选择。支持中文输入与显示，文件名、图层名等可直接使用中文。

## 已经有 Aseprite，为什么还会用 Xprite？

Xprite 将熟悉的编辑体验带到浏览器，让你在更多设备和场合使用它。

- **换一台设备，继续创作**：电脑不在身边时，也能在手机或平板上打开项目，使用熟悉的工具编辑作品。
- **分享项目，打开就能编辑**：把项目文件和 Xprite 链接一起发给别人，对方无需安装软件，就能查看作品、预览动画或继续编辑。
- **教学时，直接开始创作**：在教程或课堂中提供编辑器链接和项目文件，大家就能使用同一个编辑器跟练，省去安装与配置。

## 注意事项

Xprite 是由我个人开发和维护的 Web 项目，仍在持续完善，部分功能可能存在 Bug，也尚未在所有浏览器、设备和输入方式上充分验证。

- **浏览器限制**：文件读写、剪贴板和屏幕取色等能力取决于浏览器支持与权限，操作方式可能有所不同；大尺寸、多帧项目也会受到设备内存和性能限制。
- **功能覆盖**：尚未实现 Aseprite 的全部功能，目前不支持运行 Aseprite 脚本和扩展。支持其文件格式也不代表所有项目都能完全兼容。
- **作品备份**：编辑已有项目时请保留原文件，重要作品建议另存备份。浏览器中的项目和恢复数据可能在清理浏览器数据时丢失。

如果遇到问题，或觉得某个操作可以改进，欢迎[报告 Bug 或提出建议](https://github.com/rhinoc/xprite/issues)。
请尽量附上操作步骤、浏览器和设备信息，帮助我复现和改进。

## 灵感和参考

Xprite 是独立项目，与 Aseprite 或 Igara Studio S.A. 没有关联，也未获得其背书。

项目参考了以下作品：

- **Aseprite**：界面与交互，以及保留各自许可声明的字体、主题等素材和部分独立许可库。
- **LibreSprite**：部分编辑器行为的开源实现。

## 参与与支持

欢迎[报告问题或提出建议](https://github.com/rhinoc/xprite/issues)，中文和英文都可以。
开发环境、翻译和提交代码的说明见[参与开发指南](./CONTRIBUTING.md)。

如果 Xprite 对你有用，欢迎[在 GitHub 上 Star](https://github.com/rhinoc/xprite)，
也可以[关注我的后续项目](https://github.com/rhinoc)，或[在 Ko-fi 上支持我](https://ko-fi.com/rhinoc)。

## 许可证

编辑器应用代码采用 [GPL-2.0-only](./LICENSE)，可复用 UI 包保留其 [MIT 许可证](./packages/ui/LICENSE)。
Xprite 的品牌图标、标志、favicon、吉祥物动画及其内置示例源文件和预览图采用独立的[品牌素材许可](./LICENSES/xprite-branding.txt)，除条款明确允许的使用外保留所有权利，不适用 GPL、MIT 或 CC BY。允许在本地编辑示例用于学习和个人实验；其他修改或用作其他产品的品牌需事先取得书面授权。
第三方代码与素材保留各自的许可证，详见[归属说明](./ATTRIBUTION.md)及 [LICENSES/](./LICENSES/)。
