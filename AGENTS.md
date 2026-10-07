# Repository Instructions

Read the nearest `AGENTS.md` before you edit a package.
Use root `package.json` scripts for current tools and commands.

## Structure

```text
.
├── apps/
│   ├── editor/
│   │   ├── assets/
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── components/<scope>/
│   │       ├── managers/<scope>/
│   │       ├── adapters/<scope>/
│   │       └── i18n/
│   │           ├── index.ts
│   │           └── locales/
    │   ├── growth/{src,content,build,public}/
│   ├── tools/{src,index.html,viewer,gif-to-sprite-sheet}/
│   └── gallery/src/
├── packages/
│   ├── bedrock/{browser,common}/
│   ├── editor-core/src/<feature>/
│   ├── editor-ui/src/{timeline,appearance}/
│   └── ui/src/<component>/
├── scripts/{base,check,e2e,fixtures,performance,visual-audit}/
├── infra/
├── .agents/skills/
├── .docs/  git ignored local notes
└── .refs/  git ignored local references
```

## Architecture

Arrows show dependencies. `App.tsx` assembles the app.

```text
┌──────────────┐
│   App.tsx    ├────┬─────┐
└───────┬──────┘    └─────┼──────────────────┐
        ▼                 ▼                  ▼
┌──────────────┐    ┌───────────┐    ┌───────────────┐
│  components  ├───►│  managers ├──┐ │    adapters   ├───────────┐
└───────┬──────┘    └─────┬─────┘  │ └───────────────┘           │
        ▼                 ▼        └─────────▼                   ▼
┌──────────────┐    ┌───────────┐    ┌───────────────┐    ┌─────────────┐
│  @xprite/ui  │    │editor-core│    │bedrock/browser│    │manager ports│
└──────────────┘    └─────┬─────┘    └───────┬───────┘    └─────────────┘
                          │                  │
┌──────────────┐          │                  │
│bedrock/common│◄─────────┴──────────────────┘
└──────────────┘
```

Managers declare ports. Adapters implement them. `App.tsx` connects them.

`apps/growth` owns showcase, public help pages, SEO metadata and website routing.
The editor reads guide content through `@xprite/growth-content/help`; it must not import
growth page components, Three.js, or public-page build plugins.
The asset-only `@xprite/site-assets` workspace in `apps/growth/public` owns shared
website branding and example artwork. Reuse originals through package imports
or the public-asset Vite plugin; do not create a package per artwork. Generic UI
assets, including fonts, stay in `packages/ui/assets`.

## Key Principle

- Group code by business scope, then by technical role.
- Keep dependencies one way. Do not create cycles.
- Components use public manager APIs, `@xprite/ui` and the private `@xprite/editor-ui` presentation package.
- Components do not import editor-core, Bedrock, adapters, or store libraries.
- Managers own app workflows, lifecycle, and app UI state.
- Keep document, history, and settings in `RasterEditor` and session/workspace objects.
- Do not copy editor state into UI stores.
- Keep app-specific platform code in adapters. They implement manager ports.
- Keep `editor-core` platform independent. It may import `bedrock/common`, but not app, browser, or UI code.
- Keep product rules out of Bedrock.
- `bedrock/common` has no browser APIs or DOM types.
- `bedrock/browser` wraps generic browser APIs. It may import `bedrock/common`.
- Keep `packages/ui` independent of editor code.
- For drag handles, reuse `PointerDragActivation` from `@xprite/ui/utils`; for one-dimensional resize values, use `PointerResizeGesture`. Keep activation thresholds in the shared helper, and keep size limits, previews, and commit/cancel behavior with the owning control.
- Use CSS Modules and design tokens.
- Read DOM coordinates, sizes, presentation scale, scroll positions, computed styles, and hit targets only through `@xprite/ui/utils` geometry methods. Inside `packages/ui`, use `base/utils/dom-geometry`. Use `clientToLocal` and `clientDeltaToLocal` for coordinate conversion; do not combine native screen and layout units manually. Direct native geometry access is restricted to this boundary and enforced by `check:dom-geometry`.
- Use enums for fixed sets. Use named constants for fixed numbers and strings.
- Do not keep compatibility exports or aliases for moved code.
- Before launch, support only current internal APIs and storage schemas. Do not add migrations or legacy fallbacks for past project versions.

---

开发过程中，不用跑任何构建和测试。Git hook 会在提交和推送时自动运行对应的静态检查，单元测试和构建不在 hook 中运行。
`pre-push` 必须采集当前界面的候选截图并运行像素对比；采集失败、整张截图像素相似度低于 99% 或区域几何变化都必须阻止推送。超过 1% 的视觉差异或区域几何变化须先展示给用户并得到明确确认，确认前不得推送或发布。不得自动更新基线、修改阈值、跳过场景或绕过 hook；对像素校验脚本、规则和基线的修改也须先取得用户确认。
`pre-push` 还须对工具页的 SSG 首屏与水合后交互就绪首屏进行整张截图对比：所有解码后的 RGBA 像素必须完全一致（100%，零差异），区域几何必须一致；不得容忍颜色差异、忽略抗锯齿像素、遮罩或缩放截图；采集失败或不完整须阻止推送。
dev 端口有 HMR，不需要你手动刷新/重新构建/重启服务。
若端口被占用，直接复用原端口，不要修改端口号，原端口明显出现异常时杀死原进程进行重启。

---

UI 开发流程：

