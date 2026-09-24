import { readJson, writeJson } from "$/adapters/minitool/sdk";
import type { MiniToolWelcomePort } from "$/managers/ports/minitool/welcome";

const WELCOME_DISMISSED_KEY = "welcome-dismissed";

export const miniToolWelcomeStorage: MiniToolWelcomePort = {
  readDismissed: async () => (await readJson<unknown>(WELCOME_DISMISSED_KEY, false)) === true,
  rememberDismissed: () => writeJson(WELCOME_DISMISSED_KEY, true),
};
