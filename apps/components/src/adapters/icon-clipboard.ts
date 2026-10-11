import type { IconClipboard } from "$/managers/ports/icon-clipboard";

export const browserIconClipboard: IconClipboard = {
  async copyKey(key) {
    await navigator.clipboard.writeText(key);
  },
};
