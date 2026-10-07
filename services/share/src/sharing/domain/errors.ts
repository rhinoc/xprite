export enum ShareErrorCode {
  InvalidRequest = "invalid_request",
  InvalidFile = "invalid_file",
  FileTooLarge = "file_too_large",
  Unauthorized = "unauthorized",
  NotFound = "not_found",
  Gone = "gone",
  Conflict = "conflict",
  IpCapacityExceeded = "ip_capacity_exceeded",
  StorageCapacityExceeded = "storage_capacity_exceeded",
  RateLimited = "rate_limited",
  Unavailable = "unavailable",
}

export class ShareError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShareError";
  }
}
