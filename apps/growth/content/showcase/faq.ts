import { PublicLanguage } from "../site/language";

enum ShowcaseFaqTopic {
  Access = "access",
  Devices = "devices",
  AsepriteFiles = "aseprite-files",
  Storage = "storage",
  Privacy = "privacy",
  Offline = "offline",
  Relationship = "relationship",
  Features = "features",
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
          "可以。Xprite 支持电脑、平板和手机浏览器，也支持",
          { label: "触屏和 Apple Pencil 等手写笔", href: "/zh-CN/features/touch-drawing/" },
          "。大型作品可能受设备内存限制而变慢或无法打开，触控操作见",
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
          "编辑和保存作品时不会上传。编辑器的",
          { label: "分享链接", href: "/zh-CN/features/share-artwork/" },
          "也在本地生成，作品数据包含在链接里，收到完整链接的人可以打开作品；用聊天软件发送链接时，作品数据也会交给该软件。网站会发送使用统计和主动提交的反馈，详见",
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
        id: ShowcaseFaqTopic.Features,
        question: "Xprite 还能做什么？",
        answer: [
          "可以用标签和洋葱皮",
          { label: "制作逐帧动画", href: "/zh-CN/features/frame-animation/" },
          "，",
          { label: "制作瓦片地图", href: "/zh-CN/features/tilemaps/" },
          "，",
          { label: "录制绘画过程", href: "/zh-CN/features/drawing-process/" },
          "，移动和停靠面板来",
          { label: "安排工作区", href: "/zh-CN/features/workspace-layout/" },
          "，也能",
          { label: "继续编辑 Aseprite 工程", href: "/zh-CN/features/aseprite-projects/" },
          "。全部功能见",
          { label: "功能", href: "/zh-CN/features/" },
          "页。",
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
          "Yes. Xprite works in browsers on computers, tablets and phones, with support for ",
          { label: "touch and pens", href: "/features/touch-drawing/" },
          " such as Apple Pencil. Large projects may slow down or fail to open on devices with less memory. See ",
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
          "Editing and saving do not upload your work. The editor also creates ",
          { label: "share links", href: "/features/share-artwork/" },
          " locally, with the project data inside the link. Anyone with the complete link can open the project, and sending it through a messaging service gives that service the project data too. The website sends usage analytics and feedback you submit. See the ",
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
        id: ShowcaseFaqTopic.Features,
        question: "What else can Xprite do?",
        answer: [
          "Animate ",
          { label: "frame by frame", href: "/features/frame-animation/" },
          " with tags and onion skin, build ",
          { label: "tilemaps", href: "/features/tilemaps/" },
          " for game levels, ",
          { label: "record your drawing process", href: "/features/drawing-process/" },
          ", and ",
          { label: "arrange your workspace", href: "/features/workspace-layout/" },
          " by moving and docking panels. You can also ",
          { label: "keep editing Aseprite projects", href: "/features/aseprite-projects/" },
          ". See all ",
          { label: "features", href: "/features/" },
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
  [PublicLanguage.Japanese]: {
    title: "よくある質問",
    guide: ["詳しい操作方法は", { label: "ユーザーガイド", href: "/ja/help/" }, "をご覧ください。"],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "Xprite は無料ですか？アカウントは必要ですか？",
        answer: [
          "無料で、アカウントも不要です。エディターを開けばすぐに作業を始められます。ソースコードは ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          " で公開されています。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "iPad やスマホでも使えますか？",
        answer: [
          "はい。Xprite はパソコン、タブレット、スマホのブラウザで動き、タッチや Apple Pencil などのペンにも対応しています。メモリの少ない端末では、大きなプロジェクトの動作が遅くなったり開けなかったりすることがあります。タッチ操作は",
          { label: "指とペン", href: "/ja/help/#指とペン" },
          "をご覧ください。",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "Aseprite のファイルを開けますか？",
        answer: [
          "はい。",
          { code: ".ase" },
          " と ",
          { code: ".aseprite" },
          " のプロジェクトをレイヤー、フレーム、タグごと開けます。",
          { code: ".aseprite" },
          " で保存すれば、Aseprite で編集を続けられます。ただし、Xprite は Aseprite のすべての機能を実装しておらず、スクリプトや拡張機能も実行できないため、完全には互換性のないプロジェクトもあります。詳しくは",
          {
            label: "ファイルを開く・エクスポートする",
            href: "/ja/help/#ファイルを開くエクスポートする",
          },
          "をご覧ください。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "作品はどこに保存されますか？自動で同期されますか？",
        answer: [
          "プロジェクトは現在のブラウザか、端末のファイルとして保存できます。端末やブラウザの間で自動的に同期されることはありません。サイトのデータを消去すると、ブラウザ内のプロジェクトと復元用バックアップが削除されます。バックアップや別の端末への移動には、ファイルとしてコピーを保存してください。詳しくは",
          { label: "保存と復元", href: "/ja/help/#保存と復元" },
          "をご覧ください。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "作品はサーバーにアップロードされますか？",
        answer: [
          "編集や保存で作品がアップロードされることはありません。エディターの共有リンクも端末上で作成され、プロジェクトのデータはリンクの中に含まれます。リンク全体を受け取った人は誰でもプロジェクトを開けます。チャットアプリでリンクを送ると、そのサービスにもプロジェクトのデータが渡ります。サイトは利用状況の統計と送信されたフィードバックを送信します。詳しくは",
          { label: "プライバシーについて", href: "/ja/privacy/" },
          "をご覧ください。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "オフラインで使えますか？",
        answer: [
          "はい。オンラインで一度エディターを開き、オフライン用のリソースの準備が終われば、オフラインでも編集でき、デスクトップやホーム画面に追加することもできます。手順は",
          {
            label: "デスクトップに追加してオフラインで使う",
            href: "/ja/help/#デスクトップに追加してオフラインで使う",
          },
          "をご覧ください。",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "Xprite と Aseprite の関係は？",
        answer: [
          "Xprite は Aseprite のインターフェースと操作方法に基づいた独立したプロジェクトです。Aseprite や Igara Studio S.A. とは提携しておらず、承認も受けていません。",
        ],
      },
    ],
  },
  [PublicLanguage.Korean]: {
    title: "자주 묻는 질문",
    guide: ["자세한 사용법은 ", { label: "사용 가이드", href: "/ko/help/" }, "를 참고하세요."],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "Xprite는 무료인가요? 계정이 필요한가요?",
        answer: [
          "무료이며 계정도 필요 없습니다. 에디터를 열면 바로 작업을 시작할 수 있습니다. 소스 코드는 ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          "에 공개되어 있습니다.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "아이패드나 휴대폰에서도 쓸 수 있나요?",
        answer: [
          "네. Xprite는 컴퓨터, 태블릿, 휴대폰 브라우저에서 동작하며 터치와 Apple Pencil 같은 펜을 지원합니다. 메모리가 적은 기기에서는 큰 프로젝트가 느려지거나 열리지 않을 수 있습니다. 터치 조작은 ",
          { label: "손가락과 펜", href: "/ko/help/#손가락과-펜" },
          "을 참고하세요.",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "Aseprite 파일을 열 수 있나요?",
        answer: [
          "네. ",
          { code: ".ase" },
          "와 ",
          { code: ".aseprite" },
          " 프로젝트를 레이어, 프레임, 태그와 함께 열 수 있고, ",
          { code: ".aseprite" },
          "로 저장하면 Aseprite에서 계속 편집할 수 있습니다. 다만 Xprite는 Aseprite의 모든 기능을 구현하지 않았고 스크립트와 확장 기능을 실행할 수 없어, 일부 프로젝트는 완전히 호환되지 않을 수 있습니다. ",
          { label: "파일 열기와 내보내기", href: "/ko/help/#파일-열기와-내보내기" },
          "를 참고하세요.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "작품은 어디에 저장되나요? 자동으로 동기화되나요?",
        answer: [
          "프로젝트는 현재 브라우저나 기기의 파일로 저장할 수 있습니다. 기기나 브라우저 사이에서 자동으로 동기화되지 않습니다. 사이트 데이터를 지우면 브라우저 프로젝트와 복구 백업이 삭제되므로, 백업하거나 다른 기기로 옮기려면 파일 사본을 저장하세요. ",
          { label: "저장과 복구", href: "/ko/help/#저장과-복구" },
          "를 참고하세요.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "작품이 서버에 업로드되나요?",
        answer: [
          "편집하고 저장할 때 작품은 업로드되지 않습니다. 에디터의 공유 링크도 기기에서 만들어지며 프로젝트 데이터는 링크 안에 들어갑니다. 전체 링크를 가진 사람은 누구나 프로젝트를 열 수 있고, 메신저로 링크를 보내면 해당 서비스에도 프로젝트 데이터가 전달됩니다. 웹사이트는 사용 통계와 직접 보낸 피드백을 전송합니다. ",
          { label: "개인정보 안내", href: "/ko/privacy/" },
          "를 참고하세요.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "오프라인으로 쓸 수 있나요?",
        answer: [
          "네. 온라인에서 에디터를 한 번 열어 오프라인 리소스 준비가 끝나면 오프라인에서도 편집할 수 있고, 바탕 화면이나 홈 화면에 추가할 수도 있습니다. ",
          {
            label: "바탕 화면에 추가하고 오프라인으로 사용하기",
            href: "/ko/help/#바탕-화면에-추가하고-오프라인으로-사용하기",
          },
          "를 참고하세요.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "Xprite와 Aseprite는 어떤 관계인가요?",
        answer: [
          "Xprite는 Aseprite의 인터페이스와 조작 방식을 바탕으로 한 독립 프로젝트입니다. Aseprite나 Igara Studio S.A.와 제휴하거나 보증을 받지 않았습니다.",
        ],
      },
    ],
  },
} as const;