- 已有 Aseprite 对应的功能，默认沿用原版的交互、控件顺序、分组和应用/取消语义；自增页面可以采用适合自身的交互。
- 优先保证已支持功能的完整性，修复搜索、重复标题等明显问题。高成本、低收益或平台不适用的功能可以暂不实现；不把没有实际效果的控件呈现为可用。
- 产品界面不展示开发过程、实现说明或未实现功能的总结。帮助文案只解释用户操作；未实现的设置通过禁用状态表达。

大多数情况下，apps 不应当自行绘制 UI 组件，而应使用 `@xprite/ui` 中的组件。

1. 将组件拆解为可使用 `@xprite/ui` 组装的小组件。
2. 若 @xprite/ui 中没有提供对应的小组件，评估：

- 通用组件
  - @xprite/ui 有类似的组件行为 => 变体
  - @xprite/ui 没有类似的组件行为 => 新组件
- 业务组件
  - 使用 @xprite/ui 组合

---

在 .refs/ 目录中找同类产品的实现策略，需要注意 LICENSE 协议
在 .docs/ 目录中找历史变更的文档，需要辨别过期信息

## 使用指南维护

- 正式使用指南位于 `apps/growth/content/help/README.zh-CN.md` 和 `README.en.md`。帮助菜单直接读取这些文件；仓库 README 只提供链接，不复制正文。`.docs/` 中的草稿不作为产品文档来源。
- 使用指南只服务像素编辑器。设备演示、网站展示、公开页面外观、独立查看器和其他小工具的入口、交互与使用教程均不得加入。普通小工具不要求另写使用文档。
- 使用指南以官方网站 `https://xprite.cc` 为使用环境，只介绍 Xprite 与 Aseprite 原版不同的操作和浏览器特有能力。原版相同的绘画、图层、动画、调色板和滤镜操作不重复编写教程；必要时链接 Aseprite 官方文档。不得加入 itch.io、小红书或其他发行版的介绍、限制、入口及使用说明。
- 按使用任务写最短可用说明：说明入口和不明显的操作即可。操作相同的大小文件不另开章节。算法、解码或压缩策略、缓存、内存或像素预算、内部容量阈值与协议细节不写入使用指南；界面已经表达的选项、提示及参数含义不逐项复述。分享等简单功能只写用户如何完成操作。
- 指南写给正在使用编辑器的人：直接说明操作入口、手势、设置后果和数据保存行为。不要复述眼前可见的界面、加载动画、提示出现与消失、窗口自动排版等过程，也不要把文档受众、编写范围和内部维护要求写进正文。避免产品介绍、营销文案和重复解释同一操作。
- 每段帮助须能说明如何使用应用：用户从当前页面就能看出的内容、Aseprite 原版已有的操作，以及对用户操作没有帮助的内容都删除。访客标识、访问统计和隐私说明放在仓库 README 或 PRIVACY 文档；许可、鸣谢和推广也不加入帮助正文。
- 章节按编辑器的日常任务和使用流程组织：保存恢复、工作区和输入操作在前，分享、回放、AI 等可选功能在后，问题反馈放末尾。新功能放到相关任务的位置，不因刚实现就插到文档最前面；中英文目录和正文顺序保持一致。
- 章节名使用用户能理解的具体控件或任务名称，如“快捷操作栏”，不使用“不用键盘编辑”“官网操作差异”等自造标题。不要为切换语言、曲线控制点等原版已有功能开章节。通常指出入口、说明不明显的行为即可；不要逐步解释打开入口后已经可见的下一步、确认、取消等按钮。截图用于定位不易找到的入口，不截图解释常规确认按钮。
- 对外文档和公开页面禁止出现小红书相关内容，包括中文名称、Xiaohongshu、RedNote、XHS 及相关链接。不得在仓库首页、使用指南或公开页面中加入体验版说明；平台专用说明仅放在开发者文档或对应运行环境内。`check:public-docs` 在 CI、部署和 Git hook 中强制检查。
- 使用指南面向最终用户，只解释实际使用操作。itch.io 发布与部署、小红书创作后台预览、开发环境、构建及调试流程放在对应的开发者文档中，不加入用户指南。
- 只有编辑器变更使现有指南失效，或新增了界面不能直接表达且需要用户了解的操作、限制、数据保存后果时，才维护相关章节，并同步中英文。仅修正或补充必要内容，不因每次变更扩写教程；普通布局、外观、控件文字和显而易见的交互变化不要求修改指南。非编辑器页面和独立小工具的变更不触发编辑器指南更新。
- PR 实际修改指南时列出更新章节。没有指南变更时无需强制填写说明。纯重构、性能优化或不改变用户操作的修复不要求修改指南。
- 指南中的控件名称、操作步骤和默认行为以当前代码为准；涉及截图或录屏时同步更新对应素材。
- 文档使用当前阅读器支持的 Markdown：标题、段落、平面列表、粗体、行内代码、链接和独立成段的图片。章节链接必须指向实际存在的标题。
- 指南截图放在 `apps/growth/content/help/images/`，使用相对路径引用。只截取所讲功能的按钮、菜单或设置区域，并保留辨认入口所需的少量上下文；中英文菜单分别截图，无文字的控件图可以共用。
- 更新截图时同步更新 `images/catalog.json` 中的实际像素尺寸及 `images/captures.json` 中的采集记录。操作入口或控件发生变化时，检查对应截图和说明是否仍然正确。
