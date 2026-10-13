# 微信原生小程序

`apps/wechat` 是网页版编辑器的原生宿主移植工程。功能、界面、默认行为和操作流程以网页版为基准；验收状态与平台差异记录见 [PARITY.md](PARITY.md)。完整功能、界面等价与真机流程仍需验收。

## 开发者工具

在仓库根目录安装依赖，使用独立的小程序命令生成输出：

```sh
pnpm install
pnpm run wechat:pack
```

在[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)中导入 `apps/wechat`。`project.config.json` 指向 `dist/`，初始 AppID 为 `touristappid`。扫码预览和提交版本前，配置自己的 AppID；私有项目配置保留在本地。

- `pnpm run wechat:watch`：监听小程序源码。
- `pnpm run check:types`：类型检查（包含 `tsconfig.check.json`）。
- `pnpm run wechat:probe`：生成 `.tmp/wechat-runtime-probe` 中的独立运行时调查工程。

基础库至少需要 2.32.3；工程配置使用 3.7.12，客户端兼容性以真机验收为准。`dist/` 是独立生成的输出目录。执行命令与发布须遵循根目录的仓库规则。

## 实现入口

- `src/bootstrap.mjs`：初始化原生运行时与页面。
- `src/mount-editor.tsx`：组装诊断与编辑器 Provider，挂载 `@xprite/editor-app/embedded-runtime`。
- `src/adapters/runtime/`：Canvas、字体、几何、DOM/CSS 和输入适配。
- `src/adapters/platform/`：微信宿主端口。
- `src/adapters/session/` 和 `src/adapters/storage/`：工作区生命周期及本地文件存储。
- `build/build.mts`：小程序打包；`scripts/wechat/`：运行时调查和相关工具。

文档、绘画与历史沿用 `RasterEditor` 和编辑核心，界面及工作流复用共享应用入口。原生平台差异由适配层实现，限制须附官方来源。用户操作说明见 [中文版](GUIDE.zh-CN.md)和[英文版](GUIDE.en.md)。

## 平台与验收

[web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)受个人主体限制，因此本工程采用原生渲染路径。[Canvas](https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html)、[离屏 Canvas](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html)、[文件转发](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html)及[隐私授权](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)按微信接口实现。

游客模式中的运行时与共享控件检查已记录在 [PARITY.md](PARITY.md)。注册 AppID 后，配置实际使用能力的隐私保护指引，再进行真机预览。验收覆盖绘画与手势取消、多文档和图层/帧操作、横竖屏切换、切后台恢复、保存失败、损坏或超限文件导入、Aseprite 往返、相册授权和文件导出取消。

发布前核对完整操作、同尺寸截图和区域几何、主包大小及实际内存占用，并完成真机验收。
