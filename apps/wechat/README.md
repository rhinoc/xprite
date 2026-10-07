# 微信原生小程序

**当前工程仍是未完成的原生原型，不满足完整移植要求。**目标是功能、UI、操作流程和默认行为与网页版一致，仅微信官方明确限制的部分允许差异。下面列出的原型功能和人为上限不是最终产品范围，也不是微信官方限制。

完整移植的验收约束、当前差距和运行时调查见 [PARITY.md](PARITY.md)。未经逐项操作验证和同尺寸 UI 对比，不应将此工程描述为与网页版相同或可发布版本。

独立工程：`apps/wechat`。适用于个人主体，使用原生 WXML、WXSS 和 Canvas 2D；不依赖 `web-view`、业务域名或远程服务。

## 导入开发者工具

已接入 pnpm workspace，依赖使用根目录的锁文件。

```sh
pnpm install
pnpm run wechat:pack
```

在[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)中导入 `apps/wechat`。`project.config.json` 已指定生成目录 `dist/`；初始 AppID 为游客模式的 `touristappid`。扫码预览和提交版本前，在开发者工具中设置自己的个人主体小程序 AppID。真实账号的私有项目配置不要提交。

后续开发可运行 `pnpm run wechat:watch`，监听 TypeScript、WXML、WXSS 和页面配置；不需要重启官网的开发服务。`pnpm run check:wechat` 只做类型检查，不生成文件。基础库需至少 2.32.3；工程固定使用 3.7.12，实际客户端仍需真机检查。

用户已授权本次微信移植的打包、运行及 UI 对比。目前已经打包并在游客模式中运行独立检查工程，详见 [PARITY.md](PARITY.md)；原型及完整 App 的功能、UI 等价尚未验收。`dist/` 由独立命令生成，不随源码提交。微信 AppID、后台隐私保护指引和真机预览需在注册后配置；目前没有上传或发布版本。

## 复用与目录

- `src/pages/editor`：页面、表单草稿和依赖组装。
- `src/managers`：操作流程、能力范围和端口。唯一文档及撤销历史由 `RasterEditor` 持有。
- `src/adapters`：微信文件选择、相册权限、原生画布、坐标和本地存储。
- `scripts/wechat/pack.mts`：打包公开的 `@xprite/editor-core` API 和本工程，不读取官网入口、不修改官网输出。

绘画、吸管、填充、形状预览、图层、帧、动画、撤销以及 Aseprite 编解码全部复用编辑核心；本地存储与文件入口使用微信 API。默认调色板在打包时读取官网已有的 PICO-8 资源，许可为 CC0，随包保留现有许可和鸣谢。

原生小程序没有 DOM，不能直接使用 `@xprite/ui` 的 React 控件。此工程使用微信原生控件，样式变量集中在 `src/app.wxss`；不复制网页控件或编辑器管理器。

新增的根命令均为独立命令，原有 `dev`、`build`、部署及像素校验流程不变。新增目录没有接入官网、公开网站路由或网站发布包。

## 当前范围

已接通：新建、铅笔、橡皮、吸管、填充、直线、矩形、椭圆、笔刷大小、颜色和调色板、撤销/重做、图层选择/新增/删除/显隐/锁定/改名、复制/删除/切换帧、帧时长、动画预览、双指缩放和平移、本地作品及草稿恢复、打开 Aseprite 文件与相册图片、导出 Aseprite 文件和当前帧 PNG。

当前范围为宽高各 1–512 像素、最多 64 帧和 32 层，输入文件和保存文件最多 16 MiB，解码数据最多 64 MiB，撤销缓存上限 16 MiB，本地作品最多 30 份。到达数量上限的控件禁用，超过文件限制的导入在替换文档前拒绝。

选择、滤镜、文字、精灵表导出、动画图片导出、快捷键编辑和完整桌面菜单尚未提供原生入口，均属于待移植功能，不是允许省略的范围。这份原型目前不能作为完整移植交付。

本地作品采用新文件写入、读回校验、发布目录记录、回收旧文件的顺序。自动草稿保存已提交的编辑，不保存进行中的手势或撤销历史，也不标记作品已保存。取消选文件、关闭表单和触摸中断不会安装半成品文档；切后台会停止播放、取消触摸草稿并保存已提交内容。

## 平台依据

参考仓库现有宿主适配方式与 Aseprite 新建/图层/帧操作语义。查看参考代码仅用于理解行为，不复制 Aseprite 的专有实现。

- [web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)：个人主体不支持；消息也不是即时 RPC。
- [Canvas](https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html)与[离屏 Canvas](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html)：原生 Canvas 2D 绘制和像素导入。
- [文件转发](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html)：Aseprite 文件导出使用微信自带的聊天选择器，应用不会自动选择收件人。
- [隐私协议开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)：相册等接口使用微信官方隐私授权弹窗；没有自定义同意状态或绕过平台授权。后台仍需声明实际使用的能力。

检查了官网指南的相关保存与触摸章节：原入口、手势、默认行为和浏览器能力均未改变，故无需更新官网中英文指南。小程序操作说明分别位于 [GUIDE.zh-CN.md](GUIDE.zh-CN.md) 和 [GUIDE.en.md](GUIDE.en.md)，不进入官网帮助内容包。

## 真机验收

使用自己的 AppID，在后台按实际使用的相册选择与保存能力配置隐私保护指引，再执行真机预览。关注连续绘画与取消手势、双指导航、横竖屏切换、切后台恢复、保存失败时旧作品仍可打开、导入损坏或超限文件时当前作品不变、Aseprite 多图层多帧往返、相册授权拒绝/允许和文件导出取消。

首次打包需检查主包大小与实际内存占用。真机未验证之前，不应宣称所有微信客户端都可用，也不要上传审核或发布。官网推送仍必须遵循既有像素对比 hook。
