export enum BrowserStorageErrorCode {
  Unavailable = "unavailable",
  Corrupt = "corrupt",
  Io = "io",
  Closed = "closed",
}

export class BrowserStorageError extends Error {
  constructor(
    public readonly code: BrowserStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrowserStorageError";
  }
}
