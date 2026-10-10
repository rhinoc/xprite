export enum ToolFailureCategory {
  UnsupportedFormat = "unsupported_format",
  Decode = "decode",
  Preview = "preview",
  Encode = "encode",
  Handoff = "handoff",
  ExampleFetch = "example_fetch",
  Limit = "limit",
  Permission = "permission",
}

/** Classifies a browser workflow failure without sending its message to analytics. */
export class ToolOperationError extends Error {
  constructor(
    readonly category: ToolFailureCategory,
    message: string,
  ) {
    super(message);
  }
}
