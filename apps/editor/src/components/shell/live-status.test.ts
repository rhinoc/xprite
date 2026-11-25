import assert from "node:assert/strict";

import { afterEach, describe, it } from "vitest";

import {
  formatLiveStatusAnnouncement,
  translateLiveStatusText,
} from "$/components/shell/live-status-text";
import { changeUiLanguage, tUi, tUiSource } from "$/i18n";

describe("dogfooding i18n polish", () => {
  afterEach(async () => {
    await changeUiLanguage("en");
  });

  it("localizes status bar Ready and screen-reader icon labels in zh-CN", async () => {
    await changeUiLanguage("zh-CN");
    assert.equal(translateLiveStatusText("Ready"), "就绪");
    assert.equal(formatLiveStatusAnnouncement([{ text: "Ready" }]), "就绪");
    assert.equal(
      formatLiveStatusAnnouncement([
        { text: "example.aseprite " },
        { icon: "size" },
        { text: "128 80" },
      ]),
      "example.aseprite 大小 128 80",
    );
  });

  it("localizes palette scroll, add-to-palette target, and Packed sprite sheet layout in zh-CN", async () => {
    await changeUiLanguage("zh-CN");
    assert.equal(tUi("ui.palette.scroll"), "调色板滚动");
    assert.equal(
      tUi("ui.add.color.to.the.palette", { value1: tUi("ui.foreground") }),
      "将前景色添加到调色板",
    );
    assert.equal(
      tUi("ui.add.color.to.the.palette", { value1: tUi("ui.background") }),
      "将背景色添加到调色板",
    );
    assert.equal(tUiSource("Packed"), "紧凑排列");
    assert.equal(tUi("ui.packed"), "紧凑排列");
  });
});
