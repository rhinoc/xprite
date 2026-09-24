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
│   └── gallery/src/
├── packages/
│   ├── bedrock/{browser,common}/
│   ├── editor-core/src/<feature>/
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

## Key Principle

- Group code by business scope, then by technical role.
- Keep dependencies one way. Do not create cycles.
- Components use public manager APIs and `@xprite/ui`.
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

- 正式使用指南位于 `apps/editor/assets/help/README.zh-CN.md` 和 `README.en.md`。帮助菜单直接读取这些文件；仓库 README 只提供链接，不复制正文。`.docs/` 中的草稿不作为产品文档来源。
- 使用指南面向最终用户，只解释实际使用操作。itch.io 发布与部署、小红书创作后台预览、开发环境、构建及调试流程放在对应的开发者文档中，不加入用户指南。
- 修改用户可见的操作入口、布局、交互、手势、快捷键、默认设置、文件保存或浏览器能力时，检查相关指南章节，并在同一次改动中更新中英文内容。
- PR 中说明更新了哪些章节；若无需更新，说明原因。纯重构、性能优化或不改变用户操作的修复不要求修改指南。
- 指南中的控件名称、操作步骤和默认行为以当前代码为准；涉及截图或录屏时同步更新对应素材。
- 文档使用当前阅读器支持的 Markdown：标题、段落、平面列表、粗体、行内代码、链接和独立成段的图片。章节链接必须指向实际存在的标题。
- 指南截图放在 `apps/editor/assets/help/images/`，使用相对路径引用。只截取所讲功能的按钮、菜单或设置区域，并保留辨认入口所需的少量上下文；中英文菜单分别截图，无文字的控件图可以共用。
- 更新截图时同步更新 `images/catalog.json` 中的实际像素尺寸及 `images/captures.json` 中的采集记录。操作入口或控件发生变化时，检查对应截图和说明是否仍然正确。
