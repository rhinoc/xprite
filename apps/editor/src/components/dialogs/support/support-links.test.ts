import { describe, expect, it } from "vitest";

import {
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  HoverDisclosure,
  type DisclosureTimers,
} from "$/components/dialogs/support/hover-disclosure";
import { SUPPORT_ICON_PIXELS, supportGlyphPath } from "$/components/dialogs/support/support-icons";
import {
  SUPPORT_EXTERNAL_LINK_PROPS,
  SUPPORT_KOFI_HREF,
  SupportChannel,
  supportDonationOrder,
  supportSocialLinks,
} from "$/components/dialogs/support/support-links";
import en from "$/i18n/locales/en.json";

const LANGUAGES = ["en", "zh-CN", "ja", "ko", "ru", "pt-BR", "es"] as const;

class FakeTimers implements DisclosureTimers {
  now = 0;
  private next = 1;
  private pending = new Map<number, { at: number; callback: () => void }>();
  set(callback: () => void, delay: number) {
    const handle = this.next++;
    this.pending.set(handle, { at: this.now + delay, callback });
    return handle;
  }
  clear(handle: number) {
    this.pending.delete(handle);
  }
  advance(ms: number) {
    this.now += ms;
    for (const [handle, timer] of Array.from(this.pending)) {
      if (timer.at > this.now) continue;
      this.pending.delete(handle);
      timer.callback();
    }
  }
}

function disclosure() {
  const timers = new FakeTimers();
  const changes: boolean[] = [];
  return { timers, changes, state: new HoverDisclosure((open) => changes.push(open), timers) };
}

describe("support links", () => {
  it("orders mainland-China platforms first for zh-CN and X first elsewhere", () => {
    expect(supportSocialLinks("zh-CN").map((link) => link.channel)).toEqual([
      SupportChannel.Bilibili,
      SupportChannel.Xiaohongshu,
      SupportChannel.Xiaoheihe,
      SupportChannel.X,
    ]);
    for (const language of LANGUAGES.filter((language) => language !== "zh-CN"))
      expect(supportSocialLinks(language).map((link) => link.channel)).toEqual([
        SupportChannel.X,
        SupportChannel.Bilibili,
        SupportChannel.Xiaohongshu,
        SupportChannel.Xiaoheihe,
      ]);
  });

  it("always offers both donation routes, WeChat leading for zh-CN and Ko-fi elsewhere", () => {
    expect(supportDonationOrder("zh-CN")).toEqual([SupportChannel.WeChat, SupportChannel.KoFi]);
    for (const language of LANGUAGES.filter((language) => language !== "zh-CN"))
      expect(supportDonationOrder(language)).toEqual([SupportChannel.KoFi, SupportChannel.WeChat]);
  });

  it("links canonical https profiles without share tracking and opens them safely", () => {
    const hrefs = [SUPPORT_KOFI_HREF, ...supportSocialLinks("en").map((link) => link.href)];
    for (const href of hrefs) {
      const url = new URL(href);
      expect(url.protocol).toBe("https:");
      expect(url.search).toBe("");
    }
    expect(SUPPORT_KOFI_HREF).toBe("https://ko-fi.com/rhinoc");
    expect(SUPPORT_EXTERNAL_LINK_PROPS.target).toBe("_blank");
    expect(SUPPORT_EXTERNAL_LINK_PROPS.rel).toContain("noopener");
  });

  it("labels every platform with an existing UI message", () => {
    for (const link of supportSocialLinks("en")) expect(en[link.label]).toBeTruthy();
  });
});

describe("support icons", () => {
  it("draws every glyph inside the 12x12 pixel grid", () => {
    for (const channel of Object.values(SupportChannel)) {
      const path = supportGlyphPath(channel);
      expect(path.length).toBeGreaterThan(0);
      for (const [, x, y, run] of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        expect(Number(x) + Number(run)).toBeLessThanOrEqual(SUPPORT_ICON_PIXELS);
        expect(Number(y)).toBeLessThan(SUPPORT_ICON_PIXELS);
      }
    }
  });
});

describe("WeChat QR disclosure", () => {
  it("opens after the hover delay and ignores a pointer that only passes over", () => {
    const { timers, changes, state } = disclosure();
    state.pointerEnter("mouse");
    timers.advance(HOVER_OPEN_DELAY_MS - 1);
    state.pointerLeave("mouse");
    timers.advance(HOVER_CLOSE_DELAY_MS);
    expect(changes).toEqual([]);
    state.pointerEnter("mouse");
    timers.advance(HOVER_OPEN_DELAY_MS);
    expect(state.open).toBe(true);
  });

  it("stays open while the pointer travels from the trigger into the popover", () => {
    const { timers, state } = disclosure();
    state.pointerEnter("mouse");
    timers.advance(HOVER_OPEN_DELAY_MS);
    state.pointerLeave("mouse");
    timers.advance(HOVER_CLOSE_DELAY_MS - 50);
    state.pointerEnter("mouse");
    timers.advance(HOVER_CLOSE_DELAY_MS);
    expect(state.open).toBe(true);
    state.pointerLeave("mouse");
    timers.advance(HOVER_CLOSE_DELAY_MS);
    expect(state.open).toBe(false);
  });

  it("opens immediately on keyboard focus and closes on blur", () => {
    const { state } = disclosure();
    state.focus();
    expect(state.open).toBe(true);
    state.blur();
    expect(state.open).toBe(false);
  });

  it("toggles with taps but never closes on a fine-pointer click", () => {
    const { timers, state } = disclosure();
    state.pointerEnter("touch");
    timers.advance(HOVER_OPEN_DELAY_MS);
    expect(state.open).toBe(false);
    state.activate(true);
    expect(state.open).toBe(true);
    state.activate(true);
    expect(state.open).toBe(false);
    state.activate(false);
    state.activate(false);
    expect(state.open).toBe(true);
    state.close();
    expect(state.open).toBe(false);
  });
});
