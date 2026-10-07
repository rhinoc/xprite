import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";

const MAX_METADATA_BYTES = 2_048;
const BODY_TIMEOUT_MS = 30_000;
const CONTENT_LENGTH_PATTERN = /^\d+$/u;

/** Enforce actual streamed bytes, including absent/false Content-Length. */
export async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const encoding = request.headers.get("Content-Encoding");
  if (encoding && encoding !== "identity")
    throw new ShareError(
      ShareErrorCode.InvalidRequest,
      "Encoded request bodies are not supported.",
    );
  const length = request.headers.get("Content-Length");
  if (
    length !== null &&
    (!CONTENT_LENGTH_PATTERN.test(length) || !Number.isSafeInteger(Number(length)))
  )
    throw new ShareError(ShareErrorCode.InvalidRequest, "Invalid Content-Length.");
  if (length !== null && Number(length) > maximumBytes)
    throw new ShareError(ShareErrorCode.FileTooLarge, "The request exceeds its byte limit.");
  if (!request.body)
    throw new ShareError(ShareErrorCode.InvalidRequest, "A request body is required.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ShareError(ShareErrorCode.InvalidRequest, "The upload body timed out.")),
      BODY_TIMEOUT_MS,
    );
  });
  const consume = async () => {
    const bytes = new Uint8Array(maximumBytes);
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.byteLength > maximumBytes)
        throw new ShareError(ShareErrorCode.FileTooLarge, "The request exceeds its byte limit.");
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    if (length !== null && Number(length) !== size)
      throw new ShareError(
        ShareErrorCode.InvalidRequest,
        "Content-Length differs from the received body.",
      );
    return bytes.subarray(0, size);
  };
  try {
    // Race the whole read once, avoiding retained timeout callbacks per chunk.
    return await Promise.race([consume(), timeout]);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer!);
    // A timeout can leave a read pending until cancellation completes.
    try {
      reader.releaseLock();
    } catch {
      /* Cancellation owns the pending read. */
    }
  }
}

export async function readMetadata(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0]?.trim() !== "application/json")
    throw new ShareError(ShareErrorCode.InvalidRequest, "Expected application/json.");
  const bytes = await readBoundedBody(request, MAX_METADATA_BYTES);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new ShareError(ShareErrorCode.InvalidRequest, "Invalid JSON metadata.");
  }
}
