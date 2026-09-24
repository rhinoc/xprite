export interface OpfsRequest {
  id: number;
  operation: "read" | "write" | "remove";
  key: string;
  namespace: string;
  bytes?: ArrayBuffer;
}

export type OpfsResponse =
  | { id: number; ok: true; bytes?: ArrayBuffer }
  | { id: number; ok: false; name: string; message: string };

interface SyncAccessHandle {
  write(buffer: ArrayBufferView, options?: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

type WritableFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<SyncAccessHandle>;
};

export async function writeSnapshot(file: WritableFileHandle, bytes: ArrayBuffer): Promise<void> {
  if (typeof file.createSyncAccessHandle === "function") {
    const access = await file.createSyncAccessHandle();
    try {
      const data = new Uint8Array(bytes);
      let offset = 0;
      while (offset < data.byteLength) {
        const written = access.write(data.subarray(offset), { at: offset });
        if (!Number.isInteger(written) || written <= 0 || written > data.byteLength - offset)
          throw new Error("OPFS write made invalid progress");
        offset += written;
      }
      access.truncate(data.byteLength);
      access.flush();
    } finally {
      access.close();
    }
    return;
  }
  if (typeof file.createWritable !== "function")
    throw new DOMException("OPFS writable handles are unavailable", "NotSupportedError");
  const writable = await file.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

const scope = globalThis as unknown as {
  navigator: Navigator;
  onmessage: ((event: MessageEvent<OpfsRequest>) => void) | null;
  postMessage(message: OpfsResponse, transfer?: Transferable[]): void;
};

async function perform(request: OpfsRequest): Promise<ArrayBuffer | undefined> {
  if (!/^[a-zA-Z0-9_-]+$/.test(request.key)) throw new TypeError("Invalid OPFS key");
  const root = await scope.navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(encodeURIComponent(request.namespace), {
    create: true,
  });
  if (request.operation === "remove") {
    await directory.removeEntry(request.key);
    return;
  }
  if (request.operation === "read") {
    const file = await directory.getFileHandle(request.key);
    return (await file.getFile()).arrayBuffer();
  }

  const write = async () => {
    try {
      await directory.getFileHandle(request.key);
      throw new DOMException("OPFS key already exists", "InvalidModificationError");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
    const file = await directory.getFileHandle(request.key, { create: true });
    await writeSnapshot(file, request.bytes!);
  };
  await scope.navigator.locks.request(
    `opfs-write:${encodeURIComponent(request.namespace)}:${request.key}`,
    write,
  );
}

scope.onmessage = (event) => {
  const request = event.data;
  void perform(request).then(
    (bytes) => {
      scope.postMessage({ id: request.id, ok: true, bytes }, bytes ? [bytes] : []);
    },
    (error) => {
      scope.postMessage({
        id: request.id,
        ok: false,
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
};
