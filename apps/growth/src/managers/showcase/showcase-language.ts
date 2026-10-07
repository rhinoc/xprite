import { SHOWCASE_HERO_COPY } from "$content/showcase/index";

import { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import { SHOWCASE_PAGES } from "$/managers/showcase/showcase-pages";

export enum ShowcaseLanguage {
  Chinese = "zh-CN",
  English = "en",
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
} as const;
