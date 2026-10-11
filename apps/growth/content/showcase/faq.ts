import { PublicLanguage } from "../site/language";

enum ShowcaseFaqTopic {
  Access = "access",
  Devices = "devices",
  AsepriteFiles = "aseprite-files",
  Storage = "storage",
  Privacy = "privacy",
  Offline = "offline",
  Relationship = "relationship",
}

export const SHOWCASE_FAQ_COPY = {
  [PublicLanguage.SimplifiedChinese]: {
    title: "常见问题",
    guide: ["更多操作说明见", { label: "使用指南", href: "/zh-CN/help/" }, "。"],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "Xprite 免费吗？需要注册吗？",
        answer: [
          "免费，也不需要注册账号。打开网页就能开始编辑，源代码在 ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          " 上公开。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "可以在 iPad 和手机上使用吗？",
        answer: [
          "可以。Xprite 支持电脑、平板和手机浏览器，也支持触屏和 Apple Pencil 等手写笔。大型作品可能受设备内存限制而变慢或无法打开，触控操作见",
          { label: "手指与笔", href: "/zh-CN/help/#手指与笔" },
          "。",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "能打开 Aseprite 文件吗？",
        answer: [
          "可以打开 ",
          { code: ".ase" },
          " 和 ",
          { code: ".aseprite" },
          " 工程，保留图层、帧和标签，保存为 ",
          { code: ".aseprite" },
          " 后也能继续在 Aseprite 中编辑。不过，Xprite 尚未实现全部 Aseprite 功能，不能运行其脚本和扩展，个别工程可能无法完全兼容。详见",
          { label: "打开与导出文件", href: "/zh-CN/help/#打开与导出文件" },
          "。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "作品保存在哪里？会自动同步吗？",
        answer: [
          "作品可以保存到当前浏览器，或另存为设备上的文件，不会自动跨设备或浏览器同步。清除网站数据会删除浏览器里的作品和恢复备份；需要备份或换设备时，可以另存一份文件。详见",
          { label: "保存与恢复", href: "/zh-CN/help/#保存与恢复" },
          "。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "作品会上传到服务器吗？",
        answer: [
          "编辑和保存作品时不会上传。编辑器的分享链接也在本地生成，作品数据包含在链接里，收到完整链接的人可以打开作品；用聊天软件发送链接时，作品数据也会交给该软件。网站会发送使用统计和主动提交的反馈，详见",
          { label: "隐私说明", href: "/zh-CN/privacy/" },
          "。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "可以离线使用吗？",
        answer: [
          "可以。首次联网打开编辑器、完成离线资源准备后，就能离线编辑，也可以添加到桌面或主屏幕。具体操作见",
          { label: "添加到桌面与离线使用", href: "/zh-CN/help/#添加到桌面与离线使用" },
          "。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "Xprite 和 Aseprite 是什么关系？",
        answer: [
          "Xprite 是独立项目，沿用了 Aseprite 的界面和操作方式，与 Aseprite 或 Igara Studio S.A. 没有关联，也没有获得其背书。",
        ],
      },
    ],
  },
  [PublicLanguage.English]: {
    title: "FAQ",
    guide: ["For editing instructions, see the ", { label: "user guide", href: "/help/" }, "."],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "Is Xprite free? Do I need an account?",
        answer: [
          "Xprite is free and requires no account. Open the editor to start working. Its source code is available on ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "Can I use Xprite on an iPad or phone?",
        answer: [
          "Yes. Xprite works in browsers on computers, tablets and phones, with support for touch and pens such as Apple Pencil. Large projects may slow down or fail to open on devices with less memory. See ",
          { label: "fingers and a pen", href: "/help/#fingers-and-a-pen" },
          " for touch controls.",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "Can I open Aseprite files?",
        answer: [
          "Yes. Open ",
          { code: ".ase" },
          " and ",
          { code: ".aseprite" },
          " projects with their layers, frames and tags, then save as ",
          { code: ".aseprite" },
          " to continue editing in Aseprite. Xprite does not implement every Aseprite feature or run its scripts and extensions, so some projects may not be fully compatible. See ",
          { label: "open and export files", href: "/help/#open-and-export-files" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "Where is my work saved? Does it sync automatically?",
        answer: [
          "Save projects in the current browser or as files on your device. They do not sync automatically across devices or browsers. Clearing site data deletes browser projects and recovery backups; save a file copy for backup or to move work to another device. See ",
          { label: "save and recover", href: "/help/#save-and-recover" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "Is my work uploaded to a server?",
        answer: [
          "Editing and saving do not upload your work. The editor also creates share links locally, with the project data inside the link. Anyone with the complete link can open the project, and sending it through a messaging service gives that service the project data too. The website sends usage analytics and feedback you submit. See the ",
          { label: "privacy notice", href: "/privacy/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "Can I use Xprite offline?",
        answer: [
          "Yes. Open the editor online once and let it finish preparing its offline resources. You can then edit offline and add Xprite to your desktop or home screen. See ",
          {
            label: "add to desktop and use offline",
            href: "/help/#add-to-desktop-and-use-offline",
          },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "How is Xprite related to Aseprite?",
        answer: [
          "Xprite is an independent project with an interface and controls based on Aseprite. It is not affiliated with or endorsed by Aseprite or Igara Studio S.A.",
        ],
      },
    ],
  },
} as const;
