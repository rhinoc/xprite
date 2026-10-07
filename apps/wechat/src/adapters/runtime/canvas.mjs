const HTML_CANVAS_DEFAULT_WIDTH = 300;
const HTML_CANVAS_DEFAULT_HEIGHT = 150;
const CONTEXT_KIND = "2d";

/** Keep a synchronous software surface while the native page canvas is prepared. */
export function installWechatCanvasBridge(host, nativeApi, encoders) {
  const document = host.document;
  const originalCreateElement = document.createElement.bind(document);
  const originalImage = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(host), "Image");
  const surfaces = new WeakMap();
  const connected = new Set();
  let retired = false;
  let scheduled = false;
  function reportError(error) {
    if (!retired)
      host.dispatchEvent(new host.CustomEvent("unhandledrejection", { detail: { reason: error } }));
  }

  function unwrap(source) {
    return surfaces.get(source)?.buffer ?? source;
  }

  function schedule(surface) {
    surface.dirty = true;
    if (!document.body.contains(surface.element) || retired) return;
    connected.add(surface);
    if (scheduled) return;
    scheduled = true;
    host.requestAnimationFrame(() => {
      scheduled = false;
      void Promise.all(Array.from(connected, (entry) => present(entry))).catch(reportError);
    });
  }

  async function present(surface) {
    if (retired || !surface.dirty) return;
    if (!document.body.contains(surface.element)) {
      connected.delete(surface);
      return;
    }
    if (!surface.node) {
      surface.preparing ??= surface
        .prepare()
        .then(() => {
          surface.node = surface.element.$$node;
        })
        .finally(() => {
          surface.preparing = null;
        });
      await surface.preparing;
    }
    if (retired || !surface.node || !surface.dirty) return;
    const node = surface.node;
    if (node.width !== surface.buffer.width) node.width = surface.buffer.width;
    if (node.height !== surface.buffer.height) node.height = surface.buffer.height;
    const context = node.getContext(CONTEXT_KIND);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, node.width, node.height);
    context.drawImage(surface.buffer, 0, 0);
    surface.dirty = false;
  }

  function attach(element) {
    if (surfaces.has(element)) return element;
    const width = Number(element.getAttribute("width")) || HTML_CANVAS_DEFAULT_WIDTH;
    const height = Number(element.getAttribute("height")) || HTML_CANVAS_DEFAULT_HEIGHT;
    const buffer = nativeApi.createOffscreenCanvas({ type: CONTEXT_KIND, width, height });
    const context = buffer.getContext(CONTEXT_KIND);
    const surface = {
      element,
      buffer,
      context,
      node: null,
      dirty: false,
      preparing: null,
      prepare: element.$$prepare.bind(element),
    };
    surfaces.set(element, surface);
    element.setAttribute("type", CONTEXT_KIND);
    const proxy = new Proxy(context, {
      get(target, property) {
        if (property === "canvas") return element;
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args) => {
          const result = value.apply(
            target,
            property === "drawImage" ? [unwrap(args[0]), ...args.slice(1)] : args,
          );
          if (!String(property).startsWith("get") && property !== "measureText") schedule(surface);
          return result;
        };
      },
      set(target, property, value) {
        Reflect.set(target, property, value, target);
        return true;
      },
    });
    Object.defineProperties(element, {
      width: {
        configurable: true,
        get: () => buffer.width,
        set: (value) => {
          buffer.width = value;
          schedule(surface);
        },
      },
      height: {
        configurable: true,
        get: () => buffer.height,
        set: (value) => {
          buffer.height = value;
          schedule(surface);
        },
      },
      getContext: {
        configurable: true,
        value: (kind) => {
          if (kind !== CONTEXT_KIND)
            throw new Error(`Canvas context ${kind} needs a separate native adapter.`);
          return proxy;
        },
      },
      toBlob: {
        configurable: true,
        value: (callback, type = "image/png") => {
          if (!encoders || type !== "image/png")
            throw new Error(`Canvas encoding requires the ${type} adapter.`);
          const pixels = context.getImageData(0, 0, buffer.width, buffer.height);
          callback(new encoders.Blob([encoders.encodePng(pixels)], { type }));
        },
      },
      toDataURL: {
        configurable: true,
        value: (type = "image/png") => {
          if (!encoders || type !== "image/png")
            throw new Error(`Canvas encoding requires the ${type} adapter.`);
          const bytes = encoders.encodePng(context.getImageData(0, 0, buffer.width, buffer.height));
          return `data:${type};base64,${nativeApi.arrayBufferToBase64(bytes.buffer)}`;
        },
      },
    });
    return element;
  }

  document.createElement = function (tag, options) {
    const element = originalCreateElement(tag, options);
    return String(tag).toLowerCase() === "canvas" ? attach(element) : element;
  };
  const sample = document.createElement("canvas");
  Object.defineProperty(host, "HTMLCanvasElement", {
    configurable: true,
    value: Object.getPrototypeOf(sample).constructor,
  });

  function NativeImage() {
    const canvas = nativeApi.createOffscreenCanvas({ type: CONTEXT_KIND, width: 1, height: 1 });
    const image = canvas.createImage();
    Object.defineProperties(image, {
      naturalWidth: { get: () => image.width },
      naturalHeight: { get: () => image.height },
    });
    return image;
  }
  Object.defineProperty(host, "Image", { configurable: true, value: NativeImage });
  const imageDataContext = nativeApi
    .createOffscreenCanvas({ type: CONTEXT_KIND, width: 1, height: 1 })
    .getContext(CONTEXT_KIND);
  function NativeImageData(dataOrWidth, widthOrHeight, suppliedHeight) {
    const width = typeof dataOrWidth === "number" ? dataOrWidth : widthOrHeight;
    const height =
      typeof dataOrWidth === "number"
        ? widthOrHeight
        : (suppliedHeight ?? dataOrWidth.length / (width * 4));
    const data = imageDataContext.createImageData(width, height);
    if (typeof dataOrWidth !== "number") data.data.set(dataOrWidth);
    return data;
  }
  Object.defineProperty(host, "ImageData", { configurable: true, value: NativeImageData });

  function childrenChanged() {
    for (const element of document.querySelectorAll("canvas")) {
      const surface = surfaces.get(element);
      if (surface?.dirty) schedule(surface);
    }
  }
  document.documentElement.addEventListener("$$childNodesUpdate", childrenChanged);
  function dispose() {
    retired = true;
    document.createElement = originalCreateElement;
    document.documentElement.removeEventListener("$$childNodesUpdate", childrenChanged);
    host.removeEventListener("beforeunload", dispose);
    connected.clear();
    if (originalImage) {
      delete host.Image;
    }
  }
  host.addEventListener("beforeunload", dispose);
  return {
    flush: async () => {
      childrenChanged();
      await Promise.all(Array.from(connected, (entry) => present(entry)));
    },
    dispose,
  };
}
