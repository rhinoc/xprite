export enum BrowserStorageErrorCode {
  Unavailable = "unavailable",
  Corrupt = "corrupt",
  Io = "io",
  Closed = "closed",
}

export class BrowserStorageError extends Error {
  readonly cause?: unknown;
  readonly diagnosticDetails?: Readonly<Record<string, unknown>>;

  constructor(
    public readonly code: BrowserStorageErrorCode,
    message: string,
    options: {
      cause?: unknown;
      diagnosticDetails?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = "BrowserStorageError";
    this.cause = options.cause;
    this.diagnosticDetails = options.diagnosticDetails;
  }
}
