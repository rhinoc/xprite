import { SHOWCASE_HERO_COPY } from "$content/showcase/index";
import { SHOWCASE_PAGES } from "$content/showcase/pages";

import { ShowcaseDevice } from "$/managers/showcase/showcase-device";

export enum ShowcaseLanguage {
  Chinese = "zh-CN",
  English = "en",
  Japanese = "ja",
  Korean = "ko",
}

export const SHOWCASE_BRAND_NAME = "Xprite";

export const SHOWCASE_COPY = {
  [ShowcaseLanguage.Chinese]: {
    ...SHOWCASE_HERO_COPY[ShowcaseLanguage.Chinese],
    credits: "模型署名",
    title: SHOWCASE_PAGES[ShowcaseLanguage.Chinese].title,
    chooseDevice: "选择设备",
    titleEnd: {
      [ShowcaseDevice.Computer]: { prefix: "在你的", device: "电脑", suffix: "上" },
      [ShowcaseDevice.Ipad]: { prefix: "在你的 ", device: "iPad", suffix: " 上" },
      [ShowcaseDevice.Phone]: { prefix: "在你的", device: "手机", suffix: "上" },
    },
    navigation:
      "点击或轻点设备以观看演示；进入后可左右拖拽、横向滑动、使用 Shift 加滚轮或按键盘左右方向键切换设备；向下滚动了解编辑器",
    languageNavigation: "语言",
    stage: "Xprite 设备三维演示",
    screen: "Xprite 像素动画演示",
    loading: "正在准备画布",
    error: "三维场景未能加载。",
    retry: "重新加载",
    direct: "直接打开 Xprite",
    description: SHOWCASE_PAGES[ShowcaseLanguage.Chinese].description,
    lockDate: "10月4日星期日",
    statusDate: "10月4日周日",
    unlock: "向上轻扫以打开",
  },
  [ShowcaseLanguage.English]: {
    ...SHOWCASE_HERO_COPY[ShowcaseLanguage.English],
    credits: "3D credits",
    title: SHOWCASE_PAGES[ShowcaseLanguage.English].title,
    chooseDevice: "Choose device",
    titleEnd: {
      [ShowcaseDevice.Computer]: { prefix: "on your ", device: "computer", suffix: "" },
      [ShowcaseDevice.Ipad]: { prefix: "on your ", device: "iPad", suffix: "" },
      [ShowcaseDevice.Phone]: { prefix: "on your ", device: "phone", suffix: "" },
    },
    navigation:
      "Click or tap a device to watch its demo; then drag or swipe horizontally, use Shift with the wheel, or use the left and right arrow keys to switch devices; scroll down to discover the editor",
    languageNavigation: "Language",
    stage: "Xprite device 3D showcase",
    screen: "Xprite pixel animation showcase",
    loading: "Preparing the canvas",
    error: "The 3D scene could not load.",
    retry: "Try again",
    direct: "Open Xprite directly",
    description: SHOWCASE_PAGES[ShowcaseLanguage.English].description,
    lockDate: "Sunday, October 4",
    statusDate: "Sun Oct 4",
    unlock: "Swipe up to open",
  },
  [ShowcaseLanguage.Japanese]: {
    ...SHOWCASE_HERO_COPY[ShowcaseLanguage.Japanese],
    credits: "3D モデルのクレジット",
    title: SHOWCASE_PAGES[ShowcaseLanguage.Japanese].title,
    chooseDevice: "デバイスを選択",
    titleEnd: {
      [ShowcaseDevice.Computer]: { prefix: "", device: "パソコン", suffix: "でも" },
      [ShowcaseDevice.Ipad]: { prefix: "", device: "iPad", suffix: " でも" },
      [ShowcaseDevice.Phone]: { prefix: "", device: "スマホ", suffix: "でも" },
    },
    navigation:
      "デバイスをクリックまたはタップしてデモを再生。左右のドラッグやスワイプ、Shift とホイール、キーボードの左右キーでデバイスを切り替え、下へスクロールするとエディターを紹介します",
    languageNavigation: "言語",
    stage: "Xprite デバイスの 3D デモ",
    screen: "Xprite ドット絵アニメーションのデモ",
    loading: "キャンバスを準備中",
    error: "3D シーンを読み込めませんでした。",
    retry: "再読み込み",
    direct: "Xprite を直接開く",
    description: SHOWCASE_PAGES[ShowcaseLanguage.Japanese].description,
    lockDate: "10月4日 日曜日",
    statusDate: "10月4日(日)",
    unlock: "上にスワイプして開く",
  },
  [ShowcaseLanguage.Korean]: {
    ...SHOWCASE_HERO_COPY[ShowcaseLanguage.Korean],
    credits: "3D 모델 출처",
    title: SHOWCASE_PAGES[ShowcaseLanguage.Korean].title,
    chooseDevice: "기기 선택",
    titleEnd: {
      [ShowcaseDevice.Computer]: { prefix: "", device: "컴퓨터", suffix: "에서도" },
      [ShowcaseDevice.Ipad]: { prefix: "", device: "iPad", suffix: "에서도" },
      [ShowcaseDevice.Phone]: { prefix: "", device: "휴대폰", suffix: "에서도" },
    },
    navigation:
      "기기를 클릭하거나 탭하면 데모가 재생됩니다. 좌우로 드래그하거나 스와이프하고, Shift와 휠 또는 키보드 좌우 방향키로 기기를 바꾸며, 아래로 스크롤하면 에디터를 소개합니다",
    languageNavigation: "언어",
    stage: "Xprite 기기 3D 데모",
    screen: "Xprite 픽셀 애니메이션 데모",
    loading: "캔버스 준비 중",
    error: "3D 장면을 불러오지 못했습니다.",
    retry: "다시 불러오기",
    direct: "Xprite 바로 열기",
    description: SHOWCASE_PAGES[ShowcaseLanguage.Korean].description,
    lockDate: "10월 4일 일요일",
    statusDate: "10월 4일 (일)",
    unlock: "위로 쓸어올려 열기",
  },
} as const;
