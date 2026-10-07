import { installWechatBinaryRuntime, encodeWechatPng } from "$/adapters/runtime/binary.mjs";
import { installWechatCanvasBridge } from "$/adapters/runtime/canvas.mjs";
import { installWechatContainerRules } from "$/adapters/runtime/css.mjs";
import { installWechatEnvironment } from "$/adapters/runtime/environment.mjs";
import { installWechatFonts } from "$/adapters/runtime/fonts.mjs";
import { installWechatGeometryBridge } from "$/adapters/runtime/geometry.mjs";

/** Standalone native entry; deliberately imports the full shared application. */
export default function createApp() {
  let mounted;
  let retired = false;
  const cleanups = [];
  async function start() {
    const environment = installWechatEnvironment(window, wx);
    cleanups.push(environment.dispose);
    const binary = installWechatBinaryRuntime(window, wx);
    const canvas = installWechatCanvasBridge(window, wx, {
      encodePng: encodeWechatPng,
      Blob: binary.Blob,
    });
    const geometry = installWechatGeometryBridge(window);
    const css = installWechatContainerRules(window, geometry, wx);
    cleanups.push(css.dispose);
    cleanups.push(canvas.dispose, geometry.dispose);
    window.__xpriteNativeLayout = () => geometry.flush();
    await installWechatFonts(window, wx, __XPRITE_WECHAT_FONTS__);
    const container = document.createElement("div");
    container.id = "root";
    container.className = "xse-global";
    container.style.cssText = "width:100%;height:100%;overflow:hidden;";
    document.body.appendChild(container);
    const { provideDomGeometry } = await import("@xprite/ui/utils");
    cleanups.push(provideDomGeometry(document, geometry.provider));
    const { mountWechatEditor } = await import("$/mount-editor.tsx");
    if (!retired) mounted = mountWechatEditor(container);
  }
  void start().catch((error) => {
    console.error("Xprite startup", error);
    const message = document.createElement("div");
    message.textContent = error.message;
    document.body.appendChild(message);
  });
  function unmount() {
    if (retired) return;
    retired = true;
    mounted?.unmount();
    for (const cleanup of cleanups.reverse()) cleanup();
  }
  window.addEventListener("beforeunload", unmount);
  return { unmount };
}
