import PortableURLSearchParams from "core-js-pure/actual/url-search-params/index.js";
import PortableURL from "core-js-pure/actual/url/index.js";
import { strToU8, strFromU8, zlibSync } from "fflate";

import { joinBytes } from "@xprite/bedrock/common/join-bytes";
import { encodeApng, pngScanlines } from "@xprite/editor-core/import-export";

const PNG_SIGNATURE_BYTES = 8;
const PNG_CHUNK_HEADER_BYTES = 12;
const GENERATED_FILES_DIRECTORY = "xprite-runtime";

/** Binary web objects remain in memory; object URLs are native sandbox files. */
export function installWechatBinaryRuntime(host, nativeApi) {
  const fs = nativeApi.getFileSystemManager();
  const directory = `${nativeApi.env.USER_DATA_PATH}/${GENERATED_FILES_DIRECTORY}`;
  try {
    fs.accessSync(directory);
  } catch {
    fs.mkdirSync(directory, true);
  }
  class NativeBlob {
    constructor(parts = [], options = {}) {
      const arrays = parts.map((part) =>
        part instanceof NativeBlob
          ? part.bytes
          : typeof part === "string"
            ? strToU8(part)
            : part instanceof ArrayBuffer
              ? new Uint8Array(part)
              : ArrayBuffer.isView(part)
                ? new Uint8Array(part.buffer, part.byteOffset, part.byteLength)
                : strToU8(String(part)),
      );
      this.bytes = joinBytes(arrays);
      this.size = this.bytes.length;
      this.type = String(options.type ?? "").toLowerCase();
    }
    async arrayBuffer() {
      return this.bytes.slice().buffer;
    }
    async text() {
      return strFromU8(this.bytes);
    }
    slice(start = 0, end = this.size, type = "") {
      const offset = start < 0 ? Math.max(0, this.size + start) : Math.min(start, this.size);
      const finish = end < 0 ? Math.max(0, this.size + end) : Math.min(end, this.size);
      return new NativeBlob([this.bytes.slice(offset, finish)], { type });
    }
  }
  class NativeFile extends NativeBlob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
    }
  }
  class NativeTextEncoder {
    encode(text = "") {
      return strToU8(String(text));
    }
  }
  class NativeTextDecoder {
    decode(bytes = new Uint8Array()) {
      return strFromU8(
        bytes instanceof ArrayBuffer
          ? new Uint8Array(bytes)
          : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      );
    }
  }
  const originalURL = host.URL;
  const files = new Set();
  function objectURL(blob) {
    if (!(blob instanceof NativeBlob)) throw new TypeError("Object URLs require a Blob");
    const extension =
      blob.type === "image/webp"
        ? "webp"
        : blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/gif"
            ? "gif"
            : "png";
    const path = `${directory}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    fs.writeFileSync(path, blob.bytes.slice().buffer);
    files.add(path);
    return path;
  }
  const URLConstructor = originalURL ?? PortableURL;
  if (URLConstructor) {
    URLConstructor.createObjectURL = objectURL;
    URLConstructor.revokeObjectURL = (path) => {
      if (files.delete(path)) {
        try {
          fs.unlinkSync(path);
        } catch {}
      }
    };
    Object.defineProperty(host, "URL", { configurable: true, value: URLConstructor });
  }
  Object.defineProperties(host, {
    Blob: { configurable: true, value: NativeBlob },
    File: { configurable: true, value: NativeFile },
    TextEncoder: { configurable: true, value: NativeTextEncoder },
    TextDecoder: { configurable: true, value: NativeTextDecoder },
    URLSearchParams: { configurable: true, value: PortableURLSearchParams },
    structuredClone: { configurable: true, value: cloneBinaryGraph },
  });
  return { Blob: NativeBlob, File: NativeFile, objectURL };
}

function cloneBinaryGraph(value, seen = new Map()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, content] of Object.entries(value)) copy[key] = cloneBinaryGraph(content, seen);
  return copy;
}

export function encodeWechatPng(pixels) {
  const encoded = encodeApng([{ pixels, duration: 100, sourceFrame: 0 }], 0, [
    zlibSync(pngScanlines({ pixels })),
  ]);
  const parts = [encoded.subarray(0, PNG_SIGNATURE_BYTES)];
  const reader = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  for (let offset = PNG_SIGNATURE_BYTES; offset < encoded.length;) {
    const size = reader.getUint32(offset);
    const name = String.fromCharCode(...encoded.subarray(offset + 4, offset + 8));
    if (name === "IHDR" || name === "IDAT" || name === "IEND")
      parts.push(encoded.subarray(offset, offset + size + PNG_CHUNK_HEADER_BYTES));
    offset += size + PNG_CHUNK_HEADER_BYTES;
  }
  return joinBytes(parts);
}
