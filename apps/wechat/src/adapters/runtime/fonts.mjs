const FONT_LOAD_TIMEOUT_MS = 15_000;

/** Load the exact bundled website fonts into both native Canvas and view text. */
export async function installWechatFonts(host, nativeApi, definitions) {
  const faces = new Map();
  const pending = new Map();
  function loadFamily(family) {
    if (pending.has(family)) return pending.get(family);
    const definition = definitions.find((entry) => entry.family === family);
    if (!definition) return Promise.resolve([]);
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Shared font loading timed out: ${family}`)),
        FONT_LOAD_TIMEOUT_MS,
      );
      nativeApi.loadFontFace({
        family,
        source: `url("${definition.source}")`,
        global: true,
        scopes: ["native", "webview"],
        success: () => {
          clearTimeout(timer);
          const face = { family, status: "loaded" };
          faces.set(family, face);
          resolve([face]);
        },
        fail: (error) => {
          clearTimeout(timer);
          reject(
            new Error(
              `Cannot load the shared font ${family}: ${error.errMsg ?? error.status ?? "unknown font error"}`,
            ),
          );
        },
      });
    });
    pending.set(family, result);
    return result;
  }
  const ready = Promise.all(definitions.map((entry) => loadFamily(entry.family)));
  Object.defineProperty(host.document, "fonts", {
    configurable: true,
    value: {
      ready,
      load(font) {
        const family = /[\d.]+(?:px|pt)\s+(.+)/
          .exec(font)?.[1]
          ?.split(",")[0]
          .trim()
          .replace(/^["']|["']$/g, "");
        return family ? loadFamily(family) : Promise.resolve([]);
      },
      check(font) {
        const family = /[\d.]+(?:px|pt)\s+(.+)/.exec(font)?.[1]?.trim();
        return !!family && faces.has(family);
      },
    },
  });
  await ready;
  return faces;
}
