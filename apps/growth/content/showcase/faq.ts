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
          "免费，也不需要注册。打开网页就能用，源码在 ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          "。想支持的话，给仓库点个 Star、在社交媒体关注我就很有帮助；如果愿意，也可以通过 Ko-fi 或微信赞赏。",
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
          "Xprite is free and needs no account. Open the editor to start. Source is on ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          ". If you'd like to support the project, starring the repo or following on social media already helps a lot; optional donations via Ko-fi or WeChat are welcome too.",
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
          "無料で、アカウントも不要です。エディターを開けばすぐに使えます。ソースコードは ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          " にあります。応援したい場合は、リポジトリに Star を付けたり SNS でフォローするだけでも大きな助けになります。余裕があれば Ko-fi や WeChat での寄付も歓迎です。",
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
          "무료이며 계정도 필요 없습니다. 에디터를 열면 바로 사용할 수 있습니다. 소스 코드는 ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          "에 있습니다. 응원하고 싶다면 저장소에 Star를 주거나 SNS에서 팔로우하는 것만으로도 큰 도움이 됩니다. 여력이 있다면 Ko-fi나 WeChat 후원도 환영합니다.",
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
  [PublicLanguage.Russian]: {
    title: "Частые вопросы",
    guide: [
      "Подробные инструкции — в ",
      { label: "руководстве пользователя", href: "/ru/help/" },
      ".",
    ],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "Xprite бесплатный? Нужен аккаунт?",
        answer: [
          "Xprite бесплатный, аккаунт не нужен. Откройте редактор и начинайте. Исходный код на ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          ". Если хотите поддержать проект, звезда репозиторию или подписка в соцсетях уже очень помогают; добровольные пожертвования через Ko-fi или WeChat тоже приветствуются.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "Можно ли рисовать в Xprite на iPad или телефоне?",
        answer: [
          "Да. Xprite работает в браузерах на компьютерах, планшетах и телефонах и поддерживает ",
          { label: "сенсорный ввод и перо", href: "/ru/features/touch-drawing/" },
          ", например Apple Pencil. Крупные проекты могут тормозить или не открываться на устройствах с малым объёмом памяти. Управление касанием описано в разделе ",
          { label: "«Пальцы и перо»", href: "/ru/help/#пальцы-и-перо" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "Открывает ли Xprite файлы Aseprite?",
        answer: [
          "Да. Открывайте проекты ",
          { code: ".ase" },
          " и ",
          { code: ".aseprite" },
          " со слоями, кадрами и метками, а затем сохраняйте в ",
          { code: ".aseprite" },
          ", чтобы продолжить работу в Aseprite. Xprite реализует не все функции Aseprite и не запускает его скрипты и расширения, поэтому некоторые проекты могут открываться не полностью. Подробнее — в разделе ",
          { label: "«Открытие и экспорт файлов»", href: "/ru/help/#открытие-и-экспорт-файлов" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "Где хранятся работы? Синхронизируются ли они?",
        answer: [
          "Сохраняйте проекты в текущем браузере или файлами на устройстве. Между устройствами и браузерами они автоматически не синхронизируются. Очистка данных сайта удаляет проекты в браузере и резервные копии; для резервирования или переноса сохраните копию в файл. Подробнее — в разделе ",
          { label: "«Сохранение и восстановление»", href: "/ru/help/#сохранение-и-восстановление" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "Загружаются ли мои работы на сервер?",
        answer: [
          "Редактирование и сохранение ничего не загружают. Редактор также создаёт ",
          { label: "ссылки для отправки", href: "/ru/features/share-artwork/" },
          " локально — данные проекта находятся внутри ссылки. Любой, у кого есть полная ссылка, может открыть проект, а мессенджер, через который вы её отправляете, тоже получает эти данные. Сайт отправляет статистику использования и отзывы, которые вы оставляете. Подробнее — в ",
          { label: "уведомлении о конфиденциальности", href: "/ru/privacy/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "Можно ли работать в Xprite офлайн?",
        answer: [
          "Да. Один раз откройте редактор онлайн и дождитесь, пока он подготовит офлайн-ресурсы. После этого можно работать без интернета и добавить Xprite на рабочий стол или главный экран. Подробнее — в разделе ",
          {
            label: "«Установка на рабочий стол и работа офлайн»",
            href: "/ru/help/#установка-на-рабочий-стол-и-работа-офлайн",
          },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Features,
        question: "Что ещё умеет Xprite?",
        answer: [
          "Создавайте ",
          { label: "покадровую анимацию", href: "/ru/features/frame-animation/" },
          " с метками и калькой, собирайте ",
          { label: "тайлмапы", href: "/ru/features/tilemaps/" },
          " для игровых уровней, ",
          { label: "записывайте процесс рисования", href: "/ru/features/drawing-process/" },
          " и ",
          { label: "настраивайте рабочую область", href: "/ru/features/workspace-layout/" },
          ", перемещая и закрепляя панели. Можно и дальше ",
          { label: "редактировать проекты Aseprite", href: "/ru/features/aseprite-projects/" },
          ". Смотрите все ",
          { label: "возможности", href: "/ru/features/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "Как Xprite связан с Aseprite?",
        answer: [
          "Xprite — независимый проект с интерфейсом и управлением по образцу Aseprite. Он не связан с Aseprite или Igara Studio S.A. и не одобрен ими.",
        ],
      },
    ],
  },
  [PublicLanguage.BrazilianPortuguese]: {
    title: "Perguntas frequentes",
    guide: [
      "Para instruções de edição, veja o ",
      { label: "guia do usuário", href: "/pt-BR/help/" },
      ".",
    ],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "O Xprite é grátis? Preciso de conta?",
        answer: [
          "O Xprite é grátis e não precisa de conta. Abra o editor e comece. O código-fonte está no ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          ". Se quiser apoiar o projeto, dar uma estrela no repositório ou seguir nas redes já ajuda bastante; doações opcionais via Ko-fi ou WeChat também são bem-vindas.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "Posso usar o Xprite no iPad ou no celular?",
        answer: [
          "Sim. O Xprite funciona em navegadores de computadores, tablets e celulares, com suporte a ",
          { label: "toque e canetas", href: "/pt-BR/features/touch-drawing/" },
          " como o Apple Pencil. Projetos grandes podem ficar lentos ou não abrir em aparelhos com pouca memória. Veja ",
          { label: "dedos e caneta", href: "/pt-BR/help/#dedos-e-caneta" },
          " para os controles de toque.",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "Posso abrir arquivos do Aseprite?",
        answer: [
          "Sim. Abra projetos ",
          { code: ".ase" },
          " e ",
          { code: ".aseprite" },
          " com camadas, quadros e tags e salve como ",
          { code: ".aseprite" },
          " para continuar editando no Aseprite. O Xprite não implementa todos os recursos do Aseprite nem executa seus scripts e extensões, então alguns projetos podem não ser totalmente compatíveis. Veja ",
          { label: "abrir e exportar arquivos", href: "/pt-BR/help/#abrir-e-exportar-arquivos" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "Onde meu trabalho fica salvo? Ele sincroniza sozinho?",
        answer: [
          "Salve projetos no navegador atual ou como arquivos no seu dispositivo. Eles não sincronizam automaticamente entre aparelhos ou navegadores. Limpar os dados do site apaga os projetos do navegador e os backups de recuperação; salve uma cópia em arquivo como backup ou para levar o trabalho a outro aparelho. Veja ",
          { label: "salvar e recuperar", href: "/pt-BR/help/#salvar-e-recuperar" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "Meu trabalho é enviado para algum servidor?",
        answer: [
          "Editar e salvar não enviam seu trabalho. O editor também cria ",
          { label: "links de compartilhamento", href: "/pt-BR/features/share-artwork/" },
          " localmente, com os dados do projeto dentro do link. Qualquer pessoa com o link completo pode abrir o projeto, e enviá-lo por um app de mensagens também entrega os dados a esse serviço. O site envia estatísticas de uso e o feedback que você mandar. Veja o ",
          { label: "aviso de privacidade", href: "/pt-BR/privacy/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "Posso usar o Xprite offline?",
        answer: [
          "Sim. Abra o editor online uma vez e espere ele preparar os recursos offline. Depois você pode editar sem internet e adicionar o Xprite à área de trabalho ou à tela inicial. Veja ",
          {
            label: "adicionar à área de trabalho e usar offline",
            href: "/pt-BR/help/#adicionar-à-área-de-trabalho-e-usar-offline",
          },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Features,
        question: "O que mais o Xprite faz?",
        answer: [
          "Anime ",
          { label: "quadro a quadro", href: "/pt-BR/features/frame-animation/" },
          " com tags e onion skin, monte ",
          { label: "tilemaps", href: "/pt-BR/features/tilemaps/" },
          " para fases de jogos, ",
          { label: "grave seu processo de desenho", href: "/pt-BR/features/drawing-process/" },
          " e ",
          { label: "organize o espaço de trabalho", href: "/pt-BR/features/workspace-layout/" },
          " movendo e encaixando painéis. Você também pode ",
          {
            label: "continuar editando projetos do Aseprite",
            href: "/pt-BR/features/aseprite-projects/",
          },
          ". Veja todos os ",
          { label: "recursos", href: "/pt-BR/features/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "Qual a relação entre o Xprite e o Aseprite?",
        answer: [
          "O Xprite é um projeto independente com interface e controles baseados no Aseprite. Ele não tem vínculo nem aprovação do Aseprite ou da Igara Studio S.A.",
        ],
      },
    ],
  },
  [PublicLanguage.Spanish]: {
    title: "Preguntas frecuentes",
    guide: [
      "Para instrucciones de edición, consulta la ",
      { label: "guía de usuario", href: "/es/help/" },
      ".",
    ],
    questions: [
      {
        id: ShowcaseFaqTopic.Access,
        question: "¿Xprite es gratis? ¿Necesito una cuenta?",
        answer: [
          "Xprite es gratis y no necesita cuenta. Abre el editor y empieza. El código fuente está en ",
          { label: "GitHub", href: "https://github.com/rhinoc/xprite" },
          ". Si quieres apoyar el proyecto, dar una estrella al repositorio o seguirme en redes ya ayuda mucho; las donaciones opcionales por Ko-fi o WeChat también son bienvenidas.",
        ],
      },
      {
        id: ShowcaseFaqTopic.Devices,
        question: "¿Puedo usar Xprite en un iPad o un teléfono?",
        answer: [
          "Sí. Xprite funciona en navegadores de computadoras, tabletas y teléfonos, y admite ",
          { label: "tacto y lápices ópticos", href: "/es/features/touch-drawing/" },
          " como el Apple Pencil. Los proyectos grandes pueden ir lentos o no abrirse en dispositivos con poca memoria. Consulta ",
          { label: "dedos y lápiz", href: "/es/help/#dedos-y-lápiz" },
          " para los controles táctiles.",
        ],
      },
      {
        id: ShowcaseFaqTopic.AsepriteFiles,
        question: "¿Puedo abrir archivos de Aseprite?",
        answer: [
          "Sí. Abre proyectos ",
          { code: ".ase" },
          " y ",
          { code: ".aseprite" },
          " con sus capas, cuadros y etiquetas, y guarda como ",
          { code: ".aseprite" },
          " para seguir editando en Aseprite. Xprite no implementa todas las funciones de Aseprite ni ejecuta sus scripts y extensiones, así que algunos proyectos pueden no ser totalmente compatibles. Consulta ",
          { label: "abrir y exportar archivos", href: "/es/help/#abrir-y-exportar-archivos" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Storage,
        question: "¿Dónde se guarda mi trabajo? ¿Se sincroniza solo?",
        answer: [
          "Guarda proyectos en el navegador actual o como archivos en tu dispositivo. No se sincronizan automáticamente entre dispositivos ni navegadores. Borrar los datos del sitio elimina los proyectos del navegador y las copias de recuperación; guarda una copia en archivo como respaldo o para llevar tu trabajo a otro dispositivo. Consulta ",
          { label: "guardar y recuperar", href: "/es/help/#guardar-y-recuperar" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Privacy,
        question: "¿Mi trabajo se sube a algún servidor?",
        answer: [
          "Editar y guardar no suben tu trabajo. El editor también crea ",
          { label: "enlaces para compartir", href: "/es/features/share-artwork/" },
          " de forma local, con los datos del proyecto dentro del enlace. Cualquiera con el enlace completo puede abrir el proyecto, y si lo envías por una app de mensajería, ese servicio también recibe los datos. El sitio envía estadísticas de uso y los comentarios que mandes. Consulta el ",
          { label: "aviso de privacidad", href: "/es/privacy/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Offline,
        question: "¿Puedo usar Xprite sin conexión?",
        answer: [
          "Sí. Abre el editor online una vez y deja que termine de preparar sus recursos sin conexión. Después podrás editar sin internet y añadir Xprite al escritorio o a la pantalla de inicio. Consulta ",
          {
            label: "añadir al escritorio y usar sin conexión",
            href: "/es/help/#añadir-al-escritorio-y-usar-sin-conexión",
          },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Features,
        question: "¿Qué más puede hacer Xprite?",
        answer: [
          "Anima ",
          { label: "cuadro a cuadro", href: "/es/features/frame-animation/" },
          " con etiquetas y papel cebolla, crea ",
          { label: "tilemaps", href: "/es/features/tilemaps/" },
          " para niveles de juegos, ",
          { label: "graba tu proceso de dibujo", href: "/es/features/drawing-process/" },
          " y ",
          { label: "organiza tu espacio de trabajo", href: "/es/features/workspace-layout/" },
          " moviendo y acoplando paneles. También puedes ",
          {
            label: "seguir editando proyectos de Aseprite",
            href: "/es/features/aseprite-projects/",
          },
          ". Consulta todas las ",
          { label: "funciones", href: "/es/features/" },
          ".",
        ],
      },
      {
        id: ShowcaseFaqTopic.Relationship,
        question: "¿Qué relación tiene Xprite con Aseprite?",
        answer: [
          "Xprite es un proyecto independiente con una interfaz y controles basados en Aseprite. No está afiliado ni respaldado por Aseprite ni por Igara Studio S.A.",
        ],
      },
    ],
  },
} as const;
