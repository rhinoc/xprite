import compressedAssets from "$/adapters/showcase/compressed-assets.json";

const GZIP_MAGIC = [0x1f, 0x8b] as const;
const VERSION_LENGTH = 12;

type CompressedAsset = keyof typeof compressedAssets.files;

/** Content version of an asset, for files that have no other revision in their URL. */
export function compressedAssetVersion(file: CompressedAsset): string {
  return compressedAssets.files[file].sha256.slice(0, VERSION_LENGTH);
}

const isGzip = (bytes: Uint8Array) =>
  bytes.length >= GZIP_MAGIC.length && GZIP_MAGIC.every((value, index) => bytes[index] === value);

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function download(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/**
 * Download the gzip copy of a showcase asset and inflate it in the browser, falling back to the
 * original file where DecompressionStream is missing or the copy cannot be read.
 */
export async function fetchCompressedAsset(
  root: string,
  file: CompressedAsset,
  version: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const original = `${root}${file}?v=${version}`;
  if (typeof DecompressionStream !== "function") return download(original, signal);
  try {
    const bytes = new Uint8Array(await download(`${root}${file}.gz?v=${version}`, signal));
    // A host that labels the copy with Content-Encoding has already inflated it.
    return isGzip(bytes) ? await inflate(bytes) : bytes.buffer;
  } catch (error) {
    signal.throwIfAborted();
    console.warn(`Loading the uncompressed ${file}`, error);
    return download(original, signal);
  }
}
