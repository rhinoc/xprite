import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";
import type { UiLanguage, UiMessageKey } from "$/i18n";

export enum SupportChannel {
  GitHub = "github",
  KoFi = "kofi",
  WeChat = "wechat",
  Bilibili = "bilibili",
  Xiaohongshu = "xiaohongshu",
  Xiaoheihe = "xiaoheihe",
  X = "x",
}

export type SocialChannel =
  | SupportChannel.Bilibili
  | SupportChannel.Xiaohongshu
  | SupportChannel.Xiaoheihe
  | SupportChannel.X;
export type DonationChannel = SupportChannel.KoFi | SupportChannel.WeChat;

export interface SupportLink<Channel extends SupportChannel = SupportChannel> {
  channel: Channel;
  label: UiMessageKey;
  href: string;
}

const SOCIAL_LINKS: Readonly<Record<SocialChannel, SupportLink<SocialChannel>>> = {
  [SupportChannel.Bilibili]: {
    channel: SupportChannel.Bilibili,
    label: "ui.support.bilibili",
    href: EDITOR_EXTERNAL_LINKS.bilibili,
  },
  [SupportChannel.Xiaohongshu]: {
    channel: SupportChannel.Xiaohongshu,
    label: "ui.support.xiaohongshu",
    href: EDITOR_EXTERNAL_LINKS.xiaohongshu,
  },
  [SupportChannel.Xiaoheihe]: {
    channel: SupportChannel.Xiaoheihe,
    label: "ui.support.xiaoheihe",
    href: EDITOR_EXTERNAL_LINKS.xiaoheihe,
  },
  [SupportChannel.X]: {
    channel: SupportChannel.X,
    label: "ui.support.x",
    href: EDITOR_EXTERNAL_LINKS.x,
  },
};

const CHINESE_SOCIAL_ORDER: readonly SocialChannel[] = [
  SupportChannel.Bilibili,
  SupportChannel.Xiaohongshu,
  SupportChannel.Xiaoheihe,
  SupportChannel.X,
];
const GLOBAL_SOCIAL_ORDER: readonly SocialChannel[] = [
  SupportChannel.X,
  SupportChannel.Bilibili,
  SupportChannel.Xiaohongshu,
  SupportChannel.Xiaoheihe,
];

/** Mainland-China platforms lead for zh-CN; X leads for every other UI language. */
export function supportSocialLinks(language: UiLanguage): readonly SupportLink<SocialChannel>[] {
  return (language === "zh-CN" ? CHINESE_SOCIAL_ORDER : GLOBAL_SOCIAL_ORDER).map(
    (channel) => SOCIAL_LINKS[channel],
  );
}

/** Both donation routes are always offered; the first one is presented as the primary action. */
export function supportDonationOrder(language: UiLanguage): readonly DonationChannel[] {
  return language === "zh-CN"
    ? [SupportChannel.WeChat, SupportChannel.KoFi]
    : [SupportChannel.KoFi, SupportChannel.WeChat];
}

export const SUPPORT_KOFI_HREF = EDITOR_EXTERNAL_LINKS.donate;
/** External links leave the editor in a new tab without giving the target a window handle. */
export const SUPPORT_EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
