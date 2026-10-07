import { zlibSync } from "fflate";

import {
  WechatWorkspaceSession,
  wechatAsepriteOptions,
} from "$/adapters/session/workspace-session";
import { WechatBinaryStore } from "$/adapters/storage/binary-store";
import { createWechatProjectStorage } from "$/adapters/storage/wechat-project-storage";
import {
  createBrowserEditorPlatformPorts,
  decodeAsepriteBlob,
} from "@xprite/editor-app/browser-io";
import type { EditorHostFactory } from "@xprite/editor-app/host-contracts";
import { encodeRecoverySnapshot, decodeRecoverySnapshot } from "@xprite/editor-core/import-export";

/** The full application owns all workflows; this factory replaces platform I/O. */
export const createWechatEditorHost: EditorHostFactory = () => {
  const store = new WechatBinaryStore();
  const platform = createBrowserEditorPlatformPorts();
  platform.startupScreen = undefined;
  platform.preferences = {
    getItem: (key) => {
      const value: unknown = wx.getStorageSync(key);
      return typeof value === "string" ? value : null;
    },
    setItem: (key, value) => wx.setStorageSync(key, value),
  };
  platform.userPresets = {
    load: async () => store.readJson("user-presets", null),
    save: async (value) => store.writeJson("user-presets", value),
    close: () => {},
  };
  platform.files = {
    ...platform.files,
    decodeAsepriteBlob: (blob, name) => decodeAsepriteBlob(blob, name, wechatAsepriteOptions),
  };
  platform.input = {
    ...platform.input,
    keyboardLikelyAvailable: /mac|windows/i.test(wx.getDeviceInfo().platform),
  };
  platform.navigation = {
    ...platform.navigation,
    openExternal: (url) => {
      wx.setClipboardData({ data: url });
    },
  };
  return {
    platform,
    createSessions: () => new WechatWorkspaceSession(store),
    createProjectStorage: () => createWechatProjectStorage(store),
    createCodec: () => ({
      encode: (snapshot) => encodeRecoverySnapshot(snapshot, zlibSync),
      decode: (bytes) => decodeRecoverySnapshot(bytes, wechatAsepriteOptions),
      close: () => {},
    }),
  };
};
